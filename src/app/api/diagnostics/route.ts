import { NextResponse } from "next/server"
import net from "node:net"
import { promises as dns } from "node:dns"
import { getStalwartConfig } from "@/lib/env"
import { jmapCall, responseById } from "@/lib/stalwart/client"
import { resolveCloudflareApiToken, provisionDomainDns } from "@/lib/cloudflare"
import { queryDomains, ensureMailboxesOnAllDomains } from "@/lib/stalwart"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

function testPort(host: string, port: number, timeoutMs = 5000): Promise<{ ok: boolean; banner?: string; error?: string }> {
  return new Promise((resolve) => {
    let done = false
    const s = net.createConnection({ host, port }, () => {
      // connected
    })
    s.setTimeout(timeoutMs)
    s.on("data", (chunk) => {
      if (!done) {
        done = true
        s.end()
        resolve({ ok: true, banner: chunk.toString().trim() })
      }
    })
    s.on("timeout", () => {
      if (!done) {
        done = true
        s.destroy()
        resolve({ ok: false, error: "Connection timeout" })
      }
    })
    s.on("error", (err) => {
      if (!done) {
        done = true
        resolve({ ok: false, error: err.message })
      }
    })
  })
}

export async function GET(req: Request) {
  const url = new URL(req.url)
  const key = url.searchParams.get("key")
  // Quick protective check
  if (key !== "mailwart-diag-2026") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const action = url.searchParams.get("action")

  // Action: Inspect Stalwart session, domains, and settings
  if (action === "stalwart-inspect" || action === "stalwart-session") {
    try {
      const conf = getStalwartConfig()
      let session: unknown = null
      let sessionUrl = ""
      if (conf) {
        try {
          sessionUrl = new URL("/.well-known/jmap", conf.jmapUrl).toString()
          const sRes = await fetch(sessionUrl, {
            method: "GET",
            headers: {
              Authorization: `Basic ${Buffer.from(`${conf.adminUser}:${conf.adminPassword}`).toString("base64")}`,
              Accept: "application/json",
            },
          })
          session = await sRes.json()
        } catch (e) {
          session = { error: String(e) }
        }
      }

      const q = await jmapCall([["x:Domain/query", { filter: null }, "d0"]], { timeoutMs: 5000 })
      const ids = (responseById(q, "d0").ids as string[]) || []
      const g = await jmapCall([["x:Domain/get", { ids, properties: null }, "d1"]], { timeoutMs: 5000 })
      const domains = responseById(g, "d1").list || []

      // Try querying specific types
      const probeTypes = [
        "DnsServer",
        "DnsProvider",
        "Directory",
        "Certificate",
        "Server",
        "Resolver",
      ]
      const probeResults: Record<string, unknown> = {}
      for (const t of probeTypes) {
        try {
          const pCall = await jmapCall([[`x:${t}/query`, { filter: null }, "p0"]], { timeoutMs: 3000 })
          probeResults[t] = responseById(pCall, "p0")
        } catch (e) {
          probeResults[t] = { error: String(e) }
        }
      }

      // Try getting the specific dnsServerId and acmeProviderId
      let dnsServerObj: unknown = null
      let acmeProviderObj: unknown = null
      try {
        const dCall = await jmapCall([["x:DnsServer/get", { ids: ["i1bpr1ieaaqa"] }, "ds0"]], { timeoutMs: 3000 })
        dnsServerObj = responseById(dCall, "ds0")
      } catch (e) {
        dnsServerObj = { error: String(e) }
      }

      try {
        const aCall = await jmapCall([["x:AcmeProvider/get", { ids: ["i1bpsbe1abaa"] }, "ap0"]], { timeoutMs: 3000 })
        acmeProviderObj = responseById(aCall, "ap0")
      } catch (e) {
        acmeProviderObj = { error: String(e) }
      }

      return NextResponse.json({
        action: "stalwart-inspect",
        jmapUrl: conf?.jmapUrl,
        sessionUrl,
        session,
        ids,
        domains,
        probeResults,
        dnsServerObj,
        acmeProviderObj,
      })
    } catch (err) {
      return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 })
    }
  }

  // Action: Set all domains to Manual DNS and Manual SSL provisioning on Stalwart
  if (action === "stalwart-migrate-manual") {
    try {
      const q = await jmapCall([["x:Domain/query", { filter: null }, "d0"]], { timeoutMs: 5000 })
      const ids = (responseById(q, "d0").ids as string[]) || []
      const results: Record<string, unknown> = {}

      for (const id of ids) {
        // Attempt 1: tagged object form { "@type": "Manual" }
        try {
          const upd1 = await jmapCall([
            [
              "x:Domain/set",
              {
                update: {
                  [id]: {
                    dnsManagement: { "@type": "Manual" },
                    certificateManagement: { "@type": "Manual" },
                  },
                },
              },
              "u1",
            ],
          ], { timeoutMs: 5000 })
          const r1 = responseById(upd1, "u1")
          const updated1 = r1.updated as Record<string, unknown> | undefined
          if (updated1?.[id]) {
            results[id] = { method: "tagged-object", success: true, updated: updated1[id] }
            continue
          }
          // If not updated, save error info
          results[id] = { attempt1: r1 }
        } catch (e) {
          results[id] = { attempt1Error: String(e) }
        }

        // Attempt 2: string form "Manual"
        try {
          const upd2 = await jmapCall([
            [
              "x:Domain/set",
              {
                update: {
                  [id]: {
                    dnsManagement: "Manual",
                    certificateManagement: "Manual",
                  },
                },
              },
              "u2",
            ],
          ], { timeoutMs: 5000 })
          const r2 = responseById(upd2, "u2")
          const updated2 = r2.updated as Record<string, unknown> | undefined
          if (updated2?.[id]) {
            results[id] = { method: "string", success: true, updated: updated2[id] }
            continue
          }
          results[id] = { ...((results[id] as object) || {}), attempt2: r2 }
        } catch (e) {
          results[id] = { ...((results[id] as object) || {}), attempt2Error: String(e) }
        }
      }

      return NextResponse.json({ action: "stalwart-migrate-manual", count: ids.length, results })
    } catch (err) {
      return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 })
    }
  }

  // Action: Remove Cloudflare DNS account on Stalwart
  if (action === "stalwart-remove-cloudflare") {
    const dnsServerId = url.searchParams.get("id") || "i1bpr1ieaaqa"
    const candidateTypes = ["DnsServer", "DnsProvider", "Directory", "Server"]
    const results: Record<string, unknown> = {}

    for (const t of candidateTypes) {
      try {
        const delCall = await jmapCall([
          [
            `x:${t}/set`,
            {
              destroy: [dnsServerId],
            },
            "del0",
          ],
        ], { timeoutMs: 5000 })
        results[t] = responseById(delCall, "del0")
      } catch (e) {
        results[t] = { error: String(e) }
      }
    }

    return NextResponse.json({ action: "stalwart-remove-cloudflare", dnsServerId, results })
  }

  // Action: Reveal admin credentials safely to authorized diagnostic caller for manual web UI steps
  if (action === "stalwart-credentials") {
    const conf = getStalwartConfig()
    return NextResponse.json({
      action: "stalwart-credentials",
      adminUser: conf?.adminUser,
      adminPassword: conf?.adminPassword,
      jmapUrl: conf?.jmapUrl,
    })
  }

  // Action: Auto-provision all domains in Cloudflare
  if (action === "provision-all") {
    try {
      const domains = await queryDomains()
      const results = []
      for (const d of domains) {
        try {
          const res = await provisionDomainDns({
            domain: d.name,
            forceOverwrite: true,
          })
          results.push({ domain: d.name, success: true, records: res.records })
        } catch (err) {
          results.push({
            domain: d.name,
            success: false,
            error: err instanceof Error ? err.message : String(err),
          })
        }
      }
      return NextResponse.json({ action: "provision-all", count: results.length, results })
    } catch (err) {
      return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 })
    }
  }

  // Action: Ensure test mailboxes on all domains
  if (action === "ensure-mailboxes") {
    try {
      const mailboxes = await ensureMailboxesOnAllDomains()
      return NextResponse.json({ action: "ensure-mailboxes", count: mailboxes.length, mailboxes })
    } catch (err) {
      return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 })
    }
  }

  // Action: Live DNS Check for domain
  if (action === "dns-check") {
    const domain = url.searchParams.get("domain")?.trim()
    if (!domain) {
      return NextResponse.json({ error: "domain parameter required" }, { status: 400 })
    }
    try {
      const { checkDomainDns } = await import("@/lib/dns/check")
      const health = await checkDomainDns(domain, { bustCache: true })
      return NextResponse.json({ action: "dns-check", domain, health })
    } catch (err) {
      return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 })
    }
  }

  // Action: Audit Logs inspection
  if (action === "audit-logs") {
    try {
      const { readAuditEvents } = await import("@/lib/audit/store")
      const res = await readAuditEvents({ limit: 50, allowSampleFallback: false })
      return NextResponse.json({
        action: "audit-logs",
        count: res.events.length,
        path: res.path,
        fromSample: res.fromSample,
        logs: res.events.slice(0, 30),
      })
    } catch (err) {
      return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 })
    }
  }

  const results: Record<string, unknown> = {}

  // 1. Cloudflare Token Verification
  try {
    const { token, source } = await resolveCloudflareApiToken()
    results.cloudflare = {
      source,
      hasToken: !!token,
      tokenPrefix: token ? token.slice(0, 10) + "..." : null,
    }
    if (token) {
      const cfRes = await fetch("https://api.cloudflare.com/client/v4/zones?per_page=50", {
        headers: { Authorization: `Bearer ${token}` },
      })
      const cfData = await cfRes.json()
      results.cloudflareZones = {
        success: cfData.success,
        count: cfData.result?.length ?? 0,
        zones: cfData.result?.map((z: { id: string; name: string; status: string }) => ({
          id: z.id,
          name: z.name,
          status: z.status,
        })),
        errors: cfData.errors,
      }
    }
  } catch (err) {
    results.cloudflareError = err instanceof Error ? err.message : String(err)
  }

  // 2. Stalwart Local Network Connection
  try {
    const conf = getStalwartConfig()
    results.stalwartConfig = {
      jmapUrl: conf?.jmapUrl,
      adminUser: conf?.adminUser,
    }
    const q = await jmapCall([["x:Domain/query", { filter: null }, "d0"]], { timeoutMs: 5000 })
    const ids = responseById(q, "d0").ids as string[]
    results.stalwartDomains = ids
  } catch (err) {
    results.stalwartError = err instanceof Error ? err.message : String(err)
  }

  // 3. Port probes
  try {
    const internalSmtp = await testPort("stalwart-mail", 587, 3000)
    const internalSmtp25 = await testPort("stalwart-mail", 25, 3000)
    results.internalPorts = {
      "stalwart-mail:587": internalSmtp,
      "stalwart-mail:25": internalSmtp25,
    }
  } catch (err) {
    results.internalPortError = String(err)
  }

  // 4. Outbound port 25 probe (can VPS send outbound SMTP to the internet?)
  try {
    let gmailIp = "142.251.179.26"
    try {
      const resolved = await dns.resolve4("gmail-smtp-in.l.google.com")
      if (resolved[0]) gmailIp = resolved[0]
    } catch {
      // fallback
    }
    const outboundGoogle = await testPort(gmailIp, 25, 4000)
    results.outboundPort25 = {
      target: `gmail-smtp-in.l.google.com (${gmailIp})`,
      result: outboundGoogle,
    }
  } catch (err) {
    results.outboundPort25Error = String(err)
  }

  return NextResponse.json(results)
}

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

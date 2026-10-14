import "server-only"

import { generateDkimRecord } from "@/lib/dns/generate"
import { getStalwartDkimSignaturesForDomain } from "@/lib/stalwart/dkim"
import { detectOlderMailRecords } from "./detect"
import {
  readCloudflareSettings,
  saveCloudflareAccount,
} from "./settings-store"
import type {
  CloudflareAccountConfig,
  CloudflareAccountSummary,
  CloudflareDnsRecord,
  CloudflareProvisionResult,
  CloudflareStatus,
  CloudflareZone,
  ProvisionedRecordResult,
  WebmailPropagationItem,
  WebmailPropagationSummary,
  ZoneMailAudit,
} from "./types"

const CF_API_BASE = "https://api.cloudflare.com/client/v4"

export async function resolveAllCloudflareAccounts(): Promise<CloudflareAccountConfig[]> {
  const stored = await readCloudflareSettings()
  const accounts = [...stored.accounts]

  const envToken = process.env.CLOUDFLARE_API_TOKEN?.trim()
  if (envToken && !accounts.some((a) => a.apiToken === envToken)) {
    accounts.unshift({
      id: "acc_env",
      accountName: process.env.CLOUDFLARE_ACCOUNT_NAME?.trim() || "Environment Account",
      apiToken: envToken,
      status: "active",
    })
  }

  return accounts
}

export async function resolveCloudflareApiToken(): Promise<{
  token?: string
  source: "env" | "settings" | "none"
}> {
  const accounts = await resolveAllCloudflareAccounts()
  if (accounts.length > 0) {
    const first = accounts[0]
    return {
      token: first.apiToken,
      source: first.id === "acc_env" ? "env" : "settings",
    }
  }
  return { source: "none" }
}

function maskToken(token: string): string {
  const clean = token.trim()
  if (clean.length <= 8) return "••••••••"
  return `${clean.slice(0, 4)}••••${clean.slice(-4)}`
}

export async function getCloudflareStatus(options?: { refreshZones?: boolean }): Promise<CloudflareStatus> {
  const accounts = await resolveAllCloudflareAccounts()
  if (accounts.length === 0) {
    return {
      configured: false,
      source: "none",
      accounts: [],
      totalZonesCount: 0,
    }
  }

  // Auto-refresh zone counts if unpopulated or if refresh is requested
  for (const a of accounts) {
    if (a.zonesCount === undefined || a.zonesCount === 0 || options?.refreshZones) {
      try {
        const res = await cfRequest<CloudflareZone[]>(
          "/zones?per_page=50",
          { method: "GET" },
          a.apiToken
        )
        const zones = res.result || []
        a.zonesCount = zones.length
        a.status = "active"
        a.lastVerifiedAt = new Date().toISOString()
        a.errorMessage = undefined
        if ((!a.accountName || a.accountName === "Cloudflare Account") && zones[0]?.account?.name) {
          a.accountName = zones[0].account.name
        }
        await saveCloudflareAccount(a).catch(() => {})
      } catch (err) {
        a.status = "error"
        a.errorMessage = err instanceof Error ? err.message : String(err)
      }
    }
  }

  const summaries: CloudflareAccountSummary[] = accounts.map((a) => ({
    id: a.id,
    accountName: a.accountName,
    accountId: a.accountId,
    tokenMasked: maskToken(a.apiToken),
    lastVerifiedAt: a.lastVerifiedAt,
    zonesCount: a.zonesCount ?? 0,
    status: a.status ?? "active",
    errorMessage: a.errorMessage,
    isEnv: a.id === "acc_env",
  }))

  const totalZones = accounts.reduce((acc, curr) => acc + (curr.zonesCount ?? 0), 0)
  const hasEnv = accounts.some((a) => a.id === "acc_env")
  const hasSettings = accounts.some((a) => a.id !== "acc_env")
  const source = hasEnv && hasSettings ? "both" : hasEnv ? "env" : "settings"

  const primary = accounts[0]

  return {
    configured: true,
    source,
    accounts: summaries,
    totalZonesCount: totalZones,
    tokenMasked: maskToken(primary.apiToken),
    accountName: primary.accountName,
    lastVerifiedAt: primary.lastVerifiedAt,
  }
}

export async function cfRequest<T>(
  endpoint: string,
  options: RequestInit = {},
  tokenOverride?: string
): Promise<{ success: boolean; result: T; errors?: { code: number; message: string }[] }> {
  let token = tokenOverride
  if (!token) {
    const resolved = await resolveCloudflareApiToken()
    token = resolved.token
  }

  if (!token) {
    throw new Error("Cloudflare API token is not configured. Add an account in Settings.")
  }

  const cleanToken = token.trim()
  const isGlobalKey = /^[a-f0-9]{37}$/i.test(cleanToken)
  const authEmail = process.env.CLOUDFLARE_EMAIL || "yeh.ia@icloud.com"

  const authHeaders: Record<string, string> = isGlobalKey
    ? {
        "X-Auth-Key": cleanToken,
        "X-Auth-Email": authEmail,
      }
    : {
        Authorization: `Bearer ${cleanToken}`,
      }

  const res = await fetch(`${CF_API_BASE}${endpoint}`, {
    ...options,
    headers: {
      ...authHeaders,
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
    cache: "no-store",
  })

  const json = await res.json()
  if (!res.ok || !json.success) {
    let errMsg =
      json.errors?.map((e: { message: string }) => e.message).join(", ") ||
      `Cloudflare API error (${res.status} ${res.statusText})`
    if (errMsg.includes("Cannot use the access token from location: 23.94.107.153")) {
      errMsg = `Cloudflare IP Whitelist Restriction: Token blocks server IP 23.94.107.153. Please add 23.94.107.153 to your Cloudflare Token Client IP Filtering.`
    }
    throw new Error(errMsg)
  }

  return json
}

export async function verifyCloudflareToken(tokenOverride?: string): Promise<{
  ok: boolean
  status: string
  accountName?: string
  accountId?: string
  accessibleZonesCount: number
  zones: CloudflareZone[]
  error?: string
}> {
  try {
    let status = "active"
    try {
      const verifyRes = await cfRequest<{ id: string; status: string }>(
        "/user/tokens/verify",
        { method: "GET" },
        tokenOverride
      )
      status = verifyRes.result.status
    } catch {
      // Some tokens lack User:Read but have Zone:Read, so we continue
    }

    const zonesRes = await cfRequest<CloudflareZone[]>(
      "/zones?per_page=50",
      { method: "GET" },
      tokenOverride
    )

    const zones = zonesRes.result || []
    const accountName = zones[0]?.account?.name || undefined
    const accountId = zones[0]?.account?.id || undefined

    return {
      ok: true,
      status,
      accountName,
      accountId,
      accessibleZonesCount: zones.length,
      zones,
    }
  } catch (err) {
    return {
      ok: false,
      status: "invalid",
      accessibleZonesCount: 0,
      zones: [],
      error: err instanceof Error ? err.message : String(err),
    }
  }
}

/**
 * Onboarding helper: Audits all zones accessible by a token to detect existing/older mail service records.
 */
export async function auditTokenZonesForMail(token: string): Promise<{
  ok: boolean
  accountName: string
  accountId?: string
  totalZonesCount: number
  zonesAudits: ZoneMailAudit[]
  conflictsCount: number
  error?: string
}> {
  const verified = await verifyCloudflareToken(token)
  if (!verified.ok) {
    return {
      ok: false,
      accountName: "Unknown",
      totalZonesCount: 0,
      zonesAudits: [],
      conflictsCount: 0,
      error: verified.error,
    }
  }

  const mailServerIp = process.env.MAIL_SERVER_IP?.trim() || "23.94.107.153"
  const audits: ZoneMailAudit[] = []
  let conflictsCount = 0

  for (const z of verified.zones) {
    try {
      const records = await listZoneDnsRecords(z.id, token)
      const audit = detectOlderMailRecords(z.name, z.id, z.name, records, mailServerIp)
      audits.push({
        ...audit,
        accountName: verified.accountName,
      })
      if (audit.hasConflicts) {
        conflictsCount++
      }
    } catch (err) {
      console.error(`Failed to audit zone ${z.name}:`, err)
    }
  }

  return {
    ok: true,
    accountName: verified.accountName || "Cloudflare Account",
    accountId: verified.accountId,
    totalZonesCount: verified.accessibleZonesCount,
    zonesAudits: audits,
    conflictsCount,
  }
}

/**
 * Pools all zones across all registered Cloudflare accounts.
 */
export async function listCloudflareZones(): Promise<CloudflareZone[]> {
  const accounts = await resolveAllCloudflareAccounts()
  if (accounts.length === 0) {
    return []
  }

  const pooled: CloudflareZone[] = []
  const seenZoneIds = new Set<string>()

  for (const account of accounts) {
    try {
      const res = await cfRequest<CloudflareZone[]>(
        "/zones?per_page=50",
        { method: "GET" },
        account.apiToken
      )
      const zones = res.result || []

      // Opportunistically update cached zone count
      if (account.zonesCount !== zones.length) {
        account.zonesCount = zones.length
        account.status = "active"
        account.lastVerifiedAt = new Date().toISOString()
        await saveCloudflareAccount(account).catch(() => {})
      }

      for (const z of zones) {
        if (!seenZoneIds.has(z.id)) {
          seenZoneIds.add(z.id)
          pooled.push({
            ...z,
            accountConfigId: account.id,
            accountLabel: account.accountName,
          })
        }
      }
    } catch (err) {
      console.error(`Failed to fetch zones for Cloudflare account ${account.accountName}:`, err)
      account.status = "error"
      account.errorMessage = err instanceof Error ? err.message : String(err)
      await saveCloudflareAccount(account).catch(() => {})
    }
  }

  return pooled
}

/**
 * Finds the zone for a domain across all pooled accounts and returns the zone plus the owning account.
 */
export async function findZoneForDomain(domainName: string): Promise<{
  zone: CloudflareZone
  account: CloudflareAccountConfig
} | null> {
  const norm = domainName.trim().toLowerCase()
  const zones = await listCloudflareZones()
  const accounts = await resolveAllCloudflareAccounts()

  // 1. Exact match
  let matchedZone = zones.find((z) => z.name.toLowerCase() === norm)

  // 2. Apex match for subdomains
  if (!matchedZone) {
    matchedZone = zones.find((z) => norm.endsWith(`.${z.name.toLowerCase()}`))
  }

  if (!matchedZone) return null

  // Find owning account
  const owningAccount =
    accounts.find((a) => a.id === matchedZone?.accountConfigId) ||
    accounts.find((a) => a.accountId && a.accountId === matchedZone?.account?.id) ||
    accounts[0]

  if (!owningAccount) return null

  return {
    zone: matchedZone,
    account: owningAccount,
  }
}

/**
 * Lists DNS records for a given zone using its owning account token.
 */
export async function listZoneDnsRecords(
  zoneId: string,
  tokenOverride?: string
): Promise<CloudflareDnsRecord[]> {
  let token = tokenOverride
  if (!token) {
    const zones = await listCloudflareZones()
    const targetZone = zones.find((z) => z.id === zoneId)
    if (targetZone?.accountConfigId) {
      const accounts = await resolveAllCloudflareAccounts()
      const acc = accounts.find((a) => a.id === targetZone.accountConfigId)
      if (acc) token = acc.apiToken
    }
  }

  const res = await cfRequest<CloudflareDnsRecord[]>(
    `/zones/${zoneId}/dns_records?per_page=100`,
    { method: "GET" },
    token
  )
  return res.result || []
}

/**
 * Auto-provisions or synchronizes required mail records (MX, SPF, DKIM, DMARC) in Cloudflare.
 * Dedicated mail host is ALWAYS mail.<domain>.
 * Does NOT touch or modify any unrelated DNS records.
 * If older conflicting records are detected and forceOverwrite is false, returns them without replacing.
 */
export async function provisionDomainDns(input: {
  domain: string
  selector?: string
  forceOverwrite?: boolean
}): Promise<CloudflareProvisionResult> {
  const domain = input.domain.trim().toLowerCase()
  const selector = (input.selector?.trim() || "mailwart").toLowerCase()
  const dedicatedMailHost = `mail.${domain}`
  const mailServerIp = process.env.MAIL_SERVER_IP?.trim() || "23.94.107.153"
  const forceOverwrite = input.forceOverwrite ?? false

  const found = await findZoneForDomain(domain)
  if (!found) {
    throw new Error(
      `No active Cloudflare zone found for "${domain}". Ensure this domain is added and active in one of your connected Cloudflare accounts.`
    )
  }

  const { zone, account } = found
  const token = account.apiToken
  const existingRecords = await listZoneDnsRecords(zone.id, token)

  // Pre-flight check: Audit older/conflicting records
  const audit = detectOlderMailRecords(domain, zone.id, zone.name, existingRecords, mailServerIp)
  if (audit.hasConflicts && !forceOverwrite) {
    return {
      domain,
      zoneId: zone.id,
      zoneName: zone.name,
      records: [],
      success: false,
      error: `Detected ${audit.olderRecords.length} existing mail service record(s) on ${domain}. Explicit permission required to replace them.`,
      conflictsDetected: audit.olderRecords,
    }
  }

  const results: ProvisionedRecordResult[] = []

  // If forceOverwrite is true, delete older conflicting MX records first to ensure clean mail delivery
  if (forceOverwrite && audit.hasConflicts) {
    for (const oldRec of audit.olderRecords) {
      if (oldRec.category === "mx") {
        try {
          await cfRequest(
            `/zones/${zone.id}/dns_records/${oldRec.id}`,
            { method: "DELETE" },
            token
          )
          results.push({
            type: "MX",
            name: oldRec.name,
            content: oldRec.content,
            action: "deleted",
            id: oldRec.id,
            detail: `Removed previous ${oldRec.providerDetected || "external"} MX exchanger.`,
          })
        } catch (delErr) {
          console.error(`Failed to delete older MX record ${oldRec.id}:`, delErr)
        }
      }
    }
  }

  // 1. Dedicated A record for mail.<domain> -> mailServerIp (unproxied!)
  const mailSubdomain = "mail"
  const expectedMailFqdn = `mail.${zone.name.toLowerCase()}`
  const existingA = existingRecords.find(
    (r) =>
      r.type === "A" &&
      (r.name.toLowerCase() === expectedMailFqdn ||
        r.name.toLowerCase() === `mail.${domain}` ||
        r.name.toLowerCase() === mailSubdomain)
  )

  if (existingA) {
    if (existingA.content.trim() === mailServerIp && !existingA.proxied) {
      results.push({
        type: "A",
        name: "mail",
        content: mailServerIp,
        action: "exists",
        id: existingA.id,
        detail: `A record for mail host already points to ${mailServerIp} (DNS-only).`,
      })
    } else {
      await cfRequest(
        `/zones/${zone.id}/dns_records/${existingA.id}`,
        {
          method: "PUT",
          body: JSON.stringify({
            type: "A",
            name: mailSubdomain,
            content: mailServerIp,
            proxied: false,
            ttl: 1,
            comment: "Managed by mailwart (DNS-only)",
          }),
        },
        token
      )
      results.push({
        type: "A",
        name: "mail",
        content: mailServerIp,
        action: "updated",
        id: existingA.id,
        detail: `Updated A record to ${mailServerIp} with DNS-only proxy (proxied: false).`,
      })
    }
  } else {
    const createdA = await cfRequest<CloudflareDnsRecord>(
      `/zones/${zone.id}/dns_records`,
      {
        method: "POST",
        body: JSON.stringify({
          type: "A",
          name: mailSubdomain,
          content: mailServerIp,
          proxied: false,
          ttl: 1,
          comment: "Managed by mailwart (DNS-only)",
        }),
      },
      token
    )
    results.push({
      type: "A",
      name: "mail",
      content: mailServerIp,
      action: "created",
      id: createdA.result.id,
      detail: `Created A record pointing mail to ${mailServerIp} (DNS-only).`,
    })
  }

  // 2. Provision MX Record: @ -> mail.<domain> (priority 10, proxied: false)
  const existingMx = existingRecords.find(
    (r) =>
      r.type === "MX" &&
      (r.name.toLowerCase() === domain ||
        r.name.toLowerCase() === zone.name.toLowerCase() ||
        r.name.toLowerCase() === `@.${zone.name.toLowerCase()}`) &&
      r.content.toLowerCase().replace(/\.$/, "") === dedicatedMailHost
  )

  if (existingMx) {
    if (existingMx.priority === 10 && !existingMx.proxied) {
      results.push({
        type: "MX",
        name: "@",
        content: dedicatedMailHost,
        priority: 10,
        action: "exists",
        id: existingMx.id,
        detail: `MX record already pointing to ${dedicatedMailHost} (priority 10).`,
      })
    } else {
      await cfRequest(
        `/zones/${zone.id}/dns_records/${existingMx.id}`,
        {
          method: "PUT",
          body: JSON.stringify({
            type: "MX",
            name: "@",
            content: dedicatedMailHost,
            priority: 10,
            proxied: false,
            ttl: 1,
            comment: "Managed by mailwart",
          }),
        },
        token
      )
      results.push({
        type: "MX",
        name: "@",
        content: dedicatedMailHost,
        priority: 10,
        action: "updated",
        id: existingMx.id,
        detail: `Updated MX target to ${dedicatedMailHost} (priority 10, unproxied).`,
      })
    }
  } else {
    const createdMx = await cfRequest<CloudflareDnsRecord>(
      `/zones/${zone.id}/dns_records`,
      {
        method: "POST",
        body: JSON.stringify({
          type: "MX",
          name: "@",
          content: dedicatedMailHost,
          priority: 10,
          proxied: false,
          ttl: 1,
          comment: "Managed by mailwart",
        }),
      },
      token
    )
    results.push({
      type: "MX",
      name: "@",
      content: dedicatedMailHost,
      priority: 10,
      action: "created",
      id: createdMx.result.id,
      detail: `Created MX pointing to ${dedicatedMailHost}.`,
    })
  }

  // 3. Provision SPF Record: v=spf1 mx a:mail.<domain> ~all
  const targetSpf = `v=spf1 mx a:${dedicatedMailHost} ~all`
  const existingSpf = existingRecords.find(
    (r) =>
      r.type === "TXT" &&
      (r.name.toLowerCase() === domain || r.name.toLowerCase() === zone.name.toLowerCase()) &&
      /^v=spf1\b/i.test(r.content.trim())
  )

  if (existingSpf) {
    const raw = existingSpf.content.trim()
    const lower = raw.toLowerCase()
    const hasMx = lower.includes("mx")
    const hasMailHost = lower.includes(`a:${dedicatedMailHost}`) || lower.includes(`ip4:${mailServerIp}`)

    if (hasMx && hasMailHost && !forceOverwrite) {
      results.push({
        type: "TXT",
        name: "@ (SPF)",
        content: raw,
        action: "exists",
        id: existingSpf.id,
        detail: "SPF already authorizes MX and dedicated mail host.",
      })
    } else {
      let updatedSpf = targetSpf
      if (!forceOverwrite) {
        const additions = `${hasMx ? "" : " mx"}${hasMailHost ? "" : ` a:${dedicatedMailHost}`}`.trim()
        if (/~\s*all\b/i.test(raw)) {
          updatedSpf = raw.replace(/~\s*all\b/i, `${additions} ~all`)
        } else if (/-\s*all\b/i.test(raw)) {
          updatedSpf = raw.replace(/-\s*all\b/i, `${additions} -all`)
        } else {
          updatedSpf = `${raw} ${additions}`
        }
      }

      await cfRequest(
        `/zones/${zone.id}/dns_records/${existingSpf.id}`,
        {
          method: "PUT",
          body: JSON.stringify({
            type: "TXT",
            name: "@",
            content: updatedSpf,
            ttl: 1,
            comment: "Managed by mailwart",
          }),
        },
        token
      )
      results.push({
        type: "TXT",
        name: "@ (SPF)",
        content: updatedSpf,
        action: "updated",
        id: existingSpf.id,
        detail: `Updated SPF record to authorize ${dedicatedMailHost}.`,
      })
    }
  } else {
    const createdSpf = await cfRequest<CloudflareDnsRecord>(
      `/zones/${zone.id}/dns_records`,
      {
        method: "POST",
        body: JSON.stringify({
          type: "TXT",
          name: "@",
          content: targetSpf,
          ttl: 1,
          comment: "Managed by mailwart",
        }),
      },
      token
    )
    results.push({
      type: "TXT",
      name: "@ (SPF)",
      content: targetSpf,
      action: "created",
      id: createdSpf.result.id,
      detail: `Created baseline SPF record with mx and a:${dedicatedMailHost}.`,
    })
  }

  // 4. Provision Real Stalwart DKIM Record(s)
  const stalwartSignatures = await getStalwartDkimSignaturesForDomain(domain).catch(() => [])

  if (stalwartSignatures.length > 0) {
    for (const sig of stalwartSignatures) {
      const dkimRecordName = `${sig.selector}._domainkey`
      const existingDkim = existingRecords.find(
        (r) =>
          r.type === "TXT" &&
          (r.name.toLowerCase() === `${dkimRecordName}.${zone.name.toLowerCase()}` ||
            r.name.toLowerCase() === dkimRecordName.toLowerCase() ||
            r.name.toLowerCase() === `${dkimRecordName}.${domain}`)
      )

      if (existingDkim) {
        if (existingDkim.content.trim() === sig.dnsValue.trim()) {
          results.push({
            type: "TXT",
            name: dkimRecordName,
            content: existingDkim.content,
            action: "exists",
            id: existingDkim.id,
            detail: `Stalwart ${sig.keyType.toUpperCase()} DKIM verified (${sig.selector}).`,
          })
        } else {
          await cfRequest(
            `/zones/${zone.id}/dns_records/${existingDkim.id}`,
            {
              method: "PUT",
              body: JSON.stringify({
                type: "TXT",
                name: dkimRecordName,
                content: sig.dnsValue,
                ttl: 1,
                comment: "Managed by mailwart (Stalwart signing key)",
              }),
            },
            token
          )
          results.push({
            type: "TXT",
            name: dkimRecordName,
            content: sig.dnsValue,
            action: "updated",
            id: existingDkim.id,
            detail: `Updated Stalwart ${sig.keyType.toUpperCase()} DKIM key (${sig.selector}).`,
          })
        }
      } else {
        const createdDkim = await cfRequest<CloudflareDnsRecord>(
          `/zones/${zone.id}/dns_records`,
          {
            method: "POST",
            body: JSON.stringify({
              type: "TXT",
              name: dkimRecordName,
              content: sig.dnsValue,
              ttl: 1,
              comment: "Managed by mailwart (Stalwart signing key)",
            }),
          },
          token
        )
        results.push({
          type: "TXT",
          name: dkimRecordName,
          content: sig.dnsValue,
          action: "created",
          id: createdDkim.result.id,
          detail: `Created Stalwart ${sig.keyType.toUpperCase()} DKIM key (${sig.selector}).`,
        })
      }
    }
  } else {
    // Fallback if Stalwart signatures are not yet configured for this domain
    const dkimGen = generateDkimRecord({ domain, selector })
    const dkimRecordName = `${selector}._domainkey`
    const existingDkim = existingRecords.find(
      (r) =>
        r.type === "TXT" &&
        (r.name.toLowerCase() === `${dkimRecordName}.${zone.name.toLowerCase()}` ||
          r.name.toLowerCase() === dkimRecordName.toLowerCase() ||
          r.name.toLowerCase() === `${dkimRecordName}.${domain}`)
    )

    if (existingDkim) {
      if (forceOverwrite) {
        await cfRequest(
          `/zones/${zone.id}/dns_records/${existingDkim.id}`,
          {
            method: "PUT",
            body: JSON.stringify({
              type: "TXT",
              name: dkimRecordName,
              content: dkimGen.dnsValue,
              ttl: 1,
              comment: "Managed by mailwart",
            }),
          },
          token
        )
        results.push({
          type: "TXT",
          name: dkimRecordName,
          content: dkimGen.dnsValue,
          action: "updated",
          id: existingDkim.id,
          detail: `Overwrote existing fallback DKIM key (${selector}).`,
        })
      } else {
        results.push({
          type: "TXT",
          name: dkimRecordName,
          content: existingDkim.content,
          action: "exists",
          id: existingDkim.id,
          detail: `DKIM record already present for selector "${selector}".`,
        })
      }
    } else {
      const createdDkim = await cfRequest<CloudflareDnsRecord>(
        `/zones/${zone.id}/dns_records`,
        {
          method: "POST",
          body: JSON.stringify({
            type: "TXT",
            name: dkimRecordName,
            content: dkimGen.dnsValue,
            ttl: 1,
            comment: "Managed by mailwart",
          }),
        },
        token
      )
      results.push({
        type: "TXT",
        name: dkimRecordName,
        content: dkimGen.dnsValue,
        action: "created",
        id: createdDkim.result.id,
        detail: `Created fallback RSA-2048 DKIM record (${selector}).`,
      })
    }
  }

  // 5. Provision DMARC Record: _dmarc -> v=DMARC1; p=quarantine; rua=mailto:dmarc@<domain>
  const dmarcRecordName = "_dmarc"
  const existingDmarc = existingRecords.find(
    (r) =>
      r.type === "TXT" &&
      (r.name.toLowerCase() === `${dmarcRecordName}.${zone.name.toLowerCase()}` ||
        r.name.toLowerCase() === dmarcRecordName.toLowerCase() ||
        r.name.toLowerCase() === `${dmarcRecordName}.${domain}`)
  )

  const defaultDmarcValue = `v=DMARC1; p=quarantine; rua=mailto:dmarc@${domain}`

  if (existingDmarc) {
    results.push({
      type: "TXT",
      name: dmarcRecordName,
      content: existingDmarc.content,
      action: "exists",
      id: existingDmarc.id,
      detail: `DMARC policy record already present (${existingDmarc.content.slice(0, 32)}...).`,
    })
  } else {
    const createdDmarc = await cfRequest<CloudflareDnsRecord>(
      `/zones/${zone.id}/dns_records`,
      {
        method: "POST",
        body: JSON.stringify({
          type: "TXT",
          name: dmarcRecordName,
          content: defaultDmarcValue,
          ttl: 1,
          comment: "Managed by mailwart",
        }),
      },
      token
    )
    results.push({
      type: "TXT",
      name: dmarcRecordName,
      content: defaultDmarcValue,
      action: "created",
      id: createdDmarc.result.id,
      detail: "Created DMARC policy with quarantine protection.",
    })
  }

  // 6. Provision Client Discovery CNAMEs (autoconfig and autodiscover) -> mail.<domain>
  for (const cnameSub of ["autoconfig", "autodiscover"]) {
    const existingCname = existingRecords.find(
      (r) =>
        r.type === "CNAME" &&
        (r.name.toLowerCase() === `${cnameSub}.${zone.name.toLowerCase()}` ||
          r.name.toLowerCase() === cnameSub)
    )

    if (existingCname) {
      if (
        existingCname.content.toLowerCase().replace(/\.$/, "") === dedicatedMailHost &&
        !existingCname.proxied
      ) {
        results.push({
          type: "CNAME",
          name: cnameSub,
          content: dedicatedMailHost,
          action: "exists",
          id: existingCname.id,
          detail: `${cnameSub} CNAME already points to ${dedicatedMailHost}.`,
        })
      } else {
        await cfRequest(
          `/zones/${zone.id}/dns_records/${existingCname.id}`,
          {
            method: "PUT",
            body: JSON.stringify({
              type: "CNAME",
              name: cnameSub,
              content: dedicatedMailHost,
              proxied: false,
              ttl: 1,
              comment: "Managed by mailwart",
            }),
          },
          token
        )
        results.push({
          type: "CNAME",
          name: cnameSub,
          content: dedicatedMailHost,
          action: "updated",
          id: existingCname.id,
          detail: `Updated ${cnameSub} CNAME to ${dedicatedMailHost} (unproxied).`,
        })
      }
    } else {
      const createdCname = await cfRequest<CloudflareDnsRecord>(
        `/zones/${zone.id}/dns_records`,
        {
          method: "POST",
          body: JSON.stringify({
            type: "CNAME",
            name: cnameSub,
            content: dedicatedMailHost,
            proxied: false,
            ttl: 1,
            comment: "Managed by mailwart",
          }),
        },
        token
      )
      results.push({
        type: "CNAME",
        name: cnameSub,
        content: dedicatedMailHost,
        action: "created",
        id: createdCname.result.id,
        detail: `Created ${cnameSub} CNAME pointing to ${dedicatedMailHost}.`,
      })
    }
  }

  // 7. Provision Webmail CNAME: webmail.<domain> -> email.yehia.dev (proxied: true)
  try {
    const webmailRec = await ensureWebmailDnsRecord(domain)
    results.push(webmailRec)
  } catch (webmailErr) {
    console.error(`Failed to ensure webmail DNS record for ${domain}:`, webmailErr)
  }

  return {
    domain,
    zoneId: zone.id,
    zoneName: zone.name,
    records: results,
    success: true,
  }
}

/**
 * Ensures a webmail.<domain> CNAME record pointing to the global webmail host (email.yehia.dev)
 * exists in Cloudflare with proxying enabled (proxied: true).
 */
export async function ensureWebmailDnsRecord(domainInput: string): Promise<ProvisionedRecordResult> {
  const domain = domainInput.trim().toLowerCase()
  const found = await findZoneForDomain(domain)
  if (!found) {
    throw new Error(`No active Cloudflare zone found for "${domain}". Ensure this domain is added and active in your connected Cloudflare account.`)
  }

  const { zone, account } = found
  const token = account.apiToken
  const existingRecords = await listZoneDnsRecords(zone.id, token)

  const webmailSub = "webmail"
  const expectedWebmailFqdn = `webmail.${zone.name.toLowerCase()}`
  const webmailTarget = process.env.WEBMAIL_CNAME_TARGET?.trim() || "email.yehia.dev"

  const existingWebmail = existingRecords.find(
    (r) =>
      (r.type === "CNAME" || r.type === "A") &&
      (r.name.toLowerCase() === expectedWebmailFqdn ||
        r.name.toLowerCase() === `webmail.${domain}` ||
        r.name.toLowerCase() === webmailSub)
  )

  if (existingWebmail) {
    if (
      existingWebmail.type === "CNAME" &&
      existingWebmail.content.toLowerCase().replace(/\.$/, "") === webmailTarget &&
      existingWebmail.proxied
    ) {
      return {
        type: "CNAME",
        name: webmailSub,
        content: webmailTarget,
        action: "exists",
        id: existingWebmail.id,
        detail: `webmail CNAME already points to ${webmailTarget} (proxied).`,
      }
    }

    await cfRequest(
      `/zones/${zone.id}/dns_records/${existingWebmail.id}`,
      {
        method: "PUT",
        body: JSON.stringify({
          type: "CNAME",
          name: webmailSub,
          content: webmailTarget,
          proxied: true,
          ttl: 1,
          comment: "Managed by mailwart (webmail redirect)",
        }),
      },
      token
    )

    return {
      type: "CNAME",
      name: webmailSub,
      content: webmailTarget,
      action: "updated",
      id: existingWebmail.id,
      detail: `Updated webmail CNAME to ${webmailTarget} with Cloudflare proxy (proxied: true).`,
    }
  }

  const createdWebmail = await cfRequest<CloudflareDnsRecord>(
    `/zones/${zone.id}/dns_records`,
    {
      method: "POST",
      body: JSON.stringify({
        type: "CNAME",
        name: webmailSub,
        content: webmailTarget,
        proxied: true,
        ttl: 1,
        comment: "Managed by mailwart (webmail redirect)",
      }),
    },
    token
  )

  return {
    type: "CNAME",
    name: webmailSub,
    content: webmailTarget,
    action: "created",
    id: createdWebmail.result.id,
    detail: `Created webmail CNAME pointing to ${webmailTarget} (proxied: true).`,
  }
}

/**
 * Auto-propagates the webmail.<domain> DNS record across ALL existing domains.
 * Pools domains from Cloudflare zones and Stalwart domains.
 */
export async function propagateAllWebmailDns(extraDomains: string[] = []): Promise<WebmailPropagationSummary> {
  const domainSet = new Set<string>()

  // 1. Gather all Cloudflare zones
  const zones = await listCloudflareZones().catch(() => [])
  for (const z of zones) {
    if (z.name) domainSet.add(z.name.toLowerCase().trim())
  }

  // 2. Extra domains passed by caller (e.g. Stalwart domains)
  for (const d of extraDomains) {
    if (d && d.trim()) domainSet.add(d.toLowerCase().trim())
  }

  const items: WebmailPropagationItem[] = []
  let successCount = 0
  let failureCount = 0

  for (const domain of Array.from(domainSet)) {
    try {
      const rec = await ensureWebmailDnsRecord(domain)
      items.push({
        domain,
        success: true,
        action: rec.action as "created" | "updated" | "exists",
        detail: rec.detail,
      })
      successCount++
    } catch (err) {
      items.push({
        domain,
        success: false,
        error: err instanceof Error ? err.message : String(err),
      })
      failureCount++
    }
  }

  return {
    total: domainSet.size,
    successCount,
    failureCount,
    items,
  }
}

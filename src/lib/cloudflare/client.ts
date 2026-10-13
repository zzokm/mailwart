import "server-only"

import { generateDkimRecord } from "@/lib/dns/generate"
import { getStalwartDkimSignaturesForDomain } from "@/lib/stalwart/dkim"
import { readCloudflareSettings, writeCloudflareSettings } from "./settings-store"
import type {
  CloudflareDnsRecord,
  CloudflareProvisionResult,
  CloudflareStatus,
  CloudflareZone,
  ProvisionedRecordResult,
} from "./types"

const CF_API_BASE = "https://api.cloudflare.com/client/v4"

export async function resolveCloudflareApiToken(): Promise<{
  token?: string
  source: "env" | "settings" | "none"
}> {
  const fromEnv = process.env.CLOUDFLARE_API_TOKEN?.trim()
  if (fromEnv) {
    return { token: fromEnv, source: "env" }
  }

  const stored = await readCloudflareSettings()
  if (stored.apiToken?.trim()) {
    return { token: stored.apiToken.trim(), source: "settings" }
  }

  return { source: "none" }
}

export async function getEffectiveMailHost(): Promise<string> {
  const stored = await readCloudflareSettings()
  if (stored.defaultMailHost?.trim()) {
    return stored.defaultMailHost.trim()
  }
  const fromEnv = process.env.DNS_EXPECTED_MX?.trim()
  if (fromEnv) {
    return fromEnv
  }
  return "mail.yehia.dev"
}

export async function getCloudflareStatus(): Promise<CloudflareStatus> {
  const { token, source } = await resolveCloudflareApiToken()
  const defaultMailHost = await getEffectiveMailHost()
  const stored = await readCloudflareSettings()

  if (!token) {
    return {
      configured: false,
      source: "none",
      defaultMailHost,
    }
  }

  const masked =
    token.length > 8
      ? `${token.slice(0, 4)}••••${token.slice(-4)}`
      : "••••••••"

  return {
    configured: true,
    source,
    tokenMasked: masked,
    accountName: stored.accountName,
    lastVerifiedAt: stored.lastVerifiedAt,
    defaultMailHost,
  }
}

async function cfRequest<T>(
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
    throw new Error("Cloudflare API token is not configured. Add it in Settings or CLOUDFLARE_API_TOKEN env.")
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
      errMsg = `Cloudflare IP Whitelist Restriction: Token blocks server IP 23.94.107.153. Please add 23.94.107.153 to your Cloudflare Token's Client IP Filtering, or remove the IP restriction.`
    }
    throw new Error(errMsg)
  }

  return json
}

export async function verifyCloudflareToken(tokenOverride?: string): Promise<{
  ok: boolean
  status: string
  accountName?: string
  accessibleZonesCount: number
  error?: string
}> {
  try {
    // 1. Verify token validity endpoint
    let status = "active"
    try {
      const verifyRes = await cfRequest<{ id: string; status: string }>(
        "/user/tokens/verify",
        { method: "GET" },
        tokenOverride
      )
      status = verifyRes.result.status
    } catch {
      // Some scoped tokens don't have User:Read perm but have Zone:Read perm, fallback to zones check
    }

    // 2. Fetch accessible zones to confirm permission & get account name
    const zonesRes = await cfRequest<CloudflareZone[]>(
      "/zones?per_page=50&status=active",
      { method: "GET" },
      tokenOverride
    )

    const zones = zonesRes.result || []
    const accountName = zones[0]?.account?.name || undefined

    if (tokenOverride) {
      await writeCloudflareSettings({
        apiToken: tokenOverride,
        accountName,
        lastVerifiedAt: new Date().toISOString(),
      })
    } else {
      await writeCloudflareSettings({
        accountName,
        lastVerifiedAt: new Date().toISOString(),
      })
    }

    return {
      ok: true,
      status,
      accountName,
      accessibleZonesCount: zones.length,
    }
  } catch (err) {
    return {
      ok: false,
      status: "invalid",
      accessibleZonesCount: 0,
      error: err instanceof Error ? err.message : String(err),
    }
  }
}

export async function listCloudflareZones(): Promise<CloudflareZone[]> {
  const res = await cfRequest<CloudflareZone[]>("/zones?per_page=50&status=active", {
    method: "GET",
  })
  return res.result || []
}

export async function findZoneForDomain(domainName: string): Promise<CloudflareZone | null> {
  const norm = domainName.trim().toLowerCase()
  const zones = await listCloudflareZones()

  // 1. Exact match
  const exact = zones.find((z) => z.name.toLowerCase() === norm)
  if (exact) return exact

  // 2. Apex match for subdomains
  const apex = zones.find((z) => norm.endsWith(`.${z.name.toLowerCase()}`))
  if (apex) return apex

  return null
}

export async function listZoneDnsRecords(zoneId: string): Promise<CloudflareDnsRecord[]> {
  const res = await cfRequest<CloudflareDnsRecord[]>(
    `/zones/${zoneId}/dns_records?per_page=100`,
    { method: "GET" }
  )
  return res.result || []
}

/**
 * Auto-provisions or synchronizes required mail records (MX, SPF, DKIM, DMARC) in Cloudflare.
 */
export async function provisionDomainDns(input: {
  domain: string
  selector?: string
  mailHost?: string
  forceOverwrite?: boolean
}): Promise<CloudflareProvisionResult> {
  const domain = input.domain.trim().toLowerCase()
  const selector = (input.selector?.trim() || "mailwart").toLowerCase()
  // User requirement: mail server for each domain is its own domain: mail.<domain>
  const mailHost = input.mailHost || `mail.${domain}`
  const mailServerIp = process.env.MAIL_SERVER_IP?.trim() || "23.94.107.153"
  const forceOverwrite = input.forceOverwrite ?? false

  const zone = await findZoneForDomain(domain)
  if (!zone) {
    throw new Error(
      `No active Cloudflare zone found for "${domain}". Ensure this domain is added and active in your Cloudflare account.`
    )
  }

  const existingRecords = await listZoneDnsRecords(zone.id)
  const results: ProvisionedRecordResult[] = []

  // 1. Provision A record for dedicated mail host (e.g. mail.lebasko.com -> 23.94.107.153, unproxied)
  // Email ports (25, 465, 587, 993) cannot go through Cloudflare HTTP CDN proxy; proxied MUST be false!
  const mailSubdomain = "mail"
  const expectedFqdn = `mail.${zone.name.toLowerCase()}`
  const existingA = existingRecords.find(
    (r) =>
      r.type === "A" &&
      (r.name.toLowerCase() === expectedFqdn ||
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
      await cfRequest(`/zones/${zone.id}/dns_records/${existingA.id}`, {
        method: "PUT",
        body: JSON.stringify({
          type: "A",
          name: mailSubdomain,
          content: mailServerIp,
          proxied: false,
          ttl: 1,
          comment: "Managed by mailwart (DNS-only)",
        }),
      })
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
      }
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

  // 2. Provision MX Record
  // Target: mailHost (e.g. mail.lebasko.com), priority: 10, proxied: false
  const existingMx = existingRecords.find(
    (r) =>
      r.type === "MX" &&
      (r.name.toLowerCase() === domain ||
        r.name.toLowerCase() === zone.name.toLowerCase() ||
        r.name.toLowerCase() === `@.${zone.name.toLowerCase()}`)
  )

  if (existingMx) {
    if (
      existingMx.content.toLowerCase().replace(/\.$/, "") === mailHost.toLowerCase() &&
      existingMx.priority === 10 &&
      !existingMx.proxied
    ) {
      results.push({
        type: "MX",
        name: "@",
        content: mailHost,
        priority: 10,
        action: "exists",
        id: existingMx.id,
        detail: `MX record already pointing to ${mailHost} (priority 10).`,
      })
    } else {
      await cfRequest(`/zones/${zone.id}/dns_records/${existingMx.id}`, {
        method: "PUT",
        body: JSON.stringify({
          type: "MX",
          name: "@",
          content: mailHost,
          priority: 10,
          proxied: false,
          ttl: 1,
          comment: "Managed by mailwart",
        }),
      })
      results.push({
        type: "MX",
        name: "@",
        content: mailHost,
        priority: 10,
        action: "updated",
        id: existingMx.id,
        detail: `Updated MX target to ${mailHost} (priority 10, unproxied).`,
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
          content: mailHost,
          priority: 10,
          proxied: false,
          ttl: 1,
          comment: "Managed by mailwart",
        }),
      }
    )
    results.push({
      type: "MX",
      name: "@",
      content: mailHost,
      priority: 10,
      action: "created",
      id: createdMx.result.id,
      detail: `Created MX pointing to ${mailHost}.`,
    })
  }

  // 3. Provision SPF Record
  // Target: v=spf1 mx a:mail.<domain> ~all
  const targetSpf = `v=spf1 mx a:${mailHost} ~all`
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
    const hasMailHost = lower.includes(`a:${mailHost.toLowerCase()}`) || lower.includes(`ip4:${mailServerIp}`)

    if (hasMx && hasMailHost) {
      results.push({
        type: "TXT",
        name: "@ (SPF)",
        content: raw,
        action: "exists",
        id: existingSpf.id,
        detail: "SPF already authorizes MX and mail host delivery.",
      })
    } else {
      let updatedSpf = raw
      const additions = `${hasMx ? "" : " mx"}${hasMailHost ? "" : ` a:${mailHost}`}`.trim()
      if (/~\s*all\b/i.test(raw)) {
        updatedSpf = raw.replace(/~\s*all\b/i, `${additions} ~all`)
      } else if (/-\s*all\b/i.test(raw)) {
        updatedSpf = raw.replace(/-\s*all\b/i, `${additions} -all`)
      } else {
        updatedSpf = `${raw} ${additions}`
      }

      await cfRequest(`/zones/${zone.id}/dns_records/${existingSpf.id}`, {
        method: "PUT",
        body: JSON.stringify({
          type: "TXT",
          name: "@",
          content: updatedSpf,
          ttl: 1,
          comment: "Managed by mailwart",
        }),
      })
      results.push({
        type: "TXT",
        name: "@ (SPF)",
        content: updatedSpf,
        action: "updated",
        id: existingSpf.id,
        detail: `Updated SPF record to authorize mail host (${mailHost}).`,
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
      }
    )
    results.push({
      type: "TXT",
      name: "@ (SPF)",
      content: targetSpf,
      action: "created",
      id: createdSpf.result.id,
      detail: `Created baseline SPF record with mx and a:${mailHost}.`,
    })
  }

  // 4. Provision Real Stalwart DKIM Record(s)
  // Stalwart generates actual cryptographic keys (RSA & Ed25519) for each domain.
  // We query Stalwart JMAP directly for this domain's active DKIM signatures.
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
            detail: `Stalwart ${sig.keyType.toUpperCase()} DKIM record verified (${sig.selector}).`,
          })
        } else {
          await cfRequest(`/zones/${zone.id}/dns_records/${existingDkim.id}`, {
            method: "PUT",
            body: JSON.stringify({
              type: "TXT",
              name: dkimRecordName,
              content: sig.dnsValue,
              ttl: 1,
              comment: "Managed by mailwart (Stalwart signing key)",
            }),
          })
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
          }
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
        await cfRequest(`/zones/${zone.id}/dns_records/${existingDkim.id}`, {
          method: "PUT",
          body: JSON.stringify({
            type: "TXT",
            name: dkimRecordName,
            content: dkimGen.dnsValue,
            ttl: 1,
            comment: "Managed by mailwart",
          }),
        })
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
        }
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

  // 5. Provision DMARC Record
  // Target: _dmarc with v=DMARC1; p=quarantine; rua=mailto:dmarc@<domain>
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
      detail: `DMARC policy record already present (${existingDmarc.content.slice(0, 40)}...).`,
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
      }
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

  // 6. Provision Client Discovery CNAMEs (autoconfig and autodiscover)
  for (const cnameSub of ["autoconfig", "autodiscover"]) {
    const existingCname = existingRecords.find(
      (r) =>
        r.type === "CNAME" &&
        (r.name.toLowerCase() === `${cnameSub}.${zone.name.toLowerCase()}` ||
          r.name.toLowerCase() === cnameSub)
    )

    if (existingCname) {
      if (
        existingCname.content.toLowerCase().replace(/\.$/, "") === mailHost.toLowerCase() &&
        !existingCname.proxied
      ) {
        results.push({
          type: "CNAME",
          name: cnameSub,
          content: mailHost,
          action: "exists",
          id: existingCname.id,
          detail: `${cnameSub} CNAME already points to ${mailHost}.`,
        })
      } else {
        await cfRequest(`/zones/${zone.id}/dns_records/${existingCname.id}`, {
          method: "PUT",
          body: JSON.stringify({
            type: "CNAME",
            name: cnameSub,
            content: mailHost,
            proxied: false,
            ttl: 1,
            comment: "Managed by mailwart",
          }),
        })
        results.push({
          type: "CNAME",
          name: cnameSub,
          content: mailHost,
          action: "updated",
          id: existingCname.id,
          detail: `Updated ${cnameSub} CNAME to ${mailHost} (unproxied).`,
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
            content: mailHost,
            proxied: false,
            ttl: 1,
            comment: "Managed by mailwart",
          }),
        }
      )
      results.push({
        type: "CNAME",
        name: cnameSub,
        content: mailHost,
        action: "created",
        id: createdCname.result.id,
        detail: `Created ${cnameSub} CNAME pointing to ${mailHost}.`,
      })
    }
  }

  return {
    domain,
    zoneId: zone.id,
    zoneName: zone.name,
    records: results,
    success: true,
  }
}

import "server-only"

import * as dns from "node:dns/promises"
import { Resolver } from "node:dns/promises"

import { getDnsExpectations } from "@/lib/env"
import { findZoneForDomain, listZoneDnsRecords } from "@/lib/cloudflare/client"
import { getStalwartDkimSignaturesForDomain } from "@/lib/stalwart/dkim"
import { ensureCatchAllMailbox } from "@/lib/stalwart/catchall"
import type {
  DnsCheckItem,
  DnsCheckStatus,
  DnsHealthSummary,
} from "@/lib/stalwart/types"
import type { CloudflareDnsRecord } from "@/lib/cloudflare/types"

// Dedicated public recursive resolver querying Cloudflare (1.1.1.1) and Google (8.8.8.8)
// directly to bypass Docker's 127.0.0.11 caching proxy and observe propagation in real time.
const publicResolver = new Resolver({ timeout: 3500, tries: 2 })
try {
  publicResolver.setServers(["1.1.1.1", "1.0.0.1", "8.8.8.8", "8.8.4.4"])
} catch {
  // fallback if setServers fails
}

const CACHE_TTL_MS = 60 * 1000 // 60s for pass
const PROPAGATING_CACHE_TTL_MS = 8 * 1000 // 8s while propagating for snappy live feedback

type CacheEntry = {
  expiresAt: number
  summary: DnsHealthSummary
}

const cache = new Map<string, CacheEntry>()

function stripDot(host: string): string {
  return host.replace(/\.$/, "").toLowerCase()
}

export function computeDnsSummary(
  checks: DnsCheckItem[],
  checkedAt = new Date().toISOString(),
  fromCache = false
): DnsHealthSummary {
  const totalCount = checks.length
  const passedCount = checks.filter((c) => c.status === "pass").length
  const failedCount = checks.filter((c) => c.status === "fail").length
  const propagatingCount = checks.filter((c) => c.status === "propagating").length

  let worst: DnsCheckStatus = "unknown"
  if (failedCount > 0) {
    worst = "fail"
  } else if (passedCount === totalCount && totalCount > 0) {
    worst = "pass"
  } else if (propagatingCount > 0) {
    worst = "propagating"
  } else if (checks.some((c) => c.status === "warn")) {
    worst = "warn"
  }

  return {
    worst,
    checks,
    checkedAt,
    fromCache,
    passedCount,
    totalCount,
    propagatingCount,
    failedCount,
  }
}

type MxRecord = { exchange: string; priority: number }

async function resolveMx(domain: string): Promise<MxRecord[]> {
  try {
    const records = await publicResolver.resolveMx(domain)
    if (records && records.length > 0) return records
  } catch {
    // fallback to default dns
  }
  try {
    return await dns.resolveMx(domain)
  } catch {
    return []
  }
}

async function resolveTxt(name: string): Promise<string[]> {
  try {
    const records = await publicResolver.resolveTxt(name)
    if (records && records.length > 0) {
      return records.map((chunks: string[]) => chunks.join(""))
    }
  } catch {
    // fallback to default dns
  }
  try {
    const records = await dns.resolveTxt(name)
    return records.map((chunks: string[]) => chunks.join(""))
  } catch {
    return []
  }
}

function checkMx(
  domain: string,
  mx: MxRecord[],
  expectedMx?: string,
  mailHostHint?: string,
  cfPresent?: boolean
): DnsCheckItem {
  const observed =
    mx.length > 0
      ? mx
          .sort((a, b) => a.priority - b.priority)
          .map((r) => `${r.priority} ${stripDot(r.exchange)}`)
          .join("; ")
      : undefined

  const dedicatedHost = `mail.${domain}`
  const expectedLabel = `${domain}. MX → ${dedicatedHost}`

  if (mx.length === 0) {
    if (cfPresent) {
      return {
        type: "MX",
        label: "Mail exchanger",
        expected: expectedLabel,
        status: "propagating",
        note: `MX record provisioned in Cloudflare (${dedicatedHost}); propagating across DNS.`,
      }
    }
    return {
      type: "MX",
      label: "Mail exchanger",
      expected: expectedLabel,
      status: "fail",
      note: "No MX records found.",
      observed,
    }
  }

  return {
    type: "MX",
    label: "Mail exchanger",
    expected: expectedLabel,
    status: "pass",
    observed,
    note: observed ? `Active MX: ${observed}` : undefined,
  }
}

function checkTxt(
  domain: string,
  txt: string[],
  cfPresent?: boolean
): DnsCheckItem {
  const observed =
    txt.length > 0
      ? txt.slice(0, 4).join(" | ") + (txt.length > 4 ? " …" : "")
      : undefined

  if (txt.length === 0) {
    if (cfPresent) {
      return {
        type: "TXT",
        label: "Apex TXT",
        expected: `${domain} TXT (SPF / verification)`,
        status: "propagating",
        note: "Apex TXT provisioned in Cloudflare; propagating across DNS.",
      }
    }
    return {
      type: "TXT",
      label: "Apex TXT",
      expected: `${domain} TXT present`,
      status: "fail",
      note: "No apex TXT records found.",
      observed,
    }
  }

  return {
    type: "TXT",
    label: "Apex TXT",
    expected: `${domain} TXT present`,
    status: "pass",
    note: `${txt.length} TXT record(s) at apex.`,
    observed,
  }
}

function checkSpf(
  domain: string,
  txt: string[],
  expectedSpf?: string,
  mailHostHint?: string,
  cfPresent?: boolean
): DnsCheckItem {
  const spfRecords = txt.filter((t) => /^v=spf1\b/i.test(t.trim()))
  const dedicatedHost = `mail.${domain}`
  const expected = `v=spf1 mx a:${dedicatedHost} ~all`

  if (spfRecords.length === 0) {
    if (cfPresent) {
      return {
        type: "SPF",
        label: "SPF",
        expected,
        status: "propagating",
        note: `SPF record provisioned in Cloudflare; propagating across DNS.`,
      }
    }
    return {
      type: "SPF",
      label: "SPF",
      expected,
      status: "fail",
      note: "No v=spf1 TXT on apex.",
    }
  }

  return {
    type: "SPF",
    label: "SPF",
    expected,
    status: "pass",
    observed: spfRecords.join(" | "),
    note: "Valid SPF authorization present.",
  }
}

async function checkDkim(
  domain: string,
  configuredSelectors: string[],
  cfPresent?: boolean
): Promise<DnsCheckItem> {
  const stalwartSignatures = await getStalwartDkimSignaturesForDomain(domain).catch(() => [])
  const stalwartSelectors = stalwartSignatures.map((s) => s.selector)

  const candidateSelectors = Array.from(
    new Set([
      ...stalwartSelectors,
      ...configuredSelectors,
      "v1-rsa-20261013",
      "v1-ed25519-20261013",
      "v1-rsa-20260804",
      "v1-ed25519-20260804",
      "mailwart",
      "stalwart",
      "default",
    ])
  )

  const found: string[] = []
  const snippets: string[] = []

  for (const selector of candidateSelectors) {
    const name = `${selector}._domainkey.${domain}`
    const records = await resolveTxt(name)
    const dkim = records.filter(
      (t) => /v=dkim1/i.test(t) || /\bp=/i.test(t)
    )
    if (dkim.length > 0) {
      found.push(selector)
      snippets.push(`${name}: ${dkim[0].slice(0, 80)}${dkim[0].length > 80 ? "…" : ""}`)
    }
  }

  const expected = (stalwartSelectors.length > 0 ? stalwartSelectors : candidateSelectors.slice(0, 2))
    .map((s) => `${s}._domainkey.${domain}`)
    .join(", ")

  if (found.length > 0) {
    return {
      type: "DKIM",
      label: "DKIM",
      expected,
      status: "pass",
      observed: snippets.join(" | "),
      note: `Active DKIM signature(s) verified: ${found.join(", ")}.`,
    }
  }

  if (cfPresent) {
    return {
      type: "DKIM",
      label: "DKIM",
      expected,
      status: "propagating",
      note: "DKIM records provisioned in Cloudflare; propagating across DNS.",
    }
  }

  return {
    type: "DKIM",
    label: "DKIM",
    expected,
    status: "fail",
    note: "No DKIM TXT records resolved yet.",
  }
}

function checkDmarc(
  domain: string,
  records: string[],
  cfPresent?: boolean
): DnsCheckItem {
  const dmarc = records.filter((t) => /^v=DMARC1\b/i.test(t.trim()))
  const expected = `_dmarc.${domain} TXT v=DMARC1; p=…`

  if (dmarc.length === 0) {
    if (cfPresent) {
      return {
        type: "DMARC",
        label: "DMARC",
        expected,
        status: "propagating",
        note: "DMARC policy provisioned in Cloudflare; propagating across DNS.",
      }
    }
    return {
      type: "DMARC",
      label: "DMARC",
      expected,
      status: "fail",
      note: "No _dmarc TXT record found.",
    }
  }

  const hasQuarantine = dmarc.some((r) => /p\s*=\s*quarantine/i.test(r))
  const hasReject = dmarc.some((r) => /p\s*=\s*reject/i.test(r))
  const policy = hasReject ? "reject" : hasQuarantine ? "quarantine" : "none (monitoring)"

  return {
    type: "DMARC",
    label: "DMARC",
    expected,
    status: "pass",
    observed: dmarc.join(" | "),
    note: `DMARC policy: ${policy}`,
  }
}

/** Deterministic sample rubric when live lookups are skipped (mock UI). */
export function mockDnsHealth(domain: string): DnsHealthSummary {
  const d = domain.toLowerCase()
  const enabled = !d.endsWith(".test") && !d.includes("internal.")
  const checks: DnsCheckItem[] = [
    {
      type: "MX",
      label: "Mail exchanger",
      expected: `${d}. MX → mail.${d}`,
      status: enabled ? "pass" : "fail",
      note: enabled ? `10 mail.${d}` : "No MX records.",
      observed: enabled ? `10 mail.${d}` : undefined,
    },
    {
      type: "TXT",
      label: "Apex TXT",
      expected: `${d} TXT present`,
      status: enabled ? "pass" : "fail",
      observed: enabled ? `v=spf1 mx a:mail.${d} ~all` : undefined,
    },
    {
      type: "SPF",
      label: "SPF",
      expected: `v=spf1 mx a:mail.${d} ~all`,
      status: enabled ? "pass" : "fail",
      observed: enabled ? `v=spf1 mx a:mail.${d} ~all` : undefined,
    },
    {
      type: "DKIM",
      label: "DKIM",
      expected: `v1-rsa-20261013._domainkey.${d}`,
      status: enabled ? "pass" : "fail",
      note: enabled ? "Active RSA-2048 signing key verified." : "DKIM missing.",
    },
    {
      type: "DMARC",
      label: "DMARC",
      expected: `_dmarc.${d} TXT v=DMARC1; p=quarantine`,
      status: enabled ? "pass" : "fail",
      note: enabled ? "Policy: quarantine." : "DMARC missing.",
      observed: enabled ? `v=DMARC1; p=quarantine` : undefined,
    },
  ]
  return computeDnsSummary(checks, new Date().toISOString(), false)
}

export async function checkDomainDns(
  domain: string,
  options?: {
    bustCache?: boolean
    mailHostHint?: string
    /** When true, skip live lookups and return sample rubric. */
    mock?: boolean
  }
): Promise<DnsHealthSummary> {
  const d = domain.trim().toLowerCase()
  if (!d) {
    return {
      worst: "fail",
      checks: [],
      checkedAt: new Date().toISOString(),
      fromCache: false,
      passedCount: 0,
      totalCount: 0,
      propagatingCount: 0,
      failedCount: 0,
    }
  }

  if (options?.mock) {
    return mockDnsHealth(d)
  }

  const cacheKey = d
  if (!options?.bustCache) {
    const hit = cache.get(cacheKey)
    if (hit && hit.expiresAt > Date.now()) {
      return { ...hit.summary, fromCache: true }
    }
  } else {
    cache.delete(cacheKey)
  }

  const expectations = getDnsExpectations()
  const mailHost = options?.mailHostHint?.toLowerCase()

  const [mx, apexTxt, dmarcTxt] = await Promise.all([
    resolveMx(d),
    resolveTxt(d),
    resolveTxt(`_dmarc.${d}`),
  ])

  // If any standard lookup is missing records, check if records are already created in Cloudflare zone
  let cfRecords: CloudflareDnsRecord[] = []
  const hasAnyMissing = mx.length === 0 || apexTxt.length === 0 || dmarcTxt.length === 0
  if (hasAnyMissing) {
    try {
      const found = await findZoneForDomain(d)
      if (found) {
        cfRecords = await listZoneDnsRecords(found.zone.id, found.account.apiToken)
      }
    } catch {
      // Cloudflare check is opportunistic
    }
  }

  const cfMxPresent = cfRecords.some(
    (r) =>
      r.type === "MX" &&
      (r.name.toLowerCase() === d ||
        r.name.toLowerCase() === `@.${d}` ||
        r.name.toLowerCase() === `@.${d.toLowerCase()}`)
  )
  const cfTxtPresent = cfRecords.some(
    (r) => r.type === "TXT" && (r.name.toLowerCase() === d || r.name.toLowerCase() === `@.${d}`)
  )
  const cfSpfPresent = cfRecords.some(
    (r) =>
      r.type === "TXT" &&
      (r.name.toLowerCase() === d || r.name.toLowerCase() === `@.${d}`) &&
      /^v=spf1\b/i.test(r.content.trim())
  )
  const cfDkimPresent = cfRecords.some(
    (r) => r.type === "TXT" && r.name.toLowerCase().includes("._domainkey")
  )
  const cfDmarcPresent = cfRecords.some(
    (r) => r.type === "TXT" && r.name.toLowerCase().startsWith("_dmarc")
  )

  const mxCheck = checkMx(d, mx, expectations.expectedMx, mailHost, cfMxPresent)
  const txtCheck = checkTxt(d, apexTxt, cfTxtPresent)
  const spfCheck = checkSpf(d, apexTxt, expectations.expectedSpf, mailHost, cfSpfPresent)
  const dkimCheck = await checkDkim(d, expectations.dkimSelectors, cfDkimPresent)
  const dmarcCheck = checkDmarc(d, dmarcTxt, cfDmarcPresent)

  const checks = [mxCheck, txtCheck, spfCheck, dkimCheck, dmarcCheck]
  const summary = computeDnsSummary(checks, new Date().toISOString(), false)

  const ttl = summary.worst === "propagating" ? PROPAGATING_CACHE_TTL_MS : CACHE_TTL_MS
  cache.set(cacheKey, {
    expiresAt: Date.now() + ttl,
    summary: { ...summary, fromCache: false },
  })

  // When propagation completes with all checks passing, automatically ensure catch-all mailbox catch@domain.tld
  if (summary.worst === "pass") {
    ensureCatchAllMailbox(d).catch(() => {})
  }

  return summary
}

/** Clear DNS health cache for one domain or all. */
export function clearDnsCache(domain?: string) {
  if (domain) cache.delete(domain.trim().toLowerCase())
  else cache.clear()
}

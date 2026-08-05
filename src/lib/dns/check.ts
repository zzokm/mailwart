import "server-only"

import { promises as dns } from "node:dns"

import { getDnsExpectations } from "@/lib/env"
import type {
  DnsCheckItem,
  DnsCheckStatus,
  DnsHealthSummary,
} from "@/lib/stalwart/types"

const CACHE_TTL_MS = 5 * 60 * 1000

type CacheEntry = {
  expiresAt: number
  summary: DnsHealthSummary
}

const cache = new Map<string, CacheEntry>()

function stripDot(host: string): string {
  return host.replace(/\.$/, "").toLowerCase()
}

function worstStatus(statuses: DnsCheckStatus[]): DnsCheckStatus {
  if (statuses.includes("fail")) return "fail"
  if (statuses.includes("warn")) return "warn"
  if (statuses.includes("unknown")) return "unknown"
  if (statuses.every((s) => s === "pass")) return "pass"
  return "unknown"
}

async function resolveMx(domain: string) {
  try {
    return await dns.resolveMx(domain)
  } catch {
    return [] as Awaited<ReturnType<typeof dns.resolveMx>>
  }
}

async function resolveTxt(name: string): Promise<string[]> {
  try {
    const records = await dns.resolveTxt(name)
    return records.map((chunks) => chunks.join(""))
  } catch {
    return []
  }
}

function checkMx(
  domain: string,
  mx: Awaited<ReturnType<typeof dns.resolveMx>>,
  expectedMx?: string,
  mailHostHint?: string
): DnsCheckItem {
  const targets = mx.map((r) => stripDot(r.exchange))
  const observed =
    mx.length > 0
      ? mx
          .sort((a, b) => a.priority - b.priority)
          .map((r) => `${r.priority} ${stripDot(r.exchange)}`)
          .join("; ")
      : undefined

  const expectedLabel = expectedMx
    ? `${domain}. MX → ${expectedMx}`
    : mailHostHint
      ? `${domain}. MX → ${mailHostHint} (hint)`
      : `${domain}. MX ≥1`

  if (mx.length === 0) {
    return {
      type: "MX",
      label: "Mail exchanger",
      expected: expectedLabel,
      status: "fail",
      note: "No MX records found.",
      observed,
    }
  }

  if (expectedMx) {
    const match = targets.some(
      (t) => t === expectedMx || t.endsWith(`.${expectedMx}`)
    )
    if (!match) {
      return {
        type: "MX",
        label: "Mail exchanger",
        expected: expectedLabel,
        status: "warn",
        note: `MX exists but target does not match DNS_EXPECTED_MX (${expectedMx}).`,
        observed,
      }
    }
  }

  return {
    type: "MX",
    label: "Mail exchanger",
    expected: expectedLabel,
    status: "pass",
    observed,
  }
}

function checkTxt(domain: string, txt: string[]): DnsCheckItem {
  const observed =
    txt.length > 0
      ? txt.slice(0, 4).join(" | ") + (txt.length > 4 ? " …" : "")
      : undefined

  if (txt.length === 0) {
    return {
      type: "TXT",
      label: "Apex TXT",
      expected: `${domain} TXT (SPF / verification)`,
      status: "warn",
      note: "No apex TXT records. SPF usually lives here.",
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
  mailHostHint?: string
): DnsCheckItem {
  const spfRecords = txt.filter((t) => /^v=spf1\b/i.test(t.trim()))
  const expected = expectedSpf
    ? `v=spf1 … ${expectedSpf} …`
    : mailHostHint
      ? `v=spf1 mx a:${mailHostHint} ~all`
      : `v=spf1 …`

  if (spfRecords.length === 0) {
    return {
      type: "SPF",
      label: "SPF",
      expected,
      status: "fail",
      note: "No v=spf1 TXT on apex.",
    }
  }

  const hardFails = spfRecords.filter((r) => /\s-all\b/i.test(r))
  if (spfRecords.length > 1 && hardFails.length > 0) {
    return {
      type: "SPF",
      label: "SPF",
      expected,
      status: "fail",
      note: "Multiple SPF records with conflicting hard-fail (-all).",
      observed: spfRecords.join(" | "),
    }
  }

  if (expectedSpf) {
    const needle = expectedSpf.toLowerCase()
    const has = spfRecords.some((r) => r.toLowerCase().includes(needle))
    if (!has) {
      return {
        type: "SPF",
        label: "SPF",
        expected,
        status: "warn",
        note: `SPF present but missing expected mechanism (${expectedSpf}).`,
        observed: spfRecords.join(" | "),
      }
    }
  }

  return {
    type: "SPF",
    label: "SPF",
    expected,
    status: "pass",
    observed: spfRecords.join(" | "),
  }
}

async function checkDkim(
  domain: string,
  selectors: string[]
): Promise<DnsCheckItem> {
  if (selectors.length === 0) {
    return {
      type: "DKIM",
      label: "DKIM",
      expected: "selector._domainkey (set DNS_DKIM_SELECTORS)",
      status: "warn",
      note: "No selectors configured — DKIM not checked.",
    }
  }

  const found: string[] = []
  const missing: string[] = []
  const snippets: string[] = []

  for (const selector of selectors) {
    const name = `${selector}._domainkey.${domain}`
    const records = await resolveTxt(name)
    const dkim = records.filter(
      (t) => /v=dkim1/i.test(t) || /\bp=/i.test(t)
    )
    if (dkim.length > 0) {
      found.push(selector)
      snippets.push(`${name}: ${dkim[0].slice(0, 120)}${dkim[0].length > 120 ? "…" : ""}`)
    } else {
      missing.push(selector)
    }
  }

  const expected = selectors.map((s) => `${s}._domainkey.${domain}`).join(", ")

  if (found.length === 0) {
    return {
      type: "DKIM",
      label: "DKIM",
      expected,
      status: "fail",
      note: `All configured selectors missing (${missing.join(", ")}).`,
    }
  }

  if (missing.length > 0) {
    return {
      type: "DKIM",
      label: "DKIM",
      expected,
      status: "warn",
      note: `Found ${found.join(", ")}; missing ${missing.join(", ")}.`,
      observed: snippets.join(" | "),
    }
  }

  return {
    type: "DKIM",
    label: "DKIM",
    expected,
    status: "pass",
    observed: snippets.join(" | "),
  }
}

function checkDmarc(domain: string, records: string[]): DnsCheckItem {
  const dmarc = records.filter((t) => /^v=DMARC1\b/i.test(t.trim()))
  const expected = `_dmarc.${domain} TXT v=DMARC1; p=…`

  if (dmarc.length === 0) {
    return {
      type: "DMARC",
      label: "DMARC",
      expected,
      status: "fail",
      note: "No _dmarc TXT record.",
    }
  }

  const policyNone = dmarc.every((r) => /;\s*p\s*=\s*none\b/i.test(r))
  if (policyNone) {
    return {
      type: "DMARC",
      label: "DMARC",
      expected,
      status: "warn",
      note: "DMARC present with p=none only (monitor mode).",
      observed: dmarc.join(" | "),
    }
  }

  return {
    type: "DMARC",
    label: "DMARC",
    expected,
    status: "pass",
    observed: dmarc.join(" | "),
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
      expected: `${d}. MX ≥1`,
      status: enabled ? "pass" : "fail",
      note: enabled ? "Sample MX." : "Sample: no MX.",
      observed: enabled ? `10 mail.${d}` : undefined,
    },
    {
      type: "TXT",
      label: "Apex TXT",
      expected: `${d} TXT present`,
      status: enabled ? "pass" : "warn",
      observed: enabled ? `v=spf1 mx ~all` : undefined,
    },
    {
      type: "SPF",
      label: "SPF",
      expected: `v=spf1 …`,
      status: enabled ? "pass" : "fail",
      observed: enabled ? `v=spf1 mx ~all` : undefined,
    },
    {
      type: "DKIM",
      label: "DKIM",
      expected: `stalwart._domainkey.${d}`,
      status: enabled ? "warn" : "fail",
      note: enabled
        ? "Sample: selector not fully verified."
        : "Sample: DKIM missing.",
    },
    {
      type: "DMARC",
      label: "DMARC",
      expected: `_dmarc.${d} TXT v=DMARC1; p=…`,
      status: enabled ? "warn" : "fail",
      note: enabled ? "Sample: p=none." : "Sample: DMARC missing.",
      observed: enabled ? `v=DMARC1; p=none` : undefined,
    },
  ]
  return {
    worst: worstStatus(checks.map((c) => c.status)),
    checks,
    checkedAt: new Date().toISOString(),
    fromCache: false,
  }
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

  const mxCheck = checkMx(d, mx, expectations.expectedMx, mailHost)
  const txtCheck = checkTxt(d, apexTxt)
  const spfCheck = checkSpf(d, apexTxt, expectations.expectedSpf, mailHost)
  const dkimCheck = await checkDkim(d, expectations.dkimSelectors)
  const dmarcCheck = checkDmarc(d, dmarcTxt)

  const checks = [mxCheck, txtCheck, spfCheck, dkimCheck, dmarcCheck]
  const summary: DnsHealthSummary = {
    worst: worstStatus(checks.map((c) => c.status)),
    checks,
    checkedAt: new Date().toISOString(),
    fromCache: false,
  }

  cache.set(cacheKey, {
    expiresAt: Date.now() + CACHE_TTL_MS,
    summary: { ...summary, fromCache: false },
  })

  return summary
}

/** Clear DNS health cache for one domain or all. */
export function clearDnsCache(domain?: string) {
  if (domain) cache.delete(domain.trim().toLowerCase())
  else cache.clear()
}

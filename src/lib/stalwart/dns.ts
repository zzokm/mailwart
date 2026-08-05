import "server-only"

import { checkDomainDns } from "@/lib/dns"
import type { DnsCheckItem } from "./types"

/**
 * @deprecated Prefer checkDomainDns from @/lib/dns — kept for callers that
 * only need a static expected-record guide without live lookups.
 */
export function buildDnsChecklist(
  domain: string,
  mailHost?: string
): DnsCheckItem[] {
  const d = domain.toLowerCase()
  const host = mailHost?.toLowerCase() || `mail.${d}`
  return [
    {
      type: "MX",
      label: "Mail exchanger",
      expected: `${d}. MX 10 ${host}.`,
      status: "unknown",
      note: "Confirm MX points at the Stalwart host for this deployment.",
    },
    {
      type: "TXT",
      label: "Apex TXT",
      expected: `${d} TXT (SPF / verification)`,
      status: "unknown",
    },
    {
      type: "SPF",
      label: "SPF",
      expected: `v=spf1 mx a:${host} ~all`,
      status: "unknown",
      note: "SPF TXT on the apex; adjust includes to match your outbound path.",
    },
    {
      type: "DKIM",
      label: "DKIM",
      expected: `selector._domainkey.${d} TXT`,
      status: "unknown",
      note: "Set DNS_DKIM_SELECTORS to enable live DKIM checks.",
    },
    {
      type: "DMARC",
      label: "DMARC",
      expected: `_dmarc.${d} TXT v=DMARC1; p=none|quarantine|reject`,
      status: "unknown",
    },
  ]
}

/** Live (or mock) DNS health for a managed domain. */
export async function getDomainDnsHealth(
  domain: string,
  options?: { bustCache?: boolean; mailHostHint?: string; mock?: boolean }
) {
  return checkDomainDns(domain, options)
}

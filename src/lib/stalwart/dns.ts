import type { DnsCheckItem } from "./types"

/** Read-only DNS verification checklist — no live DNS lookups in Phase 3. */
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
      label: "SPF",
      expected: `v=spf1 mx a:${host} ~all`,
      status: "unknown",
      note: "SPF TXT on the apex; adjust includes to match your outbound path.",
    },
    {
      type: "SPF",
      label: "SPF policy",
      expected: `Pass for ${host} and authorized relays`,
      status: "unknown",
    },
    {
      type: "DKIM",
      label: "DKIM",
      expected: `selector._domainkey.${d} TXT (Stalwart Automatic)`,
      status: "unknown",
      note: "DKIM often managed by Stalwart dnsManagement / external zone.",
    },
    {
      type: "DMARC",
      label: "DMARC",
      expected: `_dmarc.${d} TXT v=DMARC1; p=none|quarantine|reject`,
      status: "unknown",
    },
  ]
}

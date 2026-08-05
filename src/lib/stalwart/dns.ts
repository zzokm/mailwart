import type { DnsCheckItem } from "./types"

/** Read-only DNS verification checklist — no live DNS lookups in Phase 3. */
export function buildDnsChecklist(domain: string): DnsCheckItem[] {
  const d = domain.toLowerCase()
  return [
    {
      type: "MX",
      label: "Mail exchanger",
      expected: `10 mail.yehia.dev. → ${d}`,
      status: "unknown",
      note: "Confirm MX points at the Stalwart host for this deployment.",
    },
    {
      type: "TXT",
      label: "SPF",
      expected: `v=spf1 mx a:mail.yehia.dev ~all`,
      status: "unknown",
      note: "SPF TXT on the apex; adjust includes to match your outbound path.",
    },
    {
      type: "SPF",
      label: "SPF policy",
      expected: "Pass for mail.yehia.dev / authorized relays",
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

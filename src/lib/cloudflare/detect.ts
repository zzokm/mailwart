import type {
  CloudflareDnsRecord,
  DetectedOlderRecord,
  ZoneMailAudit,
} from "./types"

function identifyProvider(content: string): string {
  const c = content.toLowerCase()
  if (c.includes("google") || c.includes("aspmx")) {
    return "Google Workspace"
  }
  if (c.includes("outlook") || c.includes("office365") || c.includes("microsoft")) {
    return "Microsoft 365"
  }
  if (c.includes("protonmail") || c.includes("proton.me")) {
    return "ProtonMail"
  }
  if (c.includes("zoho")) {
    return "Zoho Mail"
  }
  if (c.includes("migadu")) {
    return "Migadu"
  }
  if (c.includes("fastmail")) {
    return "Fastmail"
  }
  if (c.includes("mailgun")) {
    return "Mailgun"
  }
  if (c.includes("sendgrid")) {
    return "SendGrid"
  }
  if (c.includes("yandex")) {
    return "Yandex Mail"
  }
  return "Legacy / External Mail Exchanger"
}

export function detectOlderMailRecords(
  domain: string,
  zoneId: string,
  zoneName: string,
  records: CloudflareDnsRecord[],
  mailServerIp: string = "23.94.107.153"
): ZoneMailAudit {
  const normDomain = domain.toLowerCase()
  const expectedDedicatedHost = `mail.${normDomain}`
  const olderRecords: DetectedOlderRecord[] = []

  for (const r of records) {
    const recordName = r.name.toLowerCase()
    const content = r.content.trim()
    const cleanContent = content.toLowerCase().replace(/\.$/, "")

    // 1. Check MX records
    if (r.type === "MX") {
      const isDomainMx =
        recordName === normDomain ||
        recordName === zoneName.toLowerCase() ||
        recordName === `@.${zoneName.toLowerCase()}`

      if (isDomainMx) {
        // If it does not point to dedicated mail host
        if (cleanContent !== expectedDedicatedHost) {
          olderRecords.push({
            id: r.id,
            type: "MX",
            name: r.name,
            content,
            priority: r.priority,
            proxied: r.proxied,
            providerDetected: identifyProvider(content),
            category: "mx",
            reason: `MX points to "${content}" (priority ${r.priority ?? 0}) instead of dedicated host "${expectedDedicatedHost}"`,
          })
        }
      }
    }

    // 2. Check SPF (TXT records starting with v=spf1)
    if (r.type === "TXT") {
      const isApex =
        recordName === normDomain ||
        recordName === zoneName.toLowerCase() ||
        recordName === `@.${zoneName.toLowerCase()}`

      if (isApex && /^v=spf1\b/i.test(content)) {
        const lower = content.toLowerCase()
        const hasOurMailHost =
          lower.includes(`a:${expectedDedicatedHost}`) ||
          lower.includes(`ip4:${mailServerIp}`) ||
          (lower.includes("mx") && !olderRecords.some((o) => o.category === "mx"))

        // Check if it has third-party includes or doesn't authorize our mail host
        const hasForeignProvider =
          lower.includes("include:_spf.google.com") ||
          lower.includes("include:spf.protection.outlook.com") ||
          lower.includes("include:zoho") ||
          lower.includes("include:protonmail") ||
          lower.includes("include:mailgun") ||
          lower.includes("include:sendgrid")

        if (hasForeignProvider || !hasOurMailHost) {
          olderRecords.push({
            id: r.id,
            type: "TXT",
            name: r.name,
            content,
            providerDetected: identifyProvider(content),
            category: "spf",
            reason: hasForeignProvider
              ? `SPF contains third-party mail provider authorization (${identifyProvider(content)})`
              : `SPF does not authorize mail host "${expectedDedicatedHost}" or IP ${mailServerIp}`,
          })
        }
      }
    }

    // 3. Check Mail Host A or CNAME record
    const isMailHost =
      recordName === `mail.${normDomain}` ||
      recordName === `mail.${zoneName.toLowerCase()}` ||
      recordName === "mail"

    if (isMailHost) {
      if (r.type === "A") {
        if (content !== mailServerIp || r.proxied) {
          olderRecords.push({
            id: r.id,
            type: "A",
            name: r.name,
            content,
            proxied: r.proxied,
            providerDetected: "Existing A Record",
            category: "mail_host",
            reason: r.proxied
              ? `A record for mail is proxied through Cloudflare CDN (blocks SMTP/IMAP/POP3 ports). Must be DNS-only.`
              : `A record for mail points to IP ${content} instead of mail server ${mailServerIp}`,
          })
        }
      } else if (r.type === "CNAME") {
        olderRecords.push({
          id: r.id,
          type: "CNAME",
          name: r.name,
          content,
          proxied: r.proxied,
          providerDetected: "Existing CNAME Record",
          category: "mail_host",
          reason: `mail host is configured as a CNAME pointing to ${content} instead of direct A record to mail server ${mailServerIp}`,
        })
      }
    }

    // 4. Check Third-party DKIM TXT records
    if (r.type === "TXT" && recordName.includes("._domainkey")) {
      const isKnownThirdPartyDkim =
        recordName.startsWith("google._domainkey") ||
        recordName.startsWith("selector1._domainkey") ||
        recordName.startsWith("selector2._domainkey") ||
        recordName.startsWith("k1._domainkey") ||
        recordName.startsWith("protonmail._domainkey") ||
        recordName.startsWith("zoho._domainkey")

      if (isKnownThirdPartyDkim) {
        olderRecords.push({
          id: r.id,
          type: "TXT",
          name: r.name,
          content: `${content.slice(0, 36)}...`,
          providerDetected: identifyProvider(recordName),
          category: "dkim",
          reason: `Third-party DKIM selector found for previous mail provider (${identifyProvider(recordName)})`,
        })
      }
    }
  }

  return {
    zoneId,
    zoneName,
    olderRecords,
    hasConflicts: olderRecords.length > 0,
  }
}

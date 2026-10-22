import type { ForwardingRule } from "./types"

/** Escape a string for use inside a Sieve quoted string. */
export function sieveQuote(value: string): string {
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`
}

export interface SieveGeneratorOptions {
  mailboxEmail: string
  domainName: string
  catchAllEmail?: string | null
  isCatchAllMailbox?: boolean
  archivalCopyEnabled?: boolean
  rules: ForwardingRule[]
}

/**
 * Normalizes a source pattern according to its type and domain.
 * Abstracts the @domain part while still working if @domain.tld is included.
 *
 * e.g.,
 * - "support-*" on "example.com" -> "support-*@example.com"
 * - "support-*@example.com" on "example.com" -> "support-*@example.com"
 * - "^invoice-[0-9]+$" on "example.com" -> "^invoice-[0-9]+@example\\.com$"
 * - "^invoice-[0-9]+@example\\.com$" on "example.com" -> "^invoice-[0-9]+@example\\.com$"
 */
export function normalizeSourcePattern(
  source: string,
  sourceType: string,
  domainName: string
): string {
  const trimmed = source.trim()
  const domainLower = domainName.trim().toLowerCase()

  if (sourceType === "domain") {
    return `*@${domainLower}`
  }

  if (sourceType === "regex") {
    // If the regex already includes an @ symbol, the user explicitly provided the domain/host
    if (trimmed.includes("@")) {
      return trimmed
    }
    // Abstracted: user provided regex for the local-part
    const escapedDomain = domainLower.replace(/\./g, "\\.")
    if (trimmed.endsWith("$")) {
      return `${trimmed.slice(0, -1)}@${escapedDomain}$`
    }
    return `${trimmed}@${escapedDomain}`
  }

  // Exact or Wildcard
  const lower = trimmed.toLowerCase()
  if (lower.includes("@")) {
    if (lower.endsWith("@")) {
      return `${lower}${domainLower}`
    }
    const parts = lower.split("@").filter(Boolean)
    if (parts.length > 0) {
      return `${parts[0]}@${domainLower}`
    }
    return `*@${domainLower}`
  }

  return `${lower}@${domainLower}`
}

/**
 * Generates an RFC-compliant Sieve script for a specific mailbox in Stalwart.
 * Encapsulates:
 * 1. Archival Copy (Requirement 3): All delivered emails duplicate a copy to domain catch-all.
 * 2. Forwarding (Requirement 2 & 4): Redirect to external targets (e.g. Gmail) via Sieve,
 *    handling exact addresses, wildcards (:matches), and regular expressions (:regex).
 */
export function generateMailboxSieve(options: SieveGeneratorOptions): string {
  const {
    mailboxEmail,
    domainName,
    catchAllEmail,
    isCatchAllMailbox = false,
    archivalCopyEnabled = true,
    rules,
  } = options

  const lines: string[] = [
    'require ["copy", "fileinto", "regex", "variables", "envelope", "subaddress"];',
    "",
    "# ==============================================================================",
    `# mailwart Managed Sieve Script for: ${mailboxEmail}`,
    `# Generated at: ${new Date().toISOString()}`,
    "# ==============================================================================",
    "",
  ]

  const cleanMailbox = mailboxEmail.trim().toLowerCase()
  const cleanCatchAll = catchAllEmail ? catchAllEmail.trim().toLowerCase() : null

  // 1. Active Forwarding Rules (Evaluated FIRST so user forwarding has highest priority)
  const activeRules = rules.filter((r) => r.enabled && r.targets.length > 0)
  const matchedRules: ForwardingRule[] = []

  for (const rule of activeRules) {
    const sType = rule.sourceType || (rule.scope === "domain" ? "domain" : "exact")
    const normSource = normalizeSourcePattern(rule.source, sType, domainName)

    if (sType === "exact") {
      // Only applies to this mailbox if the source matches this mailbox
      if (normSource === cleanMailbox) {
        matchedRules.push(rule)
      }
    } else if (isCatchAllMailbox || sType === "wildcard" || sType === "regex" || sType === "domain") {
      // Wildcards, regex, domain rules, and catch-all fallthroughs are evaluated on catch-all
      // or mailbox
      matchedRules.push(rule)
    }
  }

  if (matchedRules.length > 0) {
    lines.push("# --- 1. Inbound Forwarding Rules ---")

    for (const rule of matchedRules) {
      const sType = rule.sourceType || (rule.scope === "domain" ? "domain" : "exact")
      const normSource = normalizeSourcePattern(rule.source, sType, domainName)
      const targets = rule.targets.map((t) => t.trim().toLowerCase()).filter(Boolean)

      if (targets.length === 0) continue

      lines.push(`# Forward Rule ID: ${rule.id} [${sType}] ${normSource} -> ${targets.join(", ")}`)

      let testClause = ""
      if (sType === "exact") {
        testClause = `anyof (envelope :is "to" ${sieveQuote(normSource)}, address :is ["to", "cc", "envelope-to", "x-original-to"] ${sieveQuote(normSource)})`
      } else if (sType === "wildcard" || sType === "domain") {
        testClause = `anyof (envelope :matches "to" ${sieveQuote(normSource)}, address :matches ["to", "cc", "envelope-to", "x-original-to"] ${sieveQuote(normSource)})`
      } else if (sType === "regex") {
        testClause = `anyof (envelope :regex "to" ${sieveQuote(normSource)}, address :regex ["to", "cc", "envelope-to", "x-original-to"] ${sieveQuote(normSource)})`
      }

      lines.push(`if ${testClause} {`)

      if (rule.keepLocalCopy) {
        for (const target of targets) {
          lines.push(`    redirect :copy ${sieveQuote(target)};`)
        }
      } else {
        // Do not keep local copy: redirect :copy to all but the last, then redirect and stop
        for (let i = 0; i < targets.length - 1; i++) {
          lines.push(`    redirect :copy ${sieveQuote(targets[i])};`)
        }
        lines.push(`    redirect ${sieveQuote(targets[targets.length - 1])};`)
        lines.push("    stop;")
      }

      lines.push("}")
      lines.push("")
    }
  }

  // 2. Archival journaling to catch-all mailbox (Catch-All)
  // If archival is enabled, catch-all exists, and this is NOT the catch-all mailbox itself
  if (
    archivalCopyEnabled &&
    cleanCatchAll &&
    cleanMailbox !== cleanCatchAll
  ) {
    lines.push("# --- 2. Archival Journaling Copy (Catch-All) ---")
    lines.push("# Delivers a duplicate copy of every received email to the domain catch-all archive")
    lines.push(`redirect :copy ${sieveQuote(cleanCatchAll)};`)
    lines.push("")
  }

  return lines.join("\n")
}

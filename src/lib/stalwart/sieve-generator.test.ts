import { describe, expect, it } from "vitest"
import { generateMailboxSieve, normalizeSourcePattern } from "./sieve-generator"
import type { ForwardingRule } from "./types"

describe("sieve-generator", () => {
  it("normalizes source patterns accurately (abstracting domain and supporting full addresses)", () => {
    // Abstracted local-parts (domain omitted)
    expect(normalizeSourcePattern("support-*", "wildcard", "example.com")).toBe(
      "support-*@example.com"
    )
    expect(normalizeSourcePattern("billing", "exact", "example.com")).toBe(
      "billing@example.com"
    )
    expect(normalizeSourcePattern("^invoice-[0-9]+$", "regex", "example.com")).toBe(
      "^invoice-[0-9]+@example\\.com$"
    )
    expect(normalizeSourcePattern("^invoice-[0-9]+", "regex", "example.com")).toBe(
      "^invoice-[0-9]+@example\\.com"
    )
    expect(normalizeSourcePattern("*", "domain", "example.com")).toBe(
      "*@example.com"
    )
    expect(normalizeSourcePattern("", "domain", "example.com")).toBe(
      "*@example.com"
    )

    // Full addresses included by user (idempotent / graceful)
    expect(normalizeSourcePattern("support-*@example.com", "wildcard", "example.com")).toBe(
      "support-*@example.com"
    )
    expect(normalizeSourcePattern("billing@example.com", "exact", "example.com")).toBe(
      "billing@example.com"
    )
    expect(normalizeSourcePattern("billing@", "exact", "example.com")).toBe(
      "billing@example.com"
    )
    expect(normalizeSourcePattern("support-*@example.com@example.com", "wildcard", "example.com")).toBe(
      "support-*@example.com"
    )
    expect(normalizeSourcePattern("^invoice-[0-9]+@example\\.com$", "regex", "example.com")).toBe(
      "^invoice-[0-9]+@example\\.com$"
    )
    expect(normalizeSourcePattern("*@example.com", "domain", "example.com")).toBe(
      "*@example.com"
    )
  })

  it("generates archival copy to catch-all when mailbox is not the catch-all itself, excluding postmaster", () => {
    const sieve = generateMailboxSieve({
      mailboxEmail: "yehia@example.com",
      domainName: "example.com",
      catchAllEmail: "catch@example.com",
      isCatchAllMailbox: false,
      archivalCopyEnabled: true,
      rules: [],
    })

    expect(sieve).toContain('redirect :copy "catch@example.com";')
    expect(sieve).toContain("Archival Journaling Copy")
    expect(sieve).toContain('if not anyof (envelope :matches "to" "postmaster@*", address :matches ["to", "cc", "envelope-to", "x-original-to"] "postmaster@*")')
  })

  it("silently drops postmaster traffic on catch-all mailboxes and does not duplicate archival copy", () => {
    const sieve = generateMailboxSieve({
      mailboxEmail: "catch@example.com",
      domainName: "example.com",
      catchAllEmail: "catch@example.com",
      isCatchAllMailbox: true,
      archivalCopyEnabled: true,
      rules: [],
    })

    expect(sieve).toContain("Postmaster Traffic Filter")
    expect(sieve).toContain('if anyof (envelope :matches "to" "postmaster@*", address :matches ["to", "cc", "envelope-to", "x-original-to"] "postmaster@*")')
    expect(sieve).toContain("discard;")
    expect(sieve).toContain("stop;")
    expect(sieve).not.toContain('redirect :copy "catch@example.com";')
  })

  it("generates exact, wildcard, and regex forwarding with external Gmail targets", () => {
    const rules: ForwardingRule[] = [
      {
        id: "fwd-exact",
        scope: "user",
        sourceType: "exact",
        domainId: "dom-1",
        domainName: "example.com",
        source: "sales@example.com",
        targets: ["personal@gmail.com"],
        keepLocalCopy: true,
        enabled: true,
        backend: "sieve",
        updatedAt: new Date().toISOString(),
      },
      {
        id: "fwd-wildcard",
        scope: "wildcard",
        sourceType: "wildcard",
        domainId: "dom-1",
        domainName: "example.com",
        source: "support-*@example.com",
        targets: ["helpdesk@gmail.com"],
        keepLocalCopy: false,
        enabled: true,
        backend: "sieve",
        updatedAt: new Date().toISOString(),
      },
      {
        id: "fwd-regex",
        scope: "regex",
        sourceType: "regex",
        domainId: "dom-1",
        domainName: "example.com",
        source: "^billing-[0-9]+@example\\.com$",
        targets: ["finance@gmail.com"],
        keepLocalCopy: true,
        enabled: true,
        backend: "sieve",
        updatedAt: new Date().toISOString(),
      },
    ]

    const sieve = generateMailboxSieve({
      mailboxEmail: "sales@example.com",
      domainName: "example.com",
      catchAllEmail: "catch@example.com",
      isCatchAllMailbox: false,
      archivalCopyEnabled: true,
      rules,
    })

    // Sieve capabilities header
    expect(sieve).toContain('require ["copy", "fileinto", "regex", "variables", "envelope", "subaddress"];')

    // Exact match
    expect(sieve).toContain('anyof (envelope :is "to" "sales@example.com", address :is ["to", "cc", "envelope-to", "x-original-to"] "sales@example.com")')
    expect(sieve).toContain('redirect :copy "personal@gmail.com";')

    // Wildcard match
    expect(sieve).toContain('anyof (envelope :matches "to" "support-*@example.com", address :matches ["to", "cc", "envelope-to", "x-original-to"] "support-*@example.com")')
    expect(sieve).toContain('redirect "helpdesk@gmail.com";')
    expect(sieve).toContain("stop;")

    // Regex match
    expect(sieve).toContain('anyof (envelope :regex "to" "^billing-[0-9]+@example\\\\.com$", address :regex ["to", "cc", "envelope-to", "x-original-to"] "^billing-[0-9]+@example\\\\.com$")')
    expect(sieve).toContain('redirect :copy "finance@gmail.com";')

    // Archival copy
    expect(sieve).toContain('redirect :copy "catch@example.com";')

    // Ensure forwarding rules appear before archival copy in the script
    const forwardIdx = sieve.indexOf("Inbound Forwarding Rules")
    const archivalIdx = sieve.indexOf("Archival Journaling Copy")
    expect(forwardIdx).toBeGreaterThan(0)
    expect(archivalIdx).toBeGreaterThan(forwardIdx)
  })
})

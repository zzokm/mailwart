import { describe, expect, it } from "vitest"
import { generateMailboxSieve, normalizeSourcePattern } from "./sieve-generator"
import type { ForwardingRule } from "./types"

describe("sieve-generator", () => {
  it("normalizes source patterns accurately", () => {
    expect(normalizeSourcePattern("support-*", "wildcard", "example.com")).toBe(
      "support-*@example.com"
    )
    expect(normalizeSourcePattern("billing", "exact", "example.com")).toBe(
      "billing@example.com"
    )
    expect(normalizeSourcePattern("^invoice-[0-9]+@example\\.com$", "regex", "example.com")).toBe(
      "^invoice-[0-9]+@example\\.com$"
    )
    expect(normalizeSourcePattern("", "domain", "example.com")).toBe(
      "*@example.com"
    )
  })

  it("generates archival copy to catch-all when mailbox is not the catch-all itself", () => {
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
  })

  it("does not generate duplicate archival copy when mailbox is the catch-all itself", () => {
    const sieve = generateMailboxSieve({
      mailboxEmail: "catch@example.com",
      domainName: "example.com",
      catchAllEmail: "catch@example.com",
      isCatchAllMailbox: true,
      archivalCopyEnabled: true,
      rules: [],
    })

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

    // Archival copy
    expect(sieve).toContain('redirect :copy "catch@example.com";')

    // Exact match
    expect(sieve).toContain('address :is ["to", "cc", "envelope-to", "x-original-to"] "sales@example.com"')
    expect(sieve).toContain('redirect :copy "personal@gmail.com";')

    // Wildcard match
    expect(sieve).toContain('address :matches ["to", "cc", "envelope-to", "x-original-to"] "support-*@example.com"')
    expect(sieve).toContain('redirect "helpdesk@gmail.com";')
    expect(sieve).toContain("stop;")

    // Regex match
    expect(sieve).toContain('address :regex ["to", "cc", "envelope-to", "x-original-to"] "^billing-[0-9]+@example\\\\.com$"')
    expect(sieve).toContain('redirect :copy "finance@gmail.com";')
  })
})

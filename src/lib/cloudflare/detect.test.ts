import { describe, expect, it } from "vitest"

import { detectOlderMailRecords } from "./detect"
import type { CloudflareDnsRecord } from "./types"

function makeRecord(partial: Partial<CloudflareDnsRecord>): CloudflareDnsRecord {
  return {
    id: `rec_${Math.random().toString(36).slice(2, 8)}`,
    zone_id: "zone_123",
    zone_name: "example.com",
    name: "example.com",
    type: "A",
    content: "1.2.3.4",
    proxiable: true,
    proxied: false,
    ttl: 1,
    ...partial,
  }
}

describe("detectOlderMailRecords", () => {
  it("detects Google Workspace MX and SPF records", () => {
    const records: CloudflareDnsRecord[] = [
      makeRecord({
        type: "MX",
        name: "example.com",
        content: "aspmx.l.google.com",
        priority: 1,
      }),
      makeRecord({
        type: "TXT",
        name: "example.com",
        content: "v=spf1 include:_spf.google.com ~all",
      }),
      makeRecord({
        type: "TXT",
        name: "google._domainkey.example.com",
        content: "v=DKIM1; k=rsa; p=MIGfMA0GCSqGSIb3DQEBAQUAA4GN...",
      }),
      // Unrelated A record that must be ignored
      makeRecord({
        type: "A",
        name: "example.com",
        content: "192.0.2.1",
        proxied: true,
      }),
    ]

    const audit = detectOlderMailRecords("example.com", "zone_123", "example.com", records)

    expect(audit.hasConflicts).toBe(true)
    expect(audit.olderRecords.length).toBe(3)

    const mx = audit.olderRecords.find((r) => r.category === "mx")
    expect(mx).toBeDefined()
    expect(mx?.providerDetected).toBe("Google Workspace")

    const spf = audit.olderRecords.find((r) => r.category === "spf")
    expect(spf).toBeDefined()
    expect(spf?.providerDetected).toBe("Google Workspace")

    const dkim = audit.olderRecords.find((r) => r.category === "dkim")
    expect(dkim).toBeDefined()
    expect(dkim?.providerDetected).toBe("Google Workspace")
  })

  it("passes cleanly when dedicated mail host and records are configured", () => {
    const records: CloudflareDnsRecord[] = [
      makeRecord({
        type: "A",
        name: "mail.example.com",
        content: "23.94.107.153",
        proxied: false,
      }),
      makeRecord({
        type: "MX",
        name: "example.com",
        content: "mail.example.com",
        priority: 10,
      }),
      makeRecord({
        type: "TXT",
        name: "example.com",
        content: "v=spf1 mx a:mail.example.com ~all",
      }),
      makeRecord({
        type: "A",
        name: "example.com",
        content: "192.0.2.1",
        proxied: true,
      }),
      makeRecord({
        type: "CNAME",
        name: "www.example.com",
        content: "example.com",
        proxied: true,
      }),
    ]

    const audit = detectOlderMailRecords("example.com", "zone_123", "example.com", records, "23.94.107.153")

    expect(audit.hasConflicts).toBe(false)
    expect(audit.olderRecords.length).toBe(0)
  })

  it("flags mail host A record if proxied through Cloudflare CDN", () => {
    const records: CloudflareDnsRecord[] = [
      makeRecord({
        type: "A",
        name: "mail.example.com",
        content: "23.94.107.153",
        proxied: true, // CDN proxy breaks mail ports!
      }),
    ]

    const audit = detectOlderMailRecords("example.com", "zone_123", "example.com", records, "23.94.107.153")

    expect(audit.hasConflicts).toBe(true)
    const hostRecord = audit.olderRecords.find((r) => r.category === "mail_host")
    expect(hostRecord).toBeDefined()
    expect(hostRecord?.reason).toContain("proxied through Cloudflare CDN")
  })
})

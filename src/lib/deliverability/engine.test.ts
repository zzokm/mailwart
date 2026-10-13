import { describe, it, expect } from "vitest"
import type { DnsRecordCheck, PortCheck, OutboundProbeResult, InboundProbeResult } from "./types"

describe("Deliverability Scoring & Validation Engine", () => {
  it("validates DnsRecordCheck types and fields", () => {
    const record: DnsRecordCheck = {
      type: "SPF",
      name: "example.com",
      status: "pass",
      expected: "v=spf1 mx a:mail.example.com ~all",
      observed: "v=spf1 mx a:mail.example.com ~all",
      summary: "Valid SPF authorization verified",
      impact: "Guarantees SPF PASS authentication",
    }
    expect(record.type).toBe("SPF")
    expect(record.status).toBe("pass")
    expect(record.observed).toBe(record.expected)
  })

  it("checks port probe definitions", () => {
    const port587: PortCheck = {
      port: 587,
      service: "SMTP (Submission)",
      status: "pass",
      latencyMs: 25,
      note: "Connected (25ms, STARTTLS ready)",
    }
    expect(port587.port).toBe(587)
    expect(port587.status).toBe("pass")
    expect(port587.latencyMs).toBeGreaterThan(0)
  })

  it("validates outbound probe structure", () => {
    const outbound: OutboundProbeResult = {
      status: "pass",
      sender: "probe@example.com",
      recipient: "probe@example.com",
      queueId: "4a5527992604000",
      tlsVersion: "TLSv1.3 / STARTTLS",
      cipher: "AEAD-CHACHA20-POLY1305-SHA256",
      latencyMs: 140,
    }
    expect(outbound.status).toBe("pass")
    expect(outbound.queueId).toBeDefined()
  })

  it("validates inbound probe structure", () => {
    const inbound: InboundProbeResult = {
      status: "pass",
      targetMailbox: "probe@example.com",
      protocol: "IMAP",
      latencyMs: 50,
      handshake: "ok",
    }
    expect(inbound.status).toBe("pass")
    expect(inbound.protocol).toBe("IMAP")
    expect(inbound.handshake).toBe("ok")
  })
})

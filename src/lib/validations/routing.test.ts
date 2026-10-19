import { describe, expect, it } from "vitest"
import { upsertForwardingSchema } from "./routing"

describe("upsertForwardingSchema", () => {
  it("validates exact address forwarding to Gmail (both abstracted local-part and full address)", () => {
    // Abstracted local-part
    const res1 = upsertForwardingSchema.safeParse({
      domainId: "dom-123",
      sourceType: "exact",
      source: "sales",
      targets: ["myemail@gmail.com"],
      keepLocalCopy: true,
      enabled: true,
    })
    expect(res1.success).toBe(true)

    // Full address
    const res2 = upsertForwardingSchema.safeParse({
      domainId: "dom-123",
      sourceType: "exact",
      source: "sales@example.com",
      targets: ["myemail@gmail.com"],
      keepLocalCopy: true,
      enabled: true,
    })
    expect(res2.success).toBe(true)
  })

  it("validates wildcard source pattern forwarding (both abstracted pattern and full address)", () => {
    // Abstracted wildcard
    const res1 = upsertForwardingSchema.safeParse({
      domainId: "dom-123",
      sourceType: "wildcard",
      source: "support-*",
      targets: ["helpdesk@gmail.com"],
      keepLocalCopy: false,
    })
    expect(res1.success).toBe(true)

    // Full address pattern
    const res2 = upsertForwardingSchema.safeParse({
      domainId: "dom-123",
      sourceType: "wildcard",
      source: "support-*@example.com",
      targets: ["helpdesk@gmail.com"],
      keepLocalCopy: false,
    })
    expect(res2.success).toBe(true)
  })

  it("validates valid regex pattern", () => {
    const res = upsertForwardingSchema.safeParse({
      domainId: "dom-123",
      sourceType: "regex",
      source: "^billing-[0-9]+@example\\.com$",
      targets: ["finance@gmail.com"],
    })
    expect(res.success).toBe(true)
  })

  it("rejects invalid regex pattern", () => {
    const res = upsertForwardingSchema.safeParse({
      domainId: "dom-123",
      sourceType: "regex",
      source: "^[invalid-(regex",
      targets: ["finance@gmail.com"],
    })
    expect(res.success).toBe(false)
    if (!res.success) {
      expect(res.error.issues[0].message).toContain("Invalid regex pattern")
    }
  })

  it("allows domain catch-all with default source", () => {
    const res = upsertForwardingSchema.safeParse({
      domainId: "dom-123",
      sourceType: "domain",
      targets: ["catch@gmail.com"],
    })
    expect(res.success).toBe(true)
  })

  it("rejects empty targets", () => {
    const res = upsertForwardingSchema.safeParse({
      domainId: "dom-123",
      sourceType: "exact",
      source: "sales@example.com",
      targets: [],
    })
    expect(res.success).toBe(false)
  })

  it("rejects invalid target email format", () => {
    const res = upsertForwardingSchema.safeParse({
      domainId: "dom-123",
      sourceType: "exact",
      source: "sales@example.com",
      targets: ["not-an-email"],
    })
    expect(res.success).toBe(false)
  })
})

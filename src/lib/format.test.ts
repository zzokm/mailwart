import { describe, it, expect } from "vitest"
import {
  formatBytes,
  quotaSummary,
  scaleInfiniteMailboxQuota,
  storageProgressPercent,
  generatePassword,
  parseCsv,
  hostFromUrl,
  QUOTA_SCALE_STEP_BYTES,
} from "./format"

describe("Format Utilities", () => {
  it("formats byte values correctly into human readable units", () => {
    expect(formatBytes(0)).toBe("0 B")
    expect(formatBytes(1024)).toBe("1.0 KB")
    expect(formatBytes(1024 * 1024)).toBe("1.0 MB")
    expect(formatBytes(10 * 1024 * 1024 * 1024)).toBe("10 GB")
  })

  it("calculates quota summary accurately", () => {
    const quotas = {
      storage: 10 * 1024 * 1024,
      used: 1024 * 1024,
    }
    const summary = quotaSummary(quotas)
    expect(summary.bytes).toBe(10 * 1024 * 1024)
    expect(summary.used).toBe(1024 * 1024)
    expect(summary.label).toBe("10 MB")
    expect(summary.isUnlimited).toBe(false)
  })

  it("handles unmetered / infinite quotas by default", () => {
    const emptySummary = quotaSummary({})
    expect(emptySummary.bytes).toBeNull()
    expect(emptySummary.isUnlimited).toBe(true)
    expect(emptySummary.label).toBe("∞ Infinite")

    const nullSummary = quotaSummary(null)
    expect(nullSummary.bytes).toBeNull()
    expect(nullSummary.isUnlimited).toBe(true)
  })

  it("scales infinite mailbox quota in 0.25 GB tiers accurately", () => {
    const step = QUOTA_SCALE_STEP_BYTES // 0.25 GB
    expect(scaleInfiniteMailboxQuota(0)).toBe(step)
    expect(scaleInfiniteMailboxQuota(100 * 1024 * 1024)).toBe(step)
    expect(scaleInfiniteMailboxQuota(step)).toBe(step)
    expect(scaleInfiniteMailboxQuota(step + 1)).toBe(step * 2) // 0.5 GB
    expect(scaleInfiniteMailboxQuota(step * 2 + 500)).toBe(step * 3) // 0.75 GB
    expect(scaleInfiniteMailboxQuota(step * 3 + 1000)).toBe(step * 4) // 1.0 GB
  })

  it("calculates storageProgressPercent accurately", () => {
    expect(storageProgressPercent(500, 1000)).toBe(50)
    expect(storageProgressPercent(0, 1000)).toBe(0)
    expect(storageProgressPercent(1200, 1000)).toBe(100)
    // Infinite mailbox with 0 bytes used
    expect(storageProgressPercent(0, null)).toBe(0)
  })

  it("generates random password of specified length", () => {
    const pass1 = generatePassword(16)
    const pass2 = generatePassword(24)
    expect(pass1.length).toBe(16)
    expect(pass2.length).toBe(24)
    expect(pass1).not.toBe(pass2)
  })

  it("parses CSV correctly with and without headers", () => {
    const csv = `email,password,description\nuser1@example.com,secret123,First user\nuser2@example.com,secret456,Second user`
    const parsed = parseCsv(csv)
    expect(parsed.length).toBe(2)
    expect(parsed[0].email).toBe("user1@example.com")
    expect(parsed[0].password).toBe("secret123")
    expect(parsed[0].description).toBe("First user")
  })

  it("extracts host from URL safely", () => {
    expect(hostFromUrl("https://mail.example.com/webmail")).toBe("mail.example.com")
    expect(hostFromUrl("invalid-url")).toBe("invalid-url")
  })
})

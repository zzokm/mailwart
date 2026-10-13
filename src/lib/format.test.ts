import { describe, it, expect } from "vitest"
import {
  formatBytes,
  quotaSummary,
  storageProgressPercent,
  generatePassword,
  parseCsv,
  hostFromUrl,
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
  })

  it("calculates storageProgressPercent accurately", () => {
    expect(storageProgressPercent(500, 1000)).toBe(50)
    expect(storageProgressPercent(0, 1000)).toBe(0)
    expect(storageProgressPercent(1200, 1000)).toBe(100)
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

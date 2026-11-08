import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"

import { POST, validateStrongPassword } from "./route"

vi.mock("@/lib/stalwart/accounts", () => ({
  queryAccounts: vi.fn(),
  updateAccountPassword: vi.fn(),
}))

vi.mock("@/lib/audit", () => ({
  recordAudit: vi.fn(),
}))

describe("Webmail Change Password API (/api/webmail/change-password)", () => {
  const ORIGINAL_ENV = process.env

  beforeEach(() => {
    vi.resetModules()
    process.env = {
      ...ORIGINAL_ENV,
      STALWART_JMAP_URL: "http://stalwart-mail:8080/jmap",
      STALWART_ADMIN_USER: "admin@zokm.me",
      STALWART_ADMIN_PASSWORD: "AdminSecretPassword123!",
      RAV_INTERNAL_URL: "http://email-manager-rav:3001",
    }
  })

  afterEach(() => {
    process.env = ORIGINAL_ENV
    vi.restoreAllMocks()
  })

  describe("validateStrongPassword", () => {
    it("rejects passwords under 14 characters", () => {
      const res = validateStrongPassword("Abc!12345678", "oldPass", "user@test.com")
      expect(res.valid).toBe(false)
      expect(res.error).toContain("at least 14 characters")
    })

    it("rejects passwords without uppercase letters", () => {
      const res = validateStrongPassword("abcdef!12345678", "oldPass", "user@test.com")
      expect(res.valid).toBe(false)
      expect(res.error).toContain("uppercase letter")
    })

    it("rejects passwords without lowercase letters", () => {
      const res = validateStrongPassword("ABCDEF!12345678", "oldPass", "user@test.com")
      expect(res.valid).toBe(false)
      expect(res.error).toContain("lowercase letter")
    })

    it("rejects passwords without numbers", () => {
      const res = validateStrongPassword("Abcdefghijklm!", "oldPass", "user@test.com")
      expect(res.valid).toBe(false)
      expect(res.error).toContain("number")
    })

    it("rejects passwords without special symbols", () => {
      const res = validateStrongPassword("Abcdefghijklm12", "oldPass", "user@test.com")
      expect(res.valid).toBe(false)
      expect(res.error).toContain("special character")
    })

    it("rejects passwords containing the email username", () => {
      const res = validateStrongPassword("MySecretPass_ioqjxn_123!", "oldPass", "ioqjxn@lebasko.com")
      expect(res.valid).toBe(false)
      expect(res.error).toContain("cannot contain your email username")
    })

    it("rejects passwords identical to current password", () => {
      const res = validateStrongPassword("SamePassword123!@#", "SamePassword123!@#", "user@test.com")
      expect(res.valid).toBe(false)
      expect(res.error).toContain("different from your current password")
    })

    it("accepts a password meeting all strong criteria", () => {
      const res = validateStrongPassword("CorrectHorseBatteryStaple99!", "OldPassword123!", "user@test.com")
      expect(res.valid).toBe(true)
      expect(res.error).toBeUndefined()
    })
  })

  describe("POST handler", () => {
    it("returns 400 when required fields are missing", async () => {
      const req = new NextRequest("http://localhost/api/webmail/change-password", {
        method: "POST",
        body: JSON.stringify({ email: "user@test.com" }),
      })
      const res = await POST(req)
      expect(res.status).toBe(400)
    })

    it("returns 400 when passwords do not match", async () => {
      const req = new NextRequest("http://localhost/api/webmail/change-password", {
        method: "POST",
        body: JSON.stringify({
          email: "user@test.com",
          currentPassword: "OldPassword123!",
          newPassword: "SuperSecurePass1234!@#",
          confirmPassword: "DifferentPass1234!@#",
        }),
      })
      const res = await POST(req)
      expect(res.status).toBe(400)
      const data = await res.json()
      expect(data.error).toContain("do not match")
    })

    it("returns 401 when current password is wrong", async () => {
      // Mock fetch for Rav auth check returning 401
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
      })

      const req = new NextRequest("http://localhost/api/webmail/change-password", {
        method: "POST",
        body: JSON.stringify({
          email: "user@test.com",
          currentPassword: "WrongPassword123!",
          newPassword: "SuperSecurePass1234!@#",
          confirmPassword: "SuperSecurePass1234!@#",
        }),
      })
      const res = await POST(req)
      expect(res.status).toBe(401)
      const data = await res.json()
      expect(data.error).toContain("Current password is incorrect")
    })

    it("successfully updates password when current password is verified", async () => {
      const { queryAccounts, updateAccountPassword } = await import("@/lib/stalwart/accounts")
      vi.mocked(queryAccounts).mockResolvedValue([
        {
          id: "acc-123",
          email: "user@test.com",
          name: "user",
          domainId: "test.com",
          emails: ["user@test.com"],
          quotaBytes: 0,
          usedBytes: 0,
          status: "active",
        } as any,
      ])
      vi.mocked(updateAccountPassword).mockResolvedValue(undefined)

      // Mock fetch returning ok for Rav login
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
      })

      const req = new NextRequest("http://localhost/api/webmail/change-password", {
        method: "POST",
        body: JSON.stringify({
          email: "user@test.com",
          currentPassword: "ValidCurrentPassword123!",
          newPassword: "BrandNewSecurePassword1234!@#",
          confirmPassword: "BrandNewSecurePassword1234!@#",
        }),
      })

      const res = await POST(req)
      expect(res.status).toBe(200)
      const data = await res.json()
      expect(data.ok).toBe(true)
      expect(updateAccountPassword).toHaveBeenCalledWith("acc-123", "BrandNewSecurePassword1234!@#")
    })

    it("allows admin password to verify current password (SSO session support)", async () => {
      const { queryAccounts, updateAccountPassword } = await import("@/lib/stalwart/accounts")
      vi.mocked(queryAccounts).mockResolvedValue([
        {
          id: "acc-123",
          email: "user@test.com",
          name: "user",
          domainId: "test.com",
          emails: ["user@test.com"],
          quotaBytes: 0,
          usedBytes: 0,
          status: "active",
        } as any,
      ])
      vi.mocked(updateAccountPassword).mockResolvedValue(undefined)

      const req = new NextRequest("http://localhost/api/webmail/change-password", {
        method: "POST",
        body: JSON.stringify({
          email: "user@test.com%admin",
          currentPassword: "AdminSecretPassword123!", // matches STALWART_ADMIN_PASSWORD
          newPassword: "BrandNewSecurePassword1234!@#",
          confirmPassword: "BrandNewSecurePassword1234!@#",
        }),
      })

      const res = await POST(req)
      expect(res.status).toBe(200)
      const data = await res.json()
      expect(data.ok).toBe(true)
      expect(updateAccountPassword).toHaveBeenCalledWith("acc-123", "BrandNewSecurePassword1234!@#")
    })
  })
})

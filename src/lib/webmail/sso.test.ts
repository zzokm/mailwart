import { describe, expect, it } from "vitest"
import { buildRavUrl, buildRoundcubeUrl, buildWebmailUrl } from "@/lib/webmail-client"

describe("Webmail Client URL Building", () => {
  it("builds generic webmail SSO URL with email and client", () => {
    expect(buildWebmailUrl("ops@example.com", "rav")).toBe(
      "/api/webmail/sso?email=ops%40example.com&client=rav"
    )
    expect(buildWebmailUrl("ops@example.com", "roundcube")).toBe(
      "/api/webmail/sso?email=ops%40example.com&client=roundcube"
    )
  })

  it("builds Rav specific launcher URL", () => {
    expect(buildRavUrl("alice@domain.org")).toBe(
      "/api/webmail/sso?email=alice%40domain.org&client=rav"
    )
  })

  it("builds default launcher URL without explicit client when unspecified", () => {
    expect(buildWebmailUrl("user@domain.com")).toBe(
      "/api/webmail/sso?email=user%40domain.com"
    )
    expect(buildRoundcubeUrl("user@domain.com")).toBe(
      "/api/webmail/sso?email=user%40domain.com"
    )
  })

  it("handles blank email gracefully", () => {
    expect(buildWebmailUrl()).toBe("/api/webmail/sso")
  })
})

describe("Webmail SSO Token Lifecycle", () => {
  const TEST_SECRET = "0123456789abcdef0123456789abcdef" // 32 chars

  it("creates and verifies valid SSO tokens", async () => {
    process.env.WEBMAIL_SSO_SECRET = TEST_SECRET
    const { createWebmailSsoToken, verifyWebmailSsoToken } = await import(
      "@/lib/webmail-sso"
    )

    const token = createWebmailSsoToken("user@example.com")
    expect(typeof token).toBe("string")
    expect(token).toContain(".")

    const verified = verifyWebmailSsoToken(token)
    expect(verified).not.toBeNull()
    expect(verified?.email).toBe("user@example.com")
  })

  it("rejects tampered tokens", async () => {
    process.env.WEBMAIL_SSO_SECRET = TEST_SECRET
    const { createWebmailSsoToken, verifyWebmailSsoToken } = await import(
      "@/lib/webmail-sso"
    )

    const token = createWebmailSsoToken("user@example.com")
    const parts = token.split(".")
    const tampered = `${parts[0]}x.${parts[1]}`

    expect(verifyWebmailSsoToken(tampered)).toBeNull()
  })

  it("rejects malformed tokens", async () => {
    process.env.WEBMAIL_SSO_SECRET = TEST_SECRET
    const { verifyWebmailSsoToken } = await import("@/lib/webmail-sso")

    expect(verifyWebmailSsoToken("")).toBeNull()
    expect(verifyWebmailSsoToken("invalid-format")).toBeNull()
    expect(verifyWebmailSsoToken("a.b.c")).toBeNull()
  })

  it("throws error when secret is too short or missing during token creation", async () => {
    delete process.env.WEBMAIL_SSO_SECRET
    const { createWebmailSsoToken } = await import("@/lib/webmail-sso")

    expect(() => createWebmailSsoToken("user@example.com")).toThrow(
      "WEBMAIL_SSO_SECRET must be at least 32 characters."
    )
  })
})


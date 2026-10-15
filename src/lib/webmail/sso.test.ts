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

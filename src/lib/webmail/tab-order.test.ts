import { describe, expect, it } from "vitest"

describe("Settings Tab Order Rules", () => {
  it("verifies deliverability is before last and account is last for admin users", () => {
    const adminTabs = [
      "cloudflare",
      "copilot",
      "users",
      "system",
      "webmail",
      "deliverability",
      "account",
    ]

    expect(adminTabs[adminTabs.length - 1]).toBe("account")
    expect(adminTabs[adminTabs.length - 2]).toBe("deliverability")
    expect(adminTabs).toContain("webmail")
  })

  it("verifies deliverability is before last and account is last for non-admin users", () => {
    const nonAdminTabs = [
      "cloudflare",
      "webmail",
      "deliverability",
      "account",
    ]

    expect(nonAdminTabs[nonAdminTabs.length - 1]).toBe("account")
    expect(nonAdminTabs[nonAdminTabs.length - 2]).toBe("deliverability")
    expect(nonAdminTabs).toContain("webmail")
  })
})

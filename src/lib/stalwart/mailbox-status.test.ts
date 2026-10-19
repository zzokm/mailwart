import { describe, expect, it } from "vitest"
import { getMailboxesActivity } from "./mailbox-status"

describe("getMailboxesActivity", () => {
  it("strictly returns 0 unread and 0 new for accounts with 0 storage used (e.g. cath@zokm.dev)", async () => {
    const map = await getMailboxesActivity([
      { email: "cath@zokm.dev", usedBytes: 0 },
    ])
    const act = map.get("cath@zokm.dev")
    expect(act).toBeDefined()
    expect(act?.unreadCount).toBe(0)
    expect(act?.newCount).toBe(0)
  })

  it("returns 0 for any unseeded accounts rather than generating pseudo-random or hash values", async () => {
    const map = await getMailboxesActivity([
      "cath@zokm.dev",
      "test@zokm.dev",
      "admin@zokm.dev",
    ])
    expect(map.get("cath@zokm.dev")).toEqual({ unreadCount: 0, newCount: 0 })
    expect(map.get("test@zokm.dev")).toEqual({ unreadCount: 0, newCount: 0 })
    expect(map.get("admin@zokm.dev")).toEqual({ unreadCount: 0, newCount: 0 })
  })

  it("correctly preserves mock store entries for seeded accounts in mock mode", async () => {
    const map = await getMailboxesActivity(["billing@example.com", "noreply@example.com"])
    expect(map.get("billing@example.com")).toEqual({ unreadCount: 5, newCount: 3 })
    expect(map.get("noreply@example.com")).toEqual({ unreadCount: 0, newCount: 0 })
  })
})

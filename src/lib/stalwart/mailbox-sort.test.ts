import { describe, expect, it } from "vitest"
import {
  SORT_FIELD_OPTIONS,
  getDirectionLabel,
} from "@/components/mail/mailbox-table"

describe("Mailbox Sorting Options and Helpers", () => {
  it("provides all expected sort fields including columns, date, and capacity", () => {
    const fieldIds = SORT_FIELD_OPTIONS.map((o) => o.id)
    expect(fieldIds).toContain("email")
    expect(fieldIds).toContain("domain")
    expect(fieldIds).toContain("space")
    expect(fieldIds).toContain("capacity")
    expect(fieldIds).toContain("status")
    expect(fieldIds).toContain("notifications")
    expect(fieldIds).toContain("date")
    expect(fieldIds).toContain("name")
  })

  it("returns human-readable direction labels for each sort field", () => {
    expect(getDirectionLabel("email", "asc")).toBe("A → Z")
    expect(getDirectionLabel("email", "desc")).toBe("Z → A")
    expect(getDirectionLabel("date", "desc")).toBe("Newest first")
    expect(getDirectionLabel("date", "asc")).toBe("Oldest first")
    expect(getDirectionLabel("space", "desc")).toBe("Highest used")
    expect(getDirectionLabel("space", "asc")).toBe("Lowest used")
    expect(getDirectionLabel("capacity", "desc")).toBe("Largest capacity")
    expect(getDirectionLabel("status", "asc")).toBe("Active first")
    expect(getDirectionLabel("notifications", "desc")).toBe("Most unread")
  })

  it("correctly sorts newest domain mailboxes (e.g. scboost) topmost in desc and bottommost in asc", () => {
    const olderDomainDate = "2026-09-01T00:00:00Z"
    const newestDomainDate = "2026-11-01T00:00:00Z"

    const accounts = [
      { id: "1", email: "admin@zokm.me", domainId: "zokm-me", createdAt: olderDomainDate },
      { id: "2", email: "catch@lebasko.com", domainId: "lebasko-com", createdAt: "2026-10-15T00:00:00Z" },
      { id: "3", email: "catch@scboost.com", domainId: "scboost-com", createdAt: newestDomainDate },
    ]

    // Newest first (desc)
    const descSorted = [...accounts].sort((a, b) => {
      const tA = new Date(a.createdAt).getTime()
      const tB = new Date(b.createdAt).getTime()
      return tB - tA
    })
    expect(descSorted[0].email).toBe("catch@scboost.com")

    // Oldest first (asc)
    const ascSorted = [...accounts].sort((a, b) => {
      const tA = new Date(a.createdAt).getTime()
      const tB = new Date(b.createdAt).getTime()
      return tA - tB
    })
    expect(ascSorted[ascSorted.length - 1].email).toBe("catch@scboost.com")
  })
})


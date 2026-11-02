import { describe, expect, it } from "vitest"
import {
  SORT_FIELD_OPTIONS,
  getDirectionLabel,
  type MailboxSortField,
  type MailboxSortDirection,
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
})

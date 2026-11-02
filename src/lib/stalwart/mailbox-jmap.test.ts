import { describe, expect, it } from "vitest"
import {
  deleteMailboxEmail,
  getMailboxEmail,
  listMailboxFolders,
  moveMailboxEmail,
  queryMailboxEmails,
  sendMailboxEmail,
  setMailboxEmailFlags,
} from "./mailbox-jmap"

describe("JMAP Mailbox Direct Engine (mailbox-jmap)", () => {
  const testAccount = "me@yehia.dev"

  it("lists all folders for a mailbox", async () => {
    const res = await listMailboxFolders(testAccount)
    expect(res.ok).toBe(true)
    expect(res.folders.length).toBeGreaterThanOrEqual(4)

    const roles = res.folders.map((f) => f.role)
    expect(roles).toContain("inbox")
    expect(roles).toContain("sent")
    expect(roles).toContain("drafts")
    expect(roles).toContain("trash")
  })

  it("queries and searches emails with multiple filters", async () => {
    // 1. All emails
    const all = await queryMailboxEmails(testAccount)
    expect(all.ok).toBe(true)
    expect(all.emails.length).toBeGreaterThan(0)

    // 2. Filter by sender
    const acme = await queryMailboxEmails(testAccount, { from: "acme.com" })
    expect(acme.ok).toBe(true)
    expect(acme.emails.length).toBe(1)
    expect(acme.emails[0].subject).toContain("Receipt")

    // 3. Filter by subject keywords
    const prs = await queryMailboxEmails(testAccount, { subject: "Pull Request" })
    expect(prs.ok).toBe(true)
    expect(prs.emails.length).toBe(1)
    expect(prs.emails[0].id).toBe("msg-002")

    // 4. Filter by unread
    const unread = await queryMailboxEmails(testAccount, { isUnread: true })
    expect(unread.ok).toBe(true)
    expect(unread.emails.every((e) => !e.isRead)).toBe(true)

    // 5. Filter by attachments
    const withAtt = await queryMailboxEmails(testAccount, { hasAttachment: true })
    expect(withAtt.ok).toBe(true)
    expect(withAtt.emails.every((e) => e.hasAttachment)).toBe(true)
  })

  it("retrieves full email content including body and attachments metadata", async () => {
    const res = await getMailboxEmail(testAccount, "msg-001")
    expect(res.ok).toBe(true)
    expect(res.email).toBeDefined()
    expect(res.email?.subject).toContain("Monthly Subscription Receipt")
    expect(res.email?.bodyText).toContain("$25.00")
    expect(res.email?.bodyHtml).toContain("<strong>$25.00</strong>")
    expect(res.email?.attachments.length).toBe(1)
    expect(res.email?.attachments[0].name).toBe("invoice_nov_2026.pdf")
  })

  it("sets email flags (read, flagged, custom keywords)", async () => {
    // Mark unread and flagged
    const flagRes = await setMailboxEmailFlags(testAccount, "msg-001", {
      isRead: false,
      isFlagged: true,
      addKeywords: ["$important"],
    })
    expect(flagRes.ok).toBe(true)

    const updated = await getMailboxEmail(testAccount, "msg-001")
    expect(updated.email?.isRead).toBe(false)
    expect(updated.email?.isFlagged).toBe(true)
    expect(updated.email?.keywords["$important"]).toBe(true)

    // Revert back to read
    await setMailboxEmailFlags(testAccount, "msg-001", { isRead: true, isFlagged: false })
  })

  it("moves an email between folders", async () => {
    const moveRes = await moveMailboxEmail(testAccount, "msg-003", "archive")
    expect(moveRes.ok).toBe(true)

    const updated = await getMailboxEmail(testAccount, "msg-003")
    expect(updated.email?.mailboxIds["mb-archive"]).toBe(true)
    expect(updated.email?.mailboxIds["mb-inbox"]).toBeUndefined()
  })

  it("trashes and permanently deletes emails", async () => {
    // 1. Move to trash
    const trashRes = await deleteMailboxEmail(testAccount, "msg-003", false)
    expect(trashRes.ok).toBe(true)
    expect(trashRes.action).toBe("trashed")

    const trashed = await getMailboxEmail(testAccount, "msg-003")
    expect(trashed.email?.mailboxIds["mb-trash"]).toBe(true)

    // 2. Permanent delete
    const permRes = await deleteMailboxEmail(testAccount, "msg-003", true)
    expect(permRes.ok).toBe(true)
    expect(permRes.action).toBe("destroyed")

    const deleted = await getMailboxEmail(testAccount, "msg-003")
    expect(deleted.ok).toBe(false)
  })

  it("creates drafts and sends messages via JMAP", async () => {
    // Create draft
    const draftRes = await sendMailboxEmail(testAccount, {
      to: ["team@example.com"],
      subject: "Test Draft Message",
      bodyText: "This is a draft message from the test suite.",
      isDraft: true,
    })
    expect(draftRes.ok).toBe(true)
    expect(draftRes.isDraft).toBe(true)
    expect(draftRes.emailId).toBeDefined()

    // Query draft
    const draft = await getMailboxEmail(testAccount, draftRes.emailId!)
    expect(draft.ok).toBe(true)
    expect(draft.email?.mailboxIds["mb-drafts"]).toBe(true)

    // Send email
    const sendRes = await sendMailboxEmail(testAccount, {
      to: ["client@example.com"],
      subject: "Immediate Outbound Email",
      bodyText: "Hello client, your order has shipped.",
      isDraft: false,
    })
    expect(sendRes.ok).toBe(true)
    expect(sendRes.isDraft).toBe(false)
    expect(sendRes.emailId).toBeDefined()

    const sent = await getMailboxEmail(testAccount, sendRes.emailId!)
    expect(sent.ok).toBe(true)
    expect(sent.email?.mailboxIds["mb-sent"]).toBe(true)
  })
})


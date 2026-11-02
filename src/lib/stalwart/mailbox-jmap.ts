import "server-only"

import { jmapCall, responseById } from "./client"
import { queryAccounts } from "./accounts"
import { queryDomains } from "./domains"
import { getStalwartConfig } from "@/lib/env"
import type { JmapMethodCall } from "./types"

export interface MailboxFolder {
  id: string
  name: string
  role?: string | null
  totalEmails: number
  unreadEmails: number
  totalThreads?: number
  unreadThreads?: number
  parentId?: string | null
  sortOrder?: number
}

export interface EmailAddressGroup {
  name?: string | null
  email: string
}

export interface EmailSummary {
  id: string
  blobId?: string
  threadId?: string
  mailboxIds: Record<string, boolean>
  keywords: Record<string, boolean>
  isRead: boolean
  isFlagged: boolean
  size: number
  receivedAt: string
  sentAt?: string | null
  from?: EmailAddressGroup[] | null
  to?: EmailAddressGroup[] | null
  cc?: EmailAddressGroup[] | null
  bcc?: EmailAddressGroup[] | null
  subject?: string | null
  preview?: string | null
  hasAttachment?: boolean
}

export interface EmailDetail extends EmailSummary {
  replyTo?: EmailAddressGroup[] | null
  bodyText?: string | null
  bodyHtml?: string | null
  attachments: Array<{
    partId?: string
    blobId?: string
    name?: string
    type?: string
    size?: number
    cid?: string | null
  }>
  headers?: Array<{ name: string; value: string }>
}

export interface EmailQueryFilter {
  folderId?: string
  folderRole?: "inbox" | "sent" | "drafts" | "trash" | "junk" | "archive"
  from?: string
  to?: string
  subject?: string
  text?: string
  after?: string
  before?: string
  isUnread?: boolean
  isFlagged?: boolean
  hasAttachment?: boolean
  limit?: number
  offset?: number
}

// ---------------------------------------------------------------------------
// Mock In-Memory Store for Testing and Local Development
// ---------------------------------------------------------------------------

const MOCK_FOLDERS: MailboxFolder[] = [
  { id: "mb-inbox", name: "Inbox", role: "inbox", totalEmails: 5, unreadEmails: 2 },
  { id: "mb-sent", name: "Sent", role: "sent", totalEmails: 3, unreadEmails: 0 },
  { id: "mb-drafts", name: "Drafts", role: "drafts", totalEmails: 1, unreadEmails: 0 },
  { id: "mb-trash", name: "Trash", role: "trash", totalEmails: 2, unreadEmails: 0 },
  { id: "mb-junk", name: "Spam", role: "junk", totalEmails: 1, unreadEmails: 1 },
  { id: "mb-archive", name: "Archive", role: "archive", totalEmails: 10, unreadEmails: 0 },
]

const MOCK_EMAILS: EmailDetail[] = [
  {
    id: "msg-001",
    mailboxIds: { "mb-inbox": true },
    keywords: { "$seen": true },
    isRead: true,
    isFlagged: false,
    size: 2450,
    receivedAt: "2026-11-01T10:15:00Z",
    sentAt: "2026-11-01T10:14:50Z",
    from: [{ name: "Acme Cloud", email: "billing@acme.com" }],
    to: [{ name: "Yehia", email: "me@yehia.dev" }],
    subject: "Monthly Subscription Receipt #INV-2026-11",
    preview: "Thank you for your business. Your receipt for November 2026 is attached.",
    bodyText: "Hi Yehia,\n\nThank you for your business. Your payment of $25.00 has succeeded.\nInvoice: #INV-2026-11\n\nBest regards,\nAcme Cloud Team",
    bodyHtml: "<p>Hi Yehia,</p><p>Thank you for your business. Your payment of <strong>$25.00</strong> has succeeded.</p><p>Invoice: <code>#INV-2026-11</code></p>",
    hasAttachment: true,
    attachments: [
      { partId: "att-1", name: "invoice_nov_2026.pdf", type: "application/pdf", size: 45020 },
    ],
  },
  {
    id: "msg-002",
    mailboxIds: { "mb-inbox": true },
    keywords: {},
    isRead: false,
    isFlagged: true,
    size: 1540,
    receivedAt: "2026-11-02T08:30:00Z",
    sentAt: "2026-11-02T08:29:40Z",
    from: [{ name: "GitHub Notifications", email: "notifications@github.com" }],
    to: [{ name: "Yehia", email: "me@yehia.dev" }],
    subject: "[mailwart] Pull Request #42: Modern MCP Server System",
    preview: "zzokm submitted pull request #42 with 5 commits for review.",
    bodyText: "Pull Request #42 has been opened: feat(mcp): full-featured admin MCP server system with direct mailbox access.\n\nReview at: https://github.com/zzokm/mailwart/pull/42",
    bodyHtml: "<p>Pull Request #42 has been opened: <strong>feat(mcp): full-featured admin MCP server system</strong>.</p><p><a href=\"https://github.com/zzokm/mailwart/pull/42\">View Pull Request</a></p>",
    hasAttachment: false,
    attachments: [],
  },
  {
    id: "msg-003",
    mailboxIds: { "mb-inbox": true },
    keywords: {},
    isRead: false,
    isFlagged: false,
    size: 3200,
    receivedAt: "2026-11-02T11:00:00Z",
    sentAt: "2026-11-02T10:59:10Z",
    from: [{ name: "Security Team", email: "security@cloudflare.com" }],
    to: [{ name: "Yehia", email: "me@yehia.dev" }],
    subject: "DNS Record Verification Completed for yehia.dev",
    preview: "All zone records for yehia.dev have been propagated and validated successfully.",
    bodyText: "Your Cloudflare DNS records (MX, SPF, DKIM, DMARC) are healthy and active.",
    bodyHtml: "<p>Your Cloudflare DNS records (MX, SPF, DKIM, DMARC) are healthy and active.</p>",
    hasAttachment: false,
    attachments: [],
  },
]

let liveMockEmails = [...MOCK_EMAILS]

// ---------------------------------------------------------------------------
// Account Resolution Helper
// ---------------------------------------------------------------------------

export async function resolveStalwartAccountId(
  emailOrId: string
): Promise<{ id: string; email: string }> {
  const config = getStalwartConfig()
  const isLive = Boolean(config && process.env.NODE_ENV !== "test")

  if (!isLive) {
    return {
      id: emailOrId.includes("@") ? `acc-${emailOrId.split("@")[0]}` : emailOrId,
      email: emailOrId.includes("@") ? emailOrId.toLowerCase() : `${emailOrId}@example.com`,
    }
  }

  // If already an ID without @, verify or return
  if (!emailOrId.includes("@")) {
    return { id: emailOrId, email: emailOrId }
  }

  // Lookup account by email in Stalwart
  const domains = await queryDomains()
  const accounts = await queryAccounts(domains)
  const target = emailOrId.toLowerCase()
  const found = accounts.find((a) => a.email.toLowerCase() === target)
  if (found) {
    return { id: found.id, email: found.email }
  }

  // Fallback: use email directly as JMAP accountId
  return { id: emailOrId, email: emailOrId }
}

// ---------------------------------------------------------------------------
// 1. List Mailbox Folders
// ---------------------------------------------------------------------------

export async function listMailboxFolders(
  emailOrId: string
): Promise<{ ok: boolean; folders: MailboxFolder[]; error?: string }> {
  const config = getStalwartConfig()
  const isLive = Boolean(config && process.env.NODE_ENV !== "test")

  if (!isLive) {
    return { ok: true, folders: MOCK_FOLDERS }
  }

  try {
    const acc = await resolveStalwartAccountId(emailOrId)
    const calls: JmapMethodCall[] = [
      [
        "Mailbox/get",
        {
          accountId: acc.id,
          properties: [
            "id",
            "name",
            "role",
            "totalEmails",
            "unreadEmails",
            "totalThreads",
            "unreadThreads",
            "parentId",
            "sortOrder",
          ],
        },
        "get_folders",
      ],
    ]

    const res = await jmapCall(calls, {
      using: ["urn:ietf:params:jmap:core", "urn:ietf:params:jmap:mail"],
    })

    const data = responseById(res, "get_folders")
    if (!data || !Array.isArray(data.list)) {
      return { ok: false, folders: [], error: "No folders returned from mail server" }
    }

    const folders: MailboxFolder[] = (data.list as Array<Record<string, unknown>>).map((mb) => ({
      id: String(mb.id ?? ""),
      name: String(mb.name ?? ""),
      role: (mb.role as string) || null,
      totalEmails: typeof mb.totalEmails === "number" ? mb.totalEmails : 0,
      unreadEmails: typeof mb.unreadEmails === "number" ? mb.unreadEmails : 0,
      totalThreads: typeof mb.totalThreads === "number" ? mb.totalThreads : undefined,
      unreadThreads: typeof mb.unreadThreads === "number" ? mb.unreadThreads : undefined,
      parentId: (mb.parentId as string) || null,
      sortOrder: typeof mb.sortOrder === "number" ? mb.sortOrder : undefined,
    }))

    return { ok: true, folders }
  } catch (err) {
    return {
      ok: false,
      folders: [],
      error: err instanceof Error ? err.message : String(err),
    }
  }
}

// ---------------------------------------------------------------------------
// 2. Query & Search Emails
// ---------------------------------------------------------------------------

export async function queryMailboxEmails(
  emailOrId: string,
  filter: EmailQueryFilter = {}
): Promise<{
  ok: boolean
  emails: EmailSummary[]
  total: number
  limit: number
  offset: number
  error?: string
}> {
  const limit = Math.max(1, Math.min(100, filter.limit ?? 25))
  const offset = Math.max(0, filter.offset ?? 0)

  const config = getStalwartConfig()
  const isLive = Boolean(config && process.env.NODE_ENV !== "test")

  if (!isLive) {
    let matches = [...liveMockEmails]

    if (filter.folderId) {
      matches = matches.filter((m) => Boolean(m.mailboxIds[filter.folderId!]))
    }
    if (filter.from) {
      const q = filter.from.toLowerCase()
      matches = matches.filter((m) => m.from?.some((f) => f.email.toLowerCase().includes(q) || f.name?.toLowerCase().includes(q)))
    }
    if (filter.to) {
      const q = filter.to.toLowerCase()
      matches = matches.filter((m) => m.to?.some((t) => t.email.toLowerCase().includes(q) || t.name?.toLowerCase().includes(q)))
    }
    if (filter.subject) {
      const q = filter.subject.toLowerCase()
      matches = matches.filter((m) => m.subject?.toLowerCase().includes(q))
    }
    if (filter.text) {
      const q = filter.text.toLowerCase()
      matches = matches.filter(
        (m) =>
          m.subject?.toLowerCase().includes(q) ||
          m.preview?.toLowerCase().includes(q) ||
          m.bodyText?.toLowerCase().includes(q)
      )
    }
    if (typeof filter.isUnread === "boolean") {
      matches = matches.filter((m) => (filter.isUnread ? !m.isRead : m.isRead))
    }
    if (typeof filter.isFlagged === "boolean") {
      matches = matches.filter((m) => m.isFlagged === filter.isFlagged)
    }
    if (typeof filter.hasAttachment === "boolean") {
      matches = matches.filter((m) => Boolean(m.hasAttachment) === filter.hasAttachment)
    }
    if (filter.after) {
      const afterDate = new Date(filter.after).getTime()
      if (!Number.isNaN(afterDate)) {
        matches = matches.filter((m) => new Date(m.receivedAt).getTime() >= afterDate)
      }
    }
    if (filter.before) {
      const beforeDate = new Date(filter.before).getTime()
      if (!Number.isNaN(beforeDate)) {
        matches = matches.filter((m) => new Date(m.receivedAt).getTime() <= beforeDate)
      }
    }

    const total = matches.length
    const paged = matches.slice(offset, offset + limit).map((m) => ({
      id: m.id,
      blobId: m.blobId,
      threadId: m.threadId,
      mailboxIds: m.mailboxIds,
      keywords: m.keywords,
      isRead: m.isRead,
      isFlagged: m.isFlagged,
      size: m.size,
      receivedAt: m.receivedAt,
      sentAt: m.sentAt,
      from: m.from,
      to: m.to,
      cc: m.cc,
      bcc: m.bcc,
      subject: m.subject,
      preview: m.preview,
      hasAttachment: m.hasAttachment,
    }))

    return { ok: true, emails: paged, total, limit, offset }
  }

  try {
    const acc = await resolveStalwartAccountId(emailOrId)

    // Build JMAP Email/query filter condition
    const jmapConditions: Array<Record<string, unknown>> = []

    if (filter.folderId) {
      jmapConditions.push({ inMailbox: filter.folderId })
    }
    if (filter.from) {
      jmapConditions.push({ from: filter.from })
    }
    if (filter.to) {
      jmapConditions.push({ to: filter.to })
    }
    if (filter.subject) {
      jmapConditions.push({ subject: filter.subject })
    }
    if (filter.text) {
      jmapConditions.push({ text: filter.text })
    }
    if (filter.after) {
      jmapConditions.push({ after: filter.after })
    }
    if (filter.before) {
      jmapConditions.push({ before: filter.before })
    }
    if (filter.hasAttachment !== undefined) {
      jmapConditions.push({ hasAttachment: filter.hasAttachment })
    }

    const jmapFilter: Record<string, unknown> =
      jmapConditions.length === 1
        ? jmapConditions[0]
        : jmapConditions.length > 1
          ? { operator: "AND", conditions: jmapConditions }
          : {}

    const calls: JmapMethodCall[] = [
      [
        "Email/query",
        {
          accountId: acc.id,
          filter: Object.keys(jmapFilter).length > 0 ? jmapFilter : undefined,
          sort: [{ property: "receivedAt", isAscending: false }],
          position: offset,
          limit,
          calculateTotal: true,
        },
        "query_emails",
      ],
      [
        "Email/get",
        {
          accountId: acc.id,
          "#ids": {
            resultOf: "query_emails",
            name: "Email/query",
            path: "/ids",
          },
          properties: [
            "id",
            "blobId",
            "threadId",
            "mailboxIds",
            "keywords",
            "size",
            "receivedAt",
            "sentAt",
            "from",
            "to",
            "cc",
            "bcc",
            "subject",
            "preview",
            "hasAttachment",
          ],
        },
        "get_emails",
      ],
    ]

    const res = await jmapCall(calls, {
      using: ["urn:ietf:params:jmap:core", "urn:ietf:params:jmap:mail"],
    })

    const qData = responseById(res, "query_emails")
    const gData = responseById(res, "get_emails")

    const ids = Array.isArray(qData?.ids) ? (qData.ids as string[]) : []
    const total = typeof qData?.total === "number" ? qData.total : ids.length
    const list = Array.isArray(gData?.list) ? (gData.list as Array<Record<string, unknown>>) : []

    const emails: EmailSummary[] = list.map((item) => {
      const keywords = (item.keywords as Record<string, boolean>) || {}
      return {
        id: String(item.id ?? ""),
        blobId: item.blobId as string | undefined,
        threadId: item.threadId as string | undefined,
        mailboxIds: (item.mailboxIds as Record<string, boolean>) || {},
        keywords,
        isRead: Boolean(keywords["$seen"]),
        isFlagged: Boolean(keywords["$flagged"]),
        size: typeof item.size === "number" ? item.size : 0,
        receivedAt: String(item.receivedAt ?? new Date().toISOString()),
        sentAt: item.sentAt as string | undefined | null,
        from: (item.from as EmailAddressGroup[]) || null,
        to: (item.to as EmailAddressGroup[]) || null,
        cc: (item.cc as EmailAddressGroup[]) || null,
        bcc: (item.bcc as EmailAddressGroup[]) || null,
        subject: (item.subject as string) || null,
        preview: (item.preview as string) || null,
        hasAttachment: Boolean(item.hasAttachment),
      }
    })

    return { ok: true, emails, total, limit, offset }
  } catch (err) {
    return {
      ok: false,
      emails: [],
      total: 0,
      limit,
      offset,
      error: err instanceof Error ? err.message : String(err),
    }
  }
}

// ---------------------------------------------------------------------------
// 3. Get Full Email Details
// ---------------------------------------------------------------------------

export async function getMailboxEmail(
  emailOrId: string,
  emailId: string
): Promise<{ ok: boolean; email?: EmailDetail; error?: string }> {
  const config = getStalwartConfig()
  const isLive = Boolean(config && process.env.NODE_ENV !== "test")

  if (!isLive) {
    const found = liveMockEmails.find((m) => m.id === emailId)
    if (!found) {
      return { ok: false, error: `Email "${emailId}" not found` }
    }
    return { ok: true, email: found }
  }

  try {
    const acc = await resolveStalwartAccountId(emailOrId)
    const calls: JmapMethodCall[] = [
      [
        "Email/get",
        {
          accountId: acc.id,
          ids: [emailId],
          properties: [
            "id",
            "blobId",
            "threadId",
            "mailboxIds",
            "keywords",
            "size",
            "receivedAt",
            "sentAt",
            "from",
            "to",
            "cc",
            "bcc",
            "replyTo",
            "subject",
            "preview",
            "hasAttachment",
            "textBody",
            "htmlBody",
            "bodyValues",
            "attachments",
            "headers",
          ],
          fetchTextBodyValues: true,
          fetchHTMLBodyValues: true,
        },
        "get_email",
      ],
    ]

    const res = await jmapCall(calls, {
      using: ["urn:ietf:params:jmap:core", "urn:ietf:params:jmap:mail"],
    })

    const data = responseById(res, "get_email")
    const item = Array.isArray(data?.list) ? (data.list[0] as Record<string, unknown>) : null
    if (!item) {
      return { ok: false, error: `Email "${emailId}" not found in account` }
    }

    const keywords = (item.keywords as Record<string, boolean>) || {}
    const bodyValues = (item.bodyValues as Record<string, { value?: string }>) || {}

    // Extract text and HTML body from bodyValues
    let bodyText = ""
    if (Array.isArray(item.textBody)) {
      bodyText = (item.textBody as Array<{ partId?: string }>)
        .map((p) => (p.partId ? bodyValues[p.partId]?.value ?? "" : ""))
        .filter(Boolean)
        .join("\n")
    }

    let bodyHtml = ""
    if (Array.isArray(item.htmlBody)) {
      bodyHtml = (item.htmlBody as Array<{ partId?: string }>)
        .map((p) => (p.partId ? bodyValues[p.partId]?.value ?? "" : ""))
        .filter(Boolean)
        .join("\n")
    }

    const email: EmailDetail = {
      id: String(item.id ?? ""),
      blobId: item.blobId as string | undefined,
      threadId: item.threadId as string | undefined,
      mailboxIds: (item.mailboxIds as Record<string, boolean>) || {},
      keywords,
      isRead: Boolean(keywords["$seen"]),
      isFlagged: Boolean(keywords["$flagged"]),
      size: typeof item.size === "number" ? item.size : 0,
      receivedAt: String(item.receivedAt ?? new Date().toISOString()),
      sentAt: item.sentAt as string | undefined | null,
      from: (item.from as EmailAddressGroup[]) || null,
      to: (item.to as EmailAddressGroup[]) || null,
      cc: (item.cc as EmailAddressGroup[]) || null,
      bcc: (item.bcc as EmailAddressGroup[]) || null,
      replyTo: (item.replyTo as EmailAddressGroup[]) || null,
      subject: (item.subject as string) || null,
      preview: (item.preview as string) || null,
      hasAttachment: Boolean(item.hasAttachment),
      bodyText: bodyText || (item.preview as string) || null,
      bodyHtml: bodyHtml || null,
      attachments: (item.attachments as EmailDetail["attachments"]) || [],
      headers: (item.headers as Array<{ name: string; value: string }>) || [],
    }

    return { ok: true, email }
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    }
  }
}

// ---------------------------------------------------------------------------
// 4. Set Email Flags (Read / Flagged / Keywords)
// ---------------------------------------------------------------------------

export async function setMailboxEmailFlags(
  emailOrId: string,
  emailId: string,
  flags: {
    isRead?: boolean
    isFlagged?: boolean
    addKeywords?: string[]
    removeKeywords?: string[]
  }
): Promise<{ ok: boolean; error?: string }> {
  const config = getStalwartConfig()
  const isLive = Boolean(config && process.env.NODE_ENV !== "test")

  if (!isLive) {
    const item = liveMockEmails.find((m) => m.id === emailId)
    if (!item) return { ok: false, error: `Email "${emailId}" not found` }

    if (flags.isRead !== undefined) {
      item.isRead = flags.isRead
      item.keywords["$seen"] = flags.isRead
    }
    if (flags.isFlagged !== undefined) {
      item.isFlagged = flags.isFlagged
      item.keywords["$flagged"] = flags.isFlagged
    }
    if (flags.addKeywords) {
      flags.addKeywords.forEach((k) => { item.keywords[k] = true })
    }
    if (flags.removeKeywords) {
      flags.removeKeywords.forEach((k) => { delete item.keywords[k] })
    }
    return { ok: true }
  }

  try {
    const acc = await resolveStalwartAccountId(emailOrId)
    const patch: Record<string, boolean | null> = {}

    if (flags.isRead !== undefined) {
      patch["keywords/$seen"] = flags.isRead ? true : null
    }
    if (flags.isFlagged !== undefined) {
      patch["keywords/$flagged"] = flags.isFlagged ? true : null
    }
    if (flags.addKeywords) {
      flags.addKeywords.forEach((k) => { patch[`keywords/${k}`] = true })
    }
    if (flags.removeKeywords) {
      flags.removeKeywords.forEach((k) => { patch[`keywords/${k}`] = null })
    }

    const calls: JmapMethodCall[] = [
      [
        "Email/set",
        {
          accountId: acc.id,
          update: {
            [emailId]: patch,
          },
        },
        "update_flags",
      ],
    ]

    const res = await jmapCall(calls, {
      using: ["urn:ietf:params:jmap:core", "urn:ietf:params:jmap:mail"],
    })

    const data = responseById(res, "update_flags")
    const notUpdated = (data?.notUpdated as Record<string, { description?: string }>) || {}
    if (notUpdated[emailId]) {
      return { ok: false, error: String(notUpdated[emailId]?.description || "Failed to update email flags") }
    }

    return { ok: true }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}

// ---------------------------------------------------------------------------
// 5. Move Email to Folder
// ---------------------------------------------------------------------------

export async function moveMailboxEmail(
  emailOrId: string,
  emailId: string,
  targetFolderIdOrRole: string
): Promise<{ ok: boolean; targetFolderId?: string; error?: string }> {
  const config = getStalwartConfig()
  const isLive = Boolean(config && process.env.NODE_ENV !== "test")

  if (!isLive) {
    const item = liveMockEmails.find((m) => m.id === emailId)
    if (!item) return { ok: false, error: `Email "${emailId}" not found` }
    const targetFolder = MOCK_FOLDERS.find(
      (f) => f.id === targetFolderIdOrRole || f.role === targetFolderIdOrRole.toLowerCase()
    )
    if (!targetFolder) return { ok: false, error: `Target folder "${targetFolderIdOrRole}" not found` }

    item.mailboxIds = { [targetFolder.id]: true }
    return { ok: true, targetFolderId: targetFolder.id }
  }

  try {
    const acc = await resolveStalwartAccountId(emailOrId)
    const { folders } = await listMailboxFolders(emailOrId)
    const targetFolder = folders.find(
      (f) => f.id === targetFolderIdOrRole || f.role === targetFolderIdOrRole.toLowerCase()
    )
    if (!targetFolder) {
      return { ok: false, error: `Folder matching "${targetFolderIdOrRole}" not found` }
    }

    const calls: JmapMethodCall[] = [
      [
        "Email/set",
        {
          accountId: acc.id,
          update: {
            [emailId]: {
              mailboxIds: {
                [targetFolder.id]: true,
              },
            },
          },
        },
        "move_email",
      ],
    ]

    const res = await jmapCall(calls, {
      using: ["urn:ietf:params:jmap:core", "urn:ietf:params:jmap:mail"],
    })

    const data = responseById(res, "move_email")
    const notUpdated = (data?.notUpdated as Record<string, { description?: string }>) || {}
    if (notUpdated[emailId]) {
      return { ok: false, error: String(notUpdated[emailId]?.description || "Failed to move email") }
    }

    return { ok: true, targetFolderId: targetFolder.id }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}

// ---------------------------------------------------------------------------
// 6. Delete Email (Trash or Permanent Destroy)
// ---------------------------------------------------------------------------

export async function deleteMailboxEmail(
  emailOrId: string,
  emailId: string,
  permanent = false
): Promise<{ ok: boolean; action: "destroyed" | "trashed"; error?: string }> {
  const config = getStalwartConfig()
  const isLive = Boolean(config && process.env.NODE_ENV !== "test")

  if (!isLive) {
    if (permanent) {
      liveMockEmails = liveMockEmails.filter((m) => m.id !== emailId)
      return { ok: true, action: "destroyed" }
    }
    const item = liveMockEmails.find((m) => m.id === emailId)
    if (!item) return { ok: false, action: "trashed", error: `Email "${emailId}" not found` }
    item.mailboxIds = { "mb-trash": true }
    return { ok: true, action: "trashed" }
  }

  try {
    const acc = await resolveStalwartAccountId(emailOrId)

    if (permanent) {
      const calls: JmapMethodCall[] = [
        [
          "Email/set",
          {
            accountId: acc.id,
            destroy: [emailId],
          },
          "destroy_email",
        ],
      ]
      const res = await jmapCall(calls, {
        using: ["urn:ietf:params:jmap:core", "urn:ietf:params:jmap:mail"],
      })
      const data = responseById(res, "destroy_email")
      const notDestroyed = (data?.notDestroyed as Record<string, { description?: string }>) || {}
      if (notDestroyed[emailId]) {
        return {
          ok: false,
          action: "destroyed",
          error: String(notDestroyed[emailId]?.description || "Failed to permanently destroy email"),
        }
      }
      return { ok: true, action: "destroyed" }
    }

    // Non-permanent: move to trash
    const moveRes = await moveMailboxEmail(emailOrId, emailId, "trash")
    if (!moveRes.ok) {
      return { ok: false, action: "trashed", error: moveRes.error }
    }
    return { ok: true, action: "trashed" }
  } catch (err) {
    return { ok: false, action: permanent ? "destroyed" : "trashed", error: err instanceof Error ? err.message : String(err) }
  }
}

// ---------------------------------------------------------------------------
// 7. Send / Draft Email
// ---------------------------------------------------------------------------

export async function sendMailboxEmail(
  emailOrId: string,
  params: {
    to: string[]
    cc?: string[]
    bcc?: string[]
    subject: string
    bodyText: string
    bodyHtml?: string
    isDraft?: boolean
  }
): Promise<{ ok: boolean; emailId?: string; isDraft: boolean; error?: string }> {
  const config = getStalwartConfig()
  const isLive = Boolean(config && process.env.NODE_ENV !== "test")

  if (!isLive) {
    const newMsgId = `msg-${Date.now().toString(36)}`
    const newMsg: EmailDetail = {
      id: newMsgId,
      mailboxIds: params.isDraft ? { "mb-drafts": true } : { "mb-sent": true },
      keywords: { "$seen": true },
      isRead: true,
      isFlagged: false,
      size: Buffer.byteLength(params.bodyText, "utf8"),
      receivedAt: new Date().toISOString(),
      sentAt: params.isDraft ? null : new Date().toISOString(),
      from: [{ email: emailOrId.includes("@") ? emailOrId : `${emailOrId}@example.com` }],
      to: params.to.map((e) => ({ email: e })),
      cc: params.cc?.map((e) => ({ email: e })) || null,
      bcc: params.bcc?.map((e) => ({ email: e })) || null,
      subject: params.subject,
      preview: params.bodyText.slice(0, 100),
      bodyText: params.bodyText,
      bodyHtml: params.bodyHtml || null,
      hasAttachment: false,
      attachments: [],
    }
    liveMockEmails.unshift(newMsg)
    return { ok: true, emailId: newMsgId, isDraft: Boolean(params.isDraft) }
  }

  try {
    const acc = await resolveStalwartAccountId(emailOrId)
    const { folders } = await listMailboxFolders(emailOrId)
    const targetFolder = folders.find(
      (f) => f.role === (params.isDraft ? "drafts" : "sent")
    ) || folders.find((f) => f.role === "inbox") || folders[0]

    const draftId = "new_msg_1"
    const createPayload: Record<string, unknown> = {
      mailboxIds: targetFolder ? { [targetFolder.id]: true } : {},
      keywords: params.isDraft ? { "$draft": true, "$seen": true } : { "$seen": true },
      from: [{ email: acc.email }],
      to: params.to.map((e) => ({ email: e })),
      subject: params.subject,
      bodyValues: {
        "text-part": {
          value: params.bodyText,
        },
      },
      textBody: [{ partId: "text-part", type: "text/plain" }],
    }

    if (params.cc && params.cc.length > 0) {
      createPayload.cc = params.cc.map((e) => ({ email: e }))
    }
    if (params.bcc && params.bcc.length > 0) {
      createPayload.bcc = params.bcc.map((e) => ({ email: e }))
    }
    if (params.bodyHtml) {
      (createPayload.bodyValues as Record<string, unknown>)["html-part"] = {
        value: params.bodyHtml,
      }
      createPayload.htmlBody = [{ partId: "html-part", type: "text/html" }]
    }

    const calls: JmapMethodCall[] = [
      [
        "Email/set",
        {
          accountId: acc.id,
          create: {
            [draftId]: createPayload,
          },
        },
        "create_email",
      ],
    ]

    // If sending immediately, add EmailSubmission/set call
    if (!params.isDraft) {
      calls.push([
        "EmailSubmission/set",
        {
          accountId: acc.id,
          onSuccessDestroyEmail: [],
          create: {
            sub1: {
              emailId: `#${draftId}`,
              identityId: acc.id,
            },
          },
        },
        "send_submission",
      ])
    }

    const res = await jmapCall(calls, {
      using: [
        "urn:ietf:params:jmap:core",
        "urn:ietf:params:jmap:mail",
        "urn:ietf:params:jmap:submission",
      ],
    })

    const createResp = responseById(res, "create_email")
    const created = (createResp?.created as Record<string, { id?: string }>) || {}
    const notCreated = (createResp?.notCreated as Record<string, { description?: string }>) || {}
    const createdItem = created[draftId]
    if (!createdItem || !createdItem.id) {
      const errReason = notCreated[draftId]?.description || "Failed to create message"
      return { ok: false, isDraft: Boolean(params.isDraft), error: String(errReason) }
    }

    return {
      ok: true,
      emailId: String(createdItem.id),
      isDraft: Boolean(params.isDraft),
    }
  } catch (err) {
    return {
      ok: false,
      isDraft: Boolean(params.isDraft),
      error: err instanceof Error ? err.message : String(err),
    }
  }
}

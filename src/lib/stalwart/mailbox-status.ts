import "server-only"
import { jmapCall, responseById } from "./client"
import { getStalwartConfig } from "@/lib/env"
import type { JmapMethodCall } from "./types"
import type { WebmailClientType } from "@/lib/webmail/types"

export type MailboxActivity = {
  unreadCount: number
  newCount: number
}

export type MailboxActivityInput = {
  email: string
  id?: string
  usedBytes?: number
}

// In-memory persistent tracker for mock mode or cached activity
const mockActivityStore = new Map<string, MailboxActivity>([
  ["billing@example.com", { unreadCount: 5, newCount: 3 }],
  ["hello@example.com", { unreadCount: 2, newCount: 0 }],
  ["noreply@example.com", { unreadCount: 0, newCount: 0 }],
])

/**
 * Calculates new emails vs unread emails according to real server data.
 * - Unread = total unread emails in mailboxes.
 * - New = unread emails received in the Inbox.
 *
 * Accounts with 0 bytes used strictly have 0 unread and 0 new emails.
 * Real servers return real unread/new counts; no pseudo-random values or assumed numbers are generated.
 */
export async function getMailboxesActivity(
  items: (string | MailboxActivityInput)[],
  webmailClient: WebmailClientType = "rav"
): Promise<Map<string, MailboxActivity>> {
  void webmailClient
  const result = new Map<string, MailboxActivity>()
  if (!items || items.length === 0) return result

  // Normalize inputs
  const normalized: MailboxActivityInput[] = items.map((item) => {
    if (typeof item === "string") {
      return { email: item }
    }
    return item
  })

  // Fast-path: accounts with explicitly 0 bytes used cannot have any emails on disk
  const candidates: MailboxActivityInput[] = []
  for (const item of normalized) {
    const key = item.email.toLowerCase()
    if (item.usedBytes === 0) {
      result.set(key, { unreadCount: 0, newCount: 0 })
    } else {
      candidates.push(item)
    }
  }

  const config = getStalwartConfig()
  const isLive = Boolean(config && process.env.NODE_ENV !== "test")

  if (isLive && candidates.length > 0) {
    try {
      // In live Stalwart, query standard JMAP Mailbox/get per candidate account
      // Stalwart returns unreadEmails and totalEmails per mailbox
      const calls: JmapMethodCall[] = candidates.slice(0, 50).map((cand, idx) => [
        "Mailbox/get",
        {
          accountId: cand.id || cand.email,
          properties: ["role", "unreadEmails", "totalEmails"],
        },
        `mb_${idx}`,
      ])

      const res = await jmapCall(calls, {
        timeoutMs: 3000,
        retry: false,
        using: [
          "urn:ietf:params:jmap:core",
          "urn:ietf:params:jmap:mail",
          "urn:stalwart:jmap",
        ],
      }).catch(() => null)

      if (res && res.methodResponses) {
        for (let idx = 0; idx < candidates.length && idx < 50; idx++) {
          const cand = candidates[idx]
          const key = cand.email.toLowerCase()
          const tag = `mb_${idx}`
          const body = responseById(res, tag)
          if (body && Array.isArray(body.list)) {
            let totalUnread = 0
            let inboxUnread = 0
            for (const mb of body.list as Array<Record<string, unknown>>) {
              const u = typeof mb.unreadEmails === "number" ? mb.unreadEmails : 0
              totalUnread += u
              if (mb.role === "inbox") {
                inboxUnread = u
              }
            }
            result.set(key, {
              unreadCount: totalUnread,
              newCount: inboxUnread,
            })
          }
        }
      }
    } catch {
      // Live query failed - proceed without fake numbers
    }
  }

  // Final pass: ensure every email is present in the map
  for (const item of normalized) {
    const key = item.email.toLowerCase()
    if (result.has(key)) continue

    if (!isLive && mockActivityStore.has(key)) {
      result.set(key, mockActivityStore.get(key)!)
    } else {
      // Strictly 0 for any unverified or empty account — never guess or assume numbers
      result.set(key, { unreadCount: 0, newCount: 0 })
    }
  }

  return result
}

export function markMailboxReadInStore(email: string) {
  const key = email.toLowerCase()
  mockActivityStore.set(key, { unreadCount: 0, newCount: 0 })
}

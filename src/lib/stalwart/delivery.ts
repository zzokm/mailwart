import "server-only"

import { jmapCall, responseById } from "./client"
import { StalwartError } from "./errors"
import type { DataSource, DeliveryEvent, DeliveryStatus } from "./types"

export type { DeliveryEvent, DeliveryStatus }

/** Sample SMTP-shaped rows for mock / Trace-unavailable mode. */
export const MOCK_DELIVERY_EVENTS: DeliveryEvent[] = [
  {
    id: "del-1",
    timestamp: "2026-08-05T07:14:22.000Z",
    sender: "hello@example.com",
    recipient: "partner@example.org",
    status: "delivered",
    sizeBytes: 18_432,
    detail: "250 2.0.0 OK",
  },
  {
    id: "del-2",
    timestamp: "2026-08-05T07:18:01.000Z",
    sender: "billing@example.com",
    recipient: "invoices@example.net",
    status: "delivered",
    sizeBytes: 94_112,
    detail: "250 2.0.0 Message accepted",
  },
  {
    id: "del-3",
    timestamp: "2026-08-05T07:22:44.000Z",
    sender: "noreply@example.com",
    recipient: "missing@example.org",
    status: "bounce",
    sizeBytes: 4_096,
    detail: "550 5.1.1 User unknown",
  },
  {
    id: "del-4",
    timestamp: "2026-08-05T07:31:09.000Z",
    sender: "ops@example.com",
    recipient: "relay@example.net",
    status: "deferred",
    sizeBytes: 22_400,
    detail: "451 4.7.0 Temporary greylist — retry scheduled",
  },
  {
    id: "del-5",
    timestamp: "2026-08-05T08:02:55.000Z",
    sender: "hello@example.com",
    recipient: "spamtrap@bad.example",
    status: "rejected",
    sizeBytes: 3_200,
    detail: "554 5.7.1 Rejected by policy",
  },
  {
    id: "del-6",
    timestamp: "2026-08-05T08:15:12.000Z",
    sender: "support@example.com",
    recipient: "queue@example.org",
    status: "queued",
    sizeBytes: 51_200,
    detail: "Queued for outbound delivery",
  },
  {
    id: "del-7",
    timestamp: "2026-08-05T08:44:33.000Z",
    sender: "billing@example.com",
    recipient: "cfo@example.org",
    status: "delivered",
    sizeBytes: 210_944,
    detail: "250 2.0.0 OK id=abc123",
  },
  {
    id: "del-8",
    timestamp: "2026-08-05T09:01:07.000Z",
    sender: "hello@example.com",
    recipient: "old@example.net",
    status: "bounce",
    sizeBytes: 8_192,
    detail: "550 5.2.1 Mailbox disabled",
  },
]

function asString(v: unknown): string | undefined {
  if (typeof v === "string" && v.trim()) return v.trim()
  if (Array.isArray(v)) {
    const parts = v.filter((x): x is string => typeof x === "string" && !!x.trim())
    if (parts.length) return parts.join(", ")
  }
  return undefined
}

function asNumber(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v
  return null
}

function eventTypeLabel(event: unknown): string {
  if (typeof event === "string") return event
  if (event && typeof event === "object") {
    const o = event as Record<string, unknown>
    if (typeof o.type === "string") return o.type
    if (typeof o.name === "string") return o.name
    if (typeof o.event === "string") return o.event
  }
  return ""
}

function statusFromTrace(raw: Record<string, unknown>): {
  status: DeliveryStatus
  detail?: string
} {
  const events = Array.isArray(raw.events) ? raw.events : []
  const labels = events
    .map((e) => eventTypeLabel((e as Record<string, unknown>)?.event ?? e))
    .filter(Boolean)
    .join(" ")
    .toLowerCase()

  const blob = `${labels} ${JSON.stringify(raw).toLowerCase()}`

  if (
    /\bbounce\b|\bdsn\.bounce\b|permanent.?fail|5\.\d\.\d|user unknown|mailbox (disabled|full)/.test(
      blob
    )
  ) {
    return { status: "bounce", detail: labels || "Permanent failure" }
  }
  if (/\breject\b|\bdenied\b|\bblocked\b|5\.7\.\d/.test(blob)) {
    return { status: "rejected", detail: labels || "Rejected" }
  }
  if (
    /\bdefer\b|\btemp.?fail\b|\bgreylist\b|4\.\d\.\d|temporary/.test(blob)
  ) {
    return { status: "deferred", detail: labels || "Deferred" }
  }
  if (/\bqueue\b|\bscheduled\b|\bpending\b/.test(blob) && !/\bdeliver/.test(blob)) {
    return { status: "queued", detail: labels || "Queued" }
  }
  if (/\bdeliver|complet|accept|2\.0\.0|smtp\.delivered/.test(blob)) {
    return { status: "delivered", detail: labels || "Delivered" }
  }
  return { status: "queued", detail: labels || undefined }
}

function mapTraceToDelivery(
  id: string,
  raw: Record<string, unknown>
): DeliveryEvent {
  const { status, detail } = statusFromTrace(raw)
  const sender =
    asString(raw.from) ??
    asString(raw.returnPath) ??
    asString(raw.sender) ??
    "(unknown)"
  const recipient =
    asString(raw.to) ??
    asString(raw.rcpt) ??
    asString(raw.recipient) ??
    "(unknown)"
  const timestamp =
    asString(raw.timestamp) ??
    asString(raw.createdAt) ??
    new Date().toISOString()
  const sizeBytes =
    asNumber(raw.size) ?? asNumber(raw.messageSize) ?? asNumber(raw.sizeBytes)

  return {
    id,
    timestamp,
    sender,
    recipient,
    status,
    sizeBytes,
    detail,
    queueId: asString(raw.queueId) ?? asString(raw.queue),
  }
}

/**
 * Read recent delivery traces via Stalwart `x:Trace` when available.
 * Throws StalwartError on hard failures so callers can fall back to mock.
 */
export async function queryDeliveryTracesLive(limit = 200): Promise<{
  events: DeliveryEvent[]
  note?: string
}> {
  const capped = Math.min(Math.max(limit, 1), 500)

  const query = await jmapCall(
    [
      [
        "x:Trace/query",
        {
          filter: null,
          sort: [{ property: "timestamp", isAscending: false }],
          limit: capped,
        },
        "tr0",
      ],
    ],
    { timeoutMs: 12_000, retry: true }
  )

  const qBody = responseById(query, "tr0")
  const ids = Array.isArray(qBody.ids)
    ? (qBody.ids as string[]).filter(Boolean)
    : []

  if (ids.length === 0) {
    return {
      events: [],
      note: "Trace query succeeded but returned no delivery history.",
    }
  }

  const get = await jmapCall(
    [
      [
        "x:Trace/get",
        {
          ids,
          properties: ["timestamp", "from", "to", "size", "events"],
        },
        "tr1",
      ],
    ],
    { timeoutMs: 15_000, retry: true }
  )

  const gBody = responseById(get, "tr1")
  const list = Array.isArray(gBody.list) ? (gBody.list as Record<string, unknown>[]) : []

  const events = list.map((item, i) => {
    const id = asString(item.id) ?? ids[i] ?? `trace-${i}`
    return mapTraceToDelivery(id, item)
  })

  events.sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
  )

  return { events }
}

export type DeliveryFetchResult = {
  events: DeliveryEvent[]
  source: DataSource
  /** When live Trace API is unavailable or empty — explain + deep-link hint. */
  note?: string
  usedFallback: boolean
}

export function deliveryUnavailableNote(adminUiUrl: string): string {
  return `Delivery history uses Stalwart Trace (x:Trace). Open History in Stalwart Admin if traces are empty or permissions are missing: ${adminUiUrl}`
}

export { StalwartError }

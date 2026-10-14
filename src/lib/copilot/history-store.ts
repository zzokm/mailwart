import "server-only"

import { createHash, randomUUID } from "crypto"
import { mkdir, readFile, readdir, rename, unlink, writeFile } from "fs/promises"
import path from "path"
import type { UIMessage } from "ai"

import { COPILOT_PROVIDERS } from "./providers"
import { getActiveProviderId, resolveProviderCreds } from "./resolve"
import { sanitizeToolPayload } from "./tools/sanitize"
import {
  deleteDbCopilotConversation,
  getDbCopilotConversation,
  getDbCopilotConversations,
  saveDbCopilotConversation,
  type DbCopilotConversationRecord,
} from "@/lib/db"

const MAX_CONVERSATIONS = 50
const MAX_MESSAGES = 200
const MAX_FILE_BYTES = 2_000_000
const ID_PATTERN = /^[0-9a-f-]{36}$/
const writes = new Map<string, Promise<unknown>>()

export type CopilotConversationSummary = {
  id: string
  title: string
  createdAt: string
  updatedAt: string
  messageCount: number
}

export type CopilotConversationRecord = CopilotConversationSummary & {
  version: 1
  provider: { id: string; label: string; model: string }
  messages: UIMessage[]
}

function historyRoot(): string {
  const configured = process.env.COPILOT_HISTORY_PATH?.trim()
  if (configured) {
    return path.isAbsolute(configured)
      ? configured
      : path.join(/* turbopackIgnore: true */ process.cwd(), configured)
  }
  return path.join(
    /* turbopackIgnore: true */ process.cwd(),
    "data",
    "copilot-history"
  )
}

function scopeKey(actor: string): string {
  return createHash("sha256")
    .update(actor.trim().toLowerCase() || "admin")
    .digest("hex")
    .slice(0, 24)
}

function scopeDir(actor: string): string {
  return path.join(
    /* turbopackIgnore: true */ historyRoot(),
    scopeKey(actor)
  )
}

function assertId(id: string): void {
  if (!ID_PATTERN.test(id)) throw new Error("Invalid conversation ID.")
}

function filePath(actor: string, id: string): string {
  assertId(id)
  return path.join(
    /* turbopackIgnore: true */ scopeDir(actor),
    `${id}.json`
  )
}

function isoNow(): string {
  return new Date().toISOString()
}

function textFromMessage(message: UIMessage): string {
  return message.parts
    .filter((part) => part.type === "text")
    .map((part) => part.text)
    .join("")
    .trim()
}

function titleFromMessages(messages: UIMessage[]): string {
  const first = messages.find((message) => message.role === "user")
  const title = first ? textFromMessage(first).replace(/\s+/g, " ") : ""
  return title ? title.slice(0, 80) : "New conversation"
}

function redactHistoryOnlySecrets(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redactHistoryOnlySecrets)
  if (!value || typeof value !== "object") return value
  const output: Record<string, unknown> = {}
  for (const [key, item] of Object.entries(value)) {
    output[key] =
      /^(approvalId|approval_id|hmac|signature)$/i.test(key)
        ? "[redacted]"
        : redactHistoryOnlySecrets(item)
  }
  return output
}

function sanitizeMessages(
  messages: UIMessage[],
  existing: UIMessage[] = []
): UIMessage[] {
  const previousMetadata = new Map(
    existing.map((message) => [message.id, message.metadata])
  )
  const now = isoNow()

  return messages.slice(-MAX_MESSAGES).flatMap((message) => {
    if (
      !message ||
      typeof message.id !== "string" ||
      !["user", "assistant", "system"].includes(message.role) ||
      !Array.isArray(message.parts)
    ) {
      return []
    }

    const cleaned = redactHistoryOnlySecrets(
      sanitizeToolPayload(message)
    ) as UIMessage
    const priorMetadata = previousMetadata.get(message.id)
    const prior =
      priorMetadata && typeof priorMetadata === "object"
        ? (priorMetadata as Record<string, unknown>)
        : {}
    const current =
      cleaned.metadata && typeof cleaned.metadata === "object"
        ? (cleaned.metadata as Record<string, unknown>)
        : {}
    const metadata = {
      ...prior,
      ...current,
      createdAt:
        (typeof prior.createdAt === "string" ? prior.createdAt : undefined) ??
        now,
    }

    cleaned.metadata = metadata
    cleaned.parts = cleaned.parts.map((part) => {
      if (
        part &&
        typeof part === "object" &&
        "approval" in part &&
        part.approval &&
        typeof part.approval === "object"
      ) {
        return {
          ...part,
          approval: {
            ...(part.approval as { approved?: boolean }),
            id: "[redacted]",
          },
        }
      }
      return part
    }) as UIMessage["parts"]
    return [cleaned]
  })
}

async function providerMetadata() {
  const id = await getActiveProviderId()
  const creds = await resolveProviderCreds(id)
  return { id, label: COPILOT_PROVIDERS[id].label, model: creds.model }
}

async function readRecord(
  actor: string,
  id: string
): Promise<CopilotConversationRecord | null> {
  try {
    const raw = await readFile(
      /* turbopackIgnore: true */ filePath(actor, id),
      "utf8"
    )
    if (Buffer.byteLength(raw, "utf8") > MAX_FILE_BYTES) return null
    const parsed = JSON.parse(raw) as CopilotConversationRecord
    return parsed?.id === id && Array.isArray(parsed.messages) ? parsed : null
  } catch {
    return null
  }
}

async function atomicWrite(
  actor: string,
  record: CopilotConversationRecord
): Promise<void> {
  try {
    const dir = scopeDir(actor)
    await mkdir(/* turbopackIgnore: true */ dir, { recursive: true })
    const target = filePath(actor, record.id)
    const temp = `${target}.${process.pid}.${randomUUID()}.tmp`
    const serialized = `${JSON.stringify(record)}\n`
    if (Buffer.byteLength(serialized, "utf8") > MAX_FILE_BYTES) {
      return
    }
    await writeFile(/* turbopackIgnore: true */ temp, serialized, {
      encoding: "utf8",
      mode: 0o600,
    })
    await rename(
      /* turbopackIgnore: true */ temp,
      /* turbopackIgnore: true */ target
    )
  } catch (err) {
    console.warn(
      "[copilot] Disk history write skipped (using PostgreSQL):",
      err instanceof Error ? err.message : err
    )
  }
}

async function prune(actor: string): Promise<void> {
  try {
    const records = await listCopilotConversations(actor)
    await Promise.all(
      records
        .slice(MAX_CONVERSATIONS)
        .map((record) =>
          unlink(
            /* turbopackIgnore: true */ filePath(actor, record.id)
          ).catch(() => undefined)
        )
    )
  } catch {}
}

function serialized<T>(actor: string, operation: () => Promise<T>): Promise<T> {
  const key = scopeKey(actor)
  const prior = writes.get(key) ?? Promise.resolve()
  const next = prior.catch(() => undefined).then(operation)
  writes.set(key, next)
  void next.finally(() => {
    if (writes.get(key) === next) writes.delete(key)
  })
  return next
}

export async function listCopilotConversations(
  actor: string,
  userId?: string,
  isAdmin?: boolean
): Promise<CopilotConversationSummary[]> {
  // 1. Try PostgreSQL first
  try {
    const dbSummaries = await getDbCopilotConversations(actor, userId, isAdmin)
    if (dbSummaries.length > 0) {
      return dbSummaries
    }
  } catch (err) {
    console.warn("[copilot] DB conversations list warning:", err)
  }

  // 2. Fallback to disk and backfill into DB
  let names: string[]
  try {
    names = await readdir(/* turbopackIgnore: true */ scopeDir(actor))
  } catch {
    return []
  }
  const records = await Promise.all(
    names
      .filter(
        (name) =>
          name.endsWith(".json") && ID_PATTERN.test(name.slice(0, -5))
      )
      .map((name) => readRecord(actor, name.slice(0, -5)))
  )
  const valid = records
    .filter((record): record is CopilotConversationRecord => Boolean(record))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))

  for (const r of valid) {
    saveDbCopilotConversation(
      r as unknown as DbCopilotConversationRecord,
      userId
    ).catch(() => {})
  }

  return valid.map(({ id, title, createdAt, updatedAt, messageCount }) => ({
    id,
    title,
    createdAt,
    updatedAt,
    messageCount,
  }))
}

export async function getCopilotConversation(
  actor: string,
  id: string,
  userId?: string,
  isAdmin?: boolean
): Promise<CopilotConversationRecord | null> {
  // 1. Try PostgreSQL first
  try {
    const dbRecord = await getDbCopilotConversation(id, actor, userId, isAdmin)
    if (dbRecord) {
      return dbRecord as unknown as CopilotConversationRecord
    }
  } catch (err) {
    console.warn("[copilot] DB conversation read warning:", err)
  }

  // 2. Fallback to disk and backfill
  const fileRecord = await readRecord(actor, id)
  if (fileRecord) {
    saveDbCopilotConversation(
      fileRecord as unknown as DbCopilotConversationRecord,
      userId
    ).catch(() => {})
    return fileRecord
  }
  return null
}

export async function createCopilotConversation(
  actor: string,
  userId?: string
): Promise<CopilotConversationRecord> {
  return serialized(actor, async () => {
    const now = isoNow()
    const record: CopilotConversationRecord = {
      version: 1,
      id: randomUUID(),
      title: "New conversation",
      createdAt: now,
      updatedAt: now,
      messageCount: 0,
      provider: await providerMetadata(),
      messages: [],
    }

    // 1. Save to PostgreSQL
    await saveDbCopilotConversation(
      record as unknown as DbCopilotConversationRecord,
      userId
    ).catch((err) => {
      console.error("[copilot] DB save conversation error:", err)
    })

    // 2. Safe best-effort disk write
    await atomicWrite(actor, record)
    await prune(actor)
    return record
  })
}

export async function saveCopilotConversation(
  actor: string,
  id: string,
  messages: UIMessage[],
  userId?: string,
  isAdmin?: boolean
): Promise<CopilotConversationRecord> {
  return serialized(actor, async () => {
    const existing = await getCopilotConversation(actor, id, userId, isAdmin)
    if (!existing) throw new Error("Conversation not found.")
    const cleaned = sanitizeMessages(messages, existing.messages)
    const record: CopilotConversationRecord = {
      ...existing,
      title: titleFromMessages(cleaned),
      updatedAt: isoNow(),
      messageCount: cleaned.length,
      provider: await providerMetadata(),
      messages: cleaned,
    }

    // 1. Save to PostgreSQL
    await saveDbCopilotConversation(
      record as unknown as DbCopilotConversationRecord,
      userId
    ).catch((err) => {
      console.error("[copilot] DB save conversation error:", err)
    })

    // 2. Safe best-effort disk write
    await atomicWrite(actor, record)
    await prune(actor)
    return record
  })
}

export async function deleteCopilotConversation(
  actor: string,
  id: string,
  userId?: string,
  isAdmin?: boolean
): Promise<void> {
  await serialized(actor, async () => {
    // 1. Delete from PostgreSQL
    await deleteDbCopilotConversation(id, actor, userId, isAdmin).catch((err) => {
      console.error("[copilot] DB delete conversation error:", err)
    })

    // 2. Best-effort unlink
    try {
      await unlink(filePath(actor, id))
    } catch {}
  })
}

export function getCopilotHistoryPath(): string {
  return historyRoot()
}

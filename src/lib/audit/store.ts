import "server-only"

import { appendFile, mkdir, readFile, access } from "fs/promises"
import path from "path"
import { constants } from "fs"

import type { AuditAction, AuditEvent, AuditEventInput } from "./types"

const MAX_READ = 2_000

/** Polished sample rows when the JSONL file is empty (local/mock UX). */
export const SAMPLE_AUDIT_EVENTS: AuditEvent[] = [
  {
    id: "aud-sample-1",
    at: "2026-08-04T18:22:11.000Z",
    actor: "admin",
    action: "login",
    detail: "Dashboard session started",
  },
  {
    id: "aud-sample-2",
    at: "2026-08-04T18:24:03.000Z",
    actor: "admin",
    action: "mailbox.create",
    target: "ops@example.com",
    detail: "Created mailbox",
  },
  {
    id: "aud-sample-3",
    at: "2026-08-04T18:31:44.000Z",
    actor: "admin",
    action: "mailbox.password_reset",
    target: "hello@example.com",
    detail: "Password reset",
  },
  {
    id: "aud-sample-4",
    at: "2026-08-04T19:02:18.000Z",
    actor: "admin",
    action: "webmail.sso",
    target: "hello@example.com",
    detail: "Opened Roundcube via SSO",
  },
  {
    id: "aud-sample-5",
    at: "2026-08-04T19:15:55.000Z",
    actor: "admin",
    action: "bulk.complete",
    target: "job-sample-mailboxes",
    detail: "Bulk mailboxes: 12 created, 2 skipped, 0 failed",
    meta: { created: 12, skipped: 2, failed: 0, kind: "mailboxes" },
  },
  {
    id: "aud-sample-6",
    at: "2026-08-04T20:01:09.000Z",
    actor: "admin",
    action: "domain.create",
    target: "example.net",
    detail: "Created domain",
  },
  {
    id: "aud-sample-7",
    at: "2026-08-05T08:11:30.000Z",
    actor: "admin",
    action: "mailbox.destroy",
    target: "temp@example.com",
    detail: "Destroyed mailbox",
  },
  {
    id: "aud-sample-8",
    at: "2026-08-05T09:40:02.000Z",
    actor: "admin",
    action: "logout",
    detail: "Dashboard session ended",
  },
]

function resolveAuditPath(): string {
  const fromEnv = process.env.AUDIT_LOG_PATH?.trim()
  if (fromEnv) {
    return path.isAbsolute(fromEnv)
      ? fromEnv
      : path.join(/*turbopackIgnore: true*/ process.cwd(), fromEnv)
  }
  return path.join(/*turbopackIgnore: true*/ process.cwd(), "data", "audit.jsonl")
}

async function ensureParent(filePath: string): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true })
}

function parseLine(line: string): AuditEvent | null {
  const trimmed = line.trim()
  if (!trimmed) return null
  try {
    const raw = JSON.parse(trimmed) as Partial<AuditEvent>
    if (
      typeof raw.id !== "string" ||
      typeof raw.at !== "string" ||
      typeof raw.actor !== "string" ||
      typeof raw.action !== "string"
    ) {
      return null
    }
    return {
      id: raw.id,
      at: raw.at,
      actor: raw.actor,
      action: raw.action as AuditAction,
      target: typeof raw.target === "string" ? raw.target : undefined,
      detail: typeof raw.detail === "string" ? raw.detail : undefined,
      meta:
        raw.meta && typeof raw.meta === "object"
          ? (raw.meta as AuditEvent["meta"])
          : undefined,
    }
  } catch {
    return null
  }
}

export async function appendAuditEvent(
  input: AuditEventInput
): Promise<AuditEvent> {
  const event: AuditEvent = {
    id: input.id ?? `aud-${crypto.randomUUID()}`,
    at: input.at ?? new Date().toISOString(),
    actor: input.actor,
    action: input.action,
    target: input.target,
    detail: input.detail,
    meta: input.meta,
  }

  const filePath = resolveAuditPath()
  await ensureParent(filePath)
  await appendFile(filePath, `${JSON.stringify(event)}\n`, "utf8")
  return event
}

/**
 * Fire-and-forget audit write. Never throws to callers — failures log only.
 */
export async function recordAudit(
  input: AuditEventInput
): Promise<void> {
  try {
    await appendAuditEvent(input)
  } catch (err) {
    console.error(
      "[audit] append failed:",
      err instanceof Error ? err.message : err
    )
  }
}

export type ReadAuditOptions = {
  limit?: number
  /** When true and the file is empty/missing, return SAMPLE_AUDIT_EVENTS. */
  allowSampleFallback?: boolean
}

export async function readAuditEvents(
  options: ReadAuditOptions = {}
): Promise<{ events: AuditEvent[]; fromSample: boolean; path: string }> {
  const limit = Math.min(options.limit ?? 500, MAX_READ)
  const filePath = resolveAuditPath()

  try {
    await access(filePath, constants.R_OK)
  } catch {
    if (options.allowSampleFallback) {
      return {
        events: SAMPLE_AUDIT_EVENTS.slice(0, limit),
        fromSample: true,
        path: filePath,
      }
    }
    return { events: [], fromSample: false, path: filePath }
  }

  const text = await readFile(filePath, "utf8")
  const lines = text.split(/\r?\n/)
  const events: AuditEvent[] = []
  // Read from end so newest events surface first without loading everything twice.
  for (let i = lines.length - 1; i >= 0 && events.length < limit; i--) {
    const parsed = parseLine(lines[i])
    if (parsed) events.push(parsed)
  }

  if (events.length === 0 && options.allowSampleFallback) {
    return {
      events: SAMPLE_AUDIT_EVENTS.slice(0, limit),
      fromSample: true,
      path: filePath,
    }
  }

  return { events, fromSample: false, path: filePath }
}

export function getAuditLogPath(): string {
  return resolveAuditPath()
}

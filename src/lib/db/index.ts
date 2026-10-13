import "server-only"

import { existsSync, mkdirSync } from "node:fs"
import path from "node:path"
import { DatabaseSync } from "node:sqlite"
import { randomUUID } from "node:crypto"

import type { AuditEvent, AuditEventInput } from "@/lib/audit/types"
import type { DeliveryEvent, DeliveryStatus } from "@/lib/stalwart/types"

let dbInstance: DatabaseSync | null = null

export function resolveDatabasePath(): string {
  const fromEnv = process.env.DATABASE_PATH?.trim()
  if (fromEnv) {
    return path.isAbsolute(fromEnv)
      ? fromEnv
      : path.join(/*turbopackIgnore: true*/ process.cwd(), fromEnv)
  }

  // Persistent docker volume mount in production
  if (existsSync("/data")) {
    return "/data/mailwart.db"
  }

  return path.join(/*turbopackIgnore: true*/ process.cwd(), "data", "mailwart.db")
}

export function getDatabase(): DatabaseSync {
  if (dbInstance) return dbInstance

  const dbPath = resolveDatabasePath()
  const dir = path.dirname(dbPath)
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }

  const db = new DatabaseSync(dbPath)

  // Configure pragmas for reliability and high concurrency
  db.exec("PRAGMA journal_mode = WAL;")
  db.exec("PRAGMA synchronous = NORMAL;")
  db.exec("PRAGMA foreign_keys = ON;")

  // Schema creation
  db.exec(`
    CREATE TABLE IF NOT EXISTS audit_logs (
      id TEXT PRIMARY KEY,
      timestamp TEXT NOT NULL,
      actor TEXT NOT NULL,
      action TEXT NOT NULL,
      target TEXT,
      detail TEXT,
      meta TEXT,
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_audit_logs_timestamp ON audit_logs(timestamp DESC);
    CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action);

    CREATE TABLE IF NOT EXISTS delivery_logs (
      id TEXT PRIMARY KEY,
      timestamp TEXT NOT NULL,
      sender TEXT NOT NULL,
      recipient TEXT NOT NULL,
      status TEXT NOT NULL,
      size_bytes INTEGER,
      detail TEXT,
      queue_id TEXT,
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_delivery_logs_timestamp ON delivery_logs(timestamp DESC);
    CREATE INDEX IF NOT EXISTS idx_delivery_logs_sender ON delivery_logs(sender);
    CREATE INDEX IF NOT EXISTS idx_delivery_logs_recipient ON delivery_logs(recipient);
    CREATE INDEX IF NOT EXISTS idx_delivery_logs_status ON delivery_logs(status);

    CREATE TABLE IF NOT EXISTS system_logs (
      id TEXT PRIMARY KEY,
      timestamp TEXT NOT NULL,
      level TEXT NOT NULL,
      subsystem TEXT NOT NULL,
      message TEXT NOT NULL,
      details TEXT,
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_system_logs_timestamp ON system_logs(timestamp DESC);
  `)

  dbInstance = db
  return db
}

// ---------------------------------------------------------------------------
// Audit Log Operations
// ---------------------------------------------------------------------------

export function insertAuditLog(input: AuditEventInput): AuditEvent {
  const db = getDatabase()
  const id = input.id ?? `aud-${Date.now()}-${randomUUID().slice(0, 8)}`
  const timestamp = input.at ?? new Date().toISOString()
  const metaJson = input.meta ? JSON.stringify(input.meta) : null
  const now = Date.now()

  const stmt = db.prepare(`
    INSERT OR REPLACE INTO audit_logs (id, timestamp, actor, action, target, detail, meta, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `)

  stmt.run(
    id,
    timestamp,
    input.actor,
    input.action,
    input.target ?? null,
    input.detail ?? null,
    metaJson,
    now
  )

  return {
    id,
    at: timestamp,
    actor: input.actor,
    action: input.action,
    target: input.target,
    detail: input.detail,
    meta: input.meta,
  }
}

export function queryAuditLogs(options?: {
  limit?: number
  query?: string
}): AuditEvent[] {
  const db = getDatabase()
  const limit = Math.min(Math.max(options?.limit ?? 500, 1), 2000)
  const q = options?.query?.trim().toLowerCase()

  if (q) {
    const stmt = db.prepare(`
      SELECT id, timestamp, actor, action, target, detail, meta
      FROM audit_logs
      WHERE LOWER(actor) LIKE ? OR LOWER(action) LIKE ? OR LOWER(target) LIKE ? OR LOWER(detail) LIKE ?
      ORDER BY timestamp DESC
      LIMIT ?
    `)
    const pattern = `%${q}%`
    const rows = stmt.all(pattern, pattern, pattern, pattern, limit) as Array<{
      id: string
      timestamp: string
      actor: string
      action: string
      target: string | null
      detail: string | null
      meta: string | null
    }>
    return rows.map(mapAuditRow)
  }

  const stmt = db.prepare(`
    SELECT id, timestamp, actor, action, target, detail, meta
    FROM audit_logs
    ORDER BY timestamp DESC
    LIMIT ?
  `)
  const rows = stmt.all(limit) as Array<{
    id: string
    timestamp: string
    actor: string
    action: string
    target: string | null
    detail: string | null
    meta: string | null
  }>
  return rows.map(mapAuditRow)
}

function mapAuditRow(row: {
  id: string
  timestamp: string
  actor: string
  action: string
  target: string | null
  detail: string | null
  meta: string | null
}): AuditEvent {
  let meta: Record<string, string | number | boolean | null> | undefined
  if (row.meta) {
    try {
      meta = JSON.parse(row.meta)
    } catch {
      // ignore malformed meta
    }
  }

  return {
    id: row.id,
    at: row.timestamp,
    actor: row.actor,
    action: row.action as AuditEvent["action"],
    target: row.target ?? undefined,
    detail: row.detail ?? undefined,
    meta,
  }
}

// ---------------------------------------------------------------------------
// Delivery Log Operations
// ---------------------------------------------------------------------------

export function insertDeliveryLog(
  input: Omit<DeliveryEvent, "id"> & { id?: string }
): DeliveryEvent {
  const db = getDatabase()
  const id = input.id ?? `del-${Date.now()}-${randomUUID().slice(0, 8)}`
  const now = Date.now()

  const stmt = db.prepare(`
    INSERT OR REPLACE INTO delivery_logs (id, timestamp, sender, recipient, status, size_bytes, detail, queue_id, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `)

  stmt.run(
    id,
    input.timestamp,
    input.sender,
    input.recipient,
    input.status,
    input.sizeBytes ?? null,
    input.detail ?? null,
    input.queueId ?? null,
    now
  )

  return {
    id,
    timestamp: input.timestamp,
    sender: input.sender,
    recipient: input.recipient,
    status: input.status,
    sizeBytes: input.sizeBytes,
    detail: input.detail,
    queueId: input.queueId,
  }
}

export function queryDeliveryLogs(options?: {
  limit?: number
  query?: string
  status?: string
}): DeliveryEvent[] {
  const db = getDatabase()
  const limit = Math.min(Math.max(options?.limit ?? 500, 1), 2000)
  const q = options?.query?.trim().toLowerCase()
  const status = options?.status && options.status !== "all" ? options.status : null

  if (q && status) {
    const stmt = db.prepare(`
      SELECT id, timestamp, sender, recipient, status, size_bytes, detail, queue_id
      FROM delivery_logs
      WHERE status = ? AND (LOWER(sender) LIKE ? OR LOWER(recipient) LIKE ? OR LOWER(detail) LIKE ?)
      ORDER BY timestamp DESC
      LIMIT ?
    `)
    const pattern = `%${q}%`
    const rows = stmt.all(status, pattern, pattern, pattern, limit) as Array<{
      id: string
      timestamp: string
      sender: string
      recipient: string
      status: string
      size_bytes: number | null
      detail: string | null
      queue_id: string | null
    }>
    return rows.map(mapDeliveryRow)
  }

  if (q) {
    const stmt = db.prepare(`
      SELECT id, timestamp, sender, recipient, status, size_bytes, detail, queue_id
      FROM delivery_logs
      WHERE LOWER(sender) LIKE ? OR LOWER(recipient) LIKE ? OR LOWER(detail) LIKE ?
      ORDER BY timestamp DESC
      LIMIT ?
    `)
    const pattern = `%${q}%`
    const rows = stmt.all(pattern, pattern, pattern, limit) as Array<{
      id: string
      timestamp: string
      sender: string
      recipient: string
      status: string
      size_bytes: number | null
      detail: string | null
      queue_id: string | null
    }>
    return rows.map(mapDeliveryRow)
  }

  if (status) {
    const stmt = db.prepare(`
      SELECT id, timestamp, sender, recipient, status, size_bytes, detail, queue_id
      FROM delivery_logs
      WHERE status = ?
      ORDER BY timestamp DESC
      LIMIT ?
    `)
    const rows = stmt.all(status, limit) as Array<{
      id: string
      timestamp: string
      sender: string
      recipient: string
      status: string
      size_bytes: number | null
      detail: string | null
      queue_id: string | null
    }>
    return rows.map(mapDeliveryRow)
  }

  const stmt = db.prepare(`
    SELECT id, timestamp, sender, recipient, status, size_bytes, detail, queue_id
    FROM delivery_logs
    ORDER BY timestamp DESC
    LIMIT ?
  `)
  const rows = stmt.all(limit) as Array<{
    id: string
    timestamp: string
    sender: string
    recipient: string
    status: string
    size_bytes: number | null
    detail: string | null
    queue_id: string | null
  }>
  return rows.map(mapDeliveryRow)
}

function mapDeliveryRow(row: {
  id: string
  timestamp: string
  sender: string
  recipient: string
  status: string
  size_bytes: number | null
  detail: string | null
  queue_id: string | null
}): DeliveryEvent {
  return {
    id: row.id,
    timestamp: row.timestamp,
    sender: row.sender,
    recipient: row.recipient,
    status: row.status as DeliveryStatus,
    sizeBytes: row.size_bytes ?? null,
    detail: row.detail ?? undefined,
    queueId: row.queue_id ?? undefined,
  }
}

// ---------------------------------------------------------------------------
// System Log Operations
// ---------------------------------------------------------------------------

export function insertSystemLog(
  level: "info" | "warn" | "error",
  subsystem: string,
  message: string,
  details?: unknown
): void {
  try {
    const db = getDatabase()
    const id = `sys-${Date.now()}-${randomUUID().slice(0, 8)}`
    const timestamp = new Date().toISOString()
    const now = Date.now()
    const detailsStr = details
      ? typeof details === "string"
        ? details
        : JSON.stringify(details)
      : null

    const stmt = db.prepare(`
      INSERT INTO system_logs (id, timestamp, level, subsystem, message, details, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `)

    stmt.run(id, timestamp, level, subsystem, message, detailsStr, now)
  } catch (err) {
    console.error("[system_log] failed to record log:", err)
  }
}

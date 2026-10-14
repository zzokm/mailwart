import "server-only"

import { existsSync } from "node:fs"
import path from "node:path"
import { randomUUID } from "node:crypto"
import { Pool } from "pg"

import type { AuditEvent, AuditEventInput } from "@/lib/audit/types"
import type { DeliveryEvent, DeliveryStatus } from "@/lib/stalwart/types"
import { ensureAdminUser } from "./users"

let poolInstance: Pool | null = null
let isInitialized = false
let initPromise: Promise<void> | null = null

export function resolveDatabaseUrl(): string {
  const fromEnv = process.env.DATABASE_URL?.trim()
  if (fromEnv) {
    // Prevent DNS collision with other compose stacks sharing dokploy-network
    return fromEnv
      .replace("@postgres:5432", "@mailwart-postgres:5432")
      .replace("@postgres/", "@mailwart-postgres/")
  }
  return ""
}

// In-memory fallbacks for offline testing / build environments without Postgres
const memoryAuditLogs: AuditEvent[] = []
const memoryDeliveryLogs: DeliveryEvent[] = []

export function getPool(): Pool | null {
  if (poolInstance) return poolInstance

  const connectionString = resolveDatabaseUrl()
  try {
    const pool = new Pool({
      connectionString,
      max: 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 3000,
    })

    pool.on("error", (err) => {
      console.warn("[postgres] unexpected idle client error:", err.message)
    })

    poolInstance = pool
    return pool
  } catch (err) {
    console.warn("[postgres] failed to create pool:", err)
    return null
  }
}

/**
 * Initializes PostgreSQL schema, seeds admin user yehia, and migrates legacy SQLite records.
 */
export async function initDatabase(): Promise<void> {
  if (isInitialized) return
  if (initPromise) return initPromise

  initPromise = (async () => {
    const pool = getPool()
    if (!pool) return

    try {
      // 1. Create tables
      await pool.query(`
        CREATE TABLE IF NOT EXISTS users (
          id VARCHAR(64) PRIMARY KEY,
          username VARCHAR(64) UNIQUE NOT NULL,
          email VARCHAR(255) UNIQUE NOT NULL,
          password_hash TEXT NOT NULL,
          salt TEXT NOT NULL,
          role VARCHAR(32) NOT NULL DEFAULT 'user',
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
        CREATE INDEX IF NOT EXISTS idx_users_username ON users(LOWER(username));
        CREATE INDEX IF NOT EXISTS idx_users_email ON users(LOWER(email));

        CREATE TABLE IF NOT EXISTS audit_logs (
          id VARCHAR(64) PRIMARY KEY,
          timestamp TIMESTAMPTZ NOT NULL,
          actor VARCHAR(64) NOT NULL,
          action VARCHAR(64) NOT NULL,
          target TEXT,
          detail TEXT,
          meta JSONB,
          created_at BIGINT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_audit_logs_timestamp ON audit_logs(timestamp DESC);
        CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action);

        CREATE TABLE IF NOT EXISTS delivery_logs (
          id VARCHAR(64) PRIMARY KEY,
          timestamp TIMESTAMPTZ NOT NULL,
          sender VARCHAR(255) NOT NULL,
          recipient VARCHAR(255) NOT NULL,
          status VARCHAR(64) NOT NULL,
          size_bytes BIGINT,
          detail TEXT,
          queue_id VARCHAR(128),
          created_at BIGINT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_delivery_logs_timestamp ON delivery_logs(timestamp DESC);
        CREATE INDEX IF NOT EXISTS idx_delivery_logs_sender ON delivery_logs(sender);
        CREATE INDEX IF NOT EXISTS idx_delivery_logs_recipient ON delivery_logs(recipient);
        CREATE INDEX IF NOT EXISTS idx_delivery_logs_status ON delivery_logs(status);

        CREATE TABLE IF NOT EXISTS system_logs (
          id VARCHAR(64) PRIMARY KEY,
          timestamp TIMESTAMPTZ NOT NULL,
          level VARCHAR(16) NOT NULL,
          subsystem VARCHAR(64) NOT NULL,
          message TEXT NOT NULL,
          details TEXT,
          created_at BIGINT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_system_logs_timestamp ON system_logs(timestamp DESC);

        CREATE TABLE IF NOT EXISTS mailboxes (
          id VARCHAR(128) PRIMARY KEY,
          email VARCHAR(255) UNIQUE NOT NULL,
          name VARCHAR(255),
          domain_id VARCHAR(128) NOT NULL,
          quota_bytes BIGINT DEFAULT 0,
          used_bytes BIGINT DEFAULT 0,
          status VARCHAR(32) DEFAULT 'active',
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
        CREATE INDEX IF NOT EXISTS idx_mailboxes_domain_id ON mailboxes(domain_id);
        CREATE INDEX IF NOT EXISTS idx_mailboxes_email ON mailboxes(LOWER(email));

        CREATE TABLE IF NOT EXISTS domains (
          id VARCHAR(128) PRIMARY KEY,
          name VARCHAR(255) UNIQUE NOT NULL,
          description TEXT,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
        CREATE INDEX IF NOT EXISTS idx_domains_name ON domains(LOWER(name));
      `)

      // 2. Seed primary admin account yehia
      await ensureAdminUser()

      // 3. Migrate from SQLite if existing database file is found
      await migrateFromSqlite(pool)

      isInitialized = true
    } catch (err) {
      console.warn("[postgres] initDatabase warning (PostgreSQL offline or starting):", (err as Error).message)
    } finally {
      if (!isInitialized) {
        initPromise = null
        poolInstance = null
      }
    }
  })()

  return initPromise
}

async function migrateFromSqlite(pool: Pool): Promise<void> {
  const possiblePaths = [
    "/data/mailwart.db",
    path.join(/*turbopackIgnore: true*/ process.cwd(), "data", "mailwart.db"),
  ]

  const sqlitePath = possiblePaths.find((p) => existsSync(p))
  if (!sqlitePath) return

  try {
    // Dynamic import to avoid hard dependency on node:sqlite
    const sqliteMod = await import("node:sqlite")
    const sqlite = new sqliteMod.DatabaseSync(sqlitePath)

    // Migrate audit_logs
    try {
      const stmt = sqlite.prepare("SELECT * FROM audit_logs")
      const rows = stmt.all() as Array<{
        id: string
        timestamp: string
        actor: string
        action: string
        target: string | null
        detail: string | null
        meta: string | null
        created_at: number
      }>
      for (const r of rows) {
        await pool.query(
          `INSERT INTO audit_logs (id, timestamp, actor, action, target, detail, meta, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
           ON CONFLICT (id) DO NOTHING`,
          [
            r.id,
            r.timestamp,
            r.actor,
            r.action,
            r.target,
            r.detail,
            r.meta ? JSON.parse(r.meta) : null,
            r.created_at,
          ]
        )
      }
    } catch {
      // Table may not exist in SQLite
    }

    // Migrate delivery_logs
    try {
      const stmt = sqlite.prepare("SELECT * FROM delivery_logs")
      const rows = stmt.all() as Array<{
        id: string
        timestamp: string
        sender: string
        recipient: string
        status: string
        size_bytes: number | null
        detail: string | null
        queue_id: string | null
        created_at: number
      }>
      for (const r of rows) {
        await pool.query(
          `INSERT INTO delivery_logs (id, timestamp, sender, recipient, status, size_bytes, detail, queue_id, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
           ON CONFLICT (id) DO NOTHING`,
          [
            r.id,
            r.timestamp,
            r.sender,
            r.recipient,
            r.status,
            r.size_bytes,
            r.detail,
            r.queue_id,
            r.created_at,
          ]
        )
      }
    } catch {
      // Table may not exist in SQLite
    }

    // Migrate system_logs
    try {
      const stmt = sqlite.prepare("SELECT * FROM system_logs")
      const rows = stmt.all() as Array<{
        id: string
        timestamp: string
        level: string
        subsystem: string
        message: string
        details: string | null
        created_at: number
      }>
      for (const r of rows) {
        await pool.query(
          `INSERT INTO system_logs (id, timestamp, level, subsystem, message, details, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7)
           ON CONFLICT (id) DO NOTHING`,
          [
            r.id,
            r.timestamp,
            r.level,
            r.subsystem,
            r.message,
            r.details,
            r.created_at,
          ]
        )
      }
    } catch {
      // Table may not exist in SQLite
    }

    // Close SQLite and remove old SQLite database file completely
    sqlite.close()
    try {
      const { unlinkSync } = await import("node:fs")
      if (existsSync(sqlitePath)) {
        unlinkSync(sqlitePath)
        console.log(`[migration] successfully removed old SQLite file at ${sqlitePath}`)
      }
    } catch (rmErr) {
      console.warn("[migration] notice removing SQLite file:", rmErr)
    }

    console.log(`[migration] successfully migrated existing SQLite data from ${sqlitePath} to PostgreSQL.`)
  } catch (err) {
    console.warn("[migration] SQLite to PostgreSQL migration notice:", err)
  }
}

export async function syncMailboxesToDb(
  accounts: Array<{
    id: string
    email: string
    name?: string
    domainId?: string
    quotaBytes?: number
    usedBytes?: number
    status?: string
  }>
): Promise<void> {
  const pool = getPool()
  if (!pool || accounts.length === 0) return
  try {
    for (const a of accounts) {
      await pool.query(
        `INSERT INTO mailboxes (id, email, name, domain_id, quota_bytes, used_bytes, status, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
         ON CONFLICT (id) DO UPDATE
         SET email = EXCLUDED.email,
             name = EXCLUDED.name,
             domain_id = EXCLUDED.domain_id,
             quota_bytes = EXCLUDED.quota_bytes,
             used_bytes = EXCLUDED.used_bytes,
             status = EXCLUDED.status,
             updated_at = NOW()`,
        [
          a.id,
          a.email,
          a.name ?? null,
          a.domainId ?? "",
          a.quotaBytes ?? 0,
          a.usedBytes ?? 0,
          a.status ?? "active",
        ]
      )
    }
  } catch (err) {
    console.error("[postgres] syncMailboxesToDb error:", err)
  }
}

export async function queryMailboxesFromDb(domainId?: string): Promise<
  Array<{
    id: string
    email: string
    name: string | null
    domainId: string
    quotaBytes: number
    usedBytes: number
    status: string
  }>
> {
  const pool = getPool()
  if (!pool) return []
  try {
    const res = domainId
      ? await pool.query(
          `SELECT id, email, name, domain_id, quota_bytes, used_bytes, status
           FROM mailboxes WHERE domain_id = $1 ORDER BY email ASC`,
          [domainId]
        )
      : await pool.query(
          `SELECT id, email, name, domain_id, quota_bytes, used_bytes, status
           FROM mailboxes ORDER BY email ASC`
        )
    return res.rows.map((r) => ({
      id: r.id,
      email: r.email,
      name: r.name,
      domainId: r.domain_id,
      quotaBytes: Number(r.quota_bytes || 0),
      usedBytes: Number(r.used_bytes || 0),
      status: r.status,
    }))
  } catch {
    return []
  }
}

export async function syncDomainsToDb(
  domains: Array<{ id: string; name: string; description?: string }>
): Promise<void> {
  const pool = getPool()
  if (!pool || domains.length === 0) return
  try {
    for (const d of domains) {
      await pool.query(
        `INSERT INTO domains (id, name, description, updated_at)
         VALUES ($1, $2, $3, NOW())
         ON CONFLICT (id) DO UPDATE
         SET name = EXCLUDED.name,
             description = EXCLUDED.description,
             updated_at = NOW()`,
        [d.id, d.name, d.description ?? null]
      )
    }
  } catch (err) {
    console.error("[postgres] syncDomainsToDb error:", err)
  }
}

// ---------------------------------------------------------------------------
// Audit Log Operations
// ---------------------------------------------------------------------------

export async function insertAuditLog(input: AuditEventInput): Promise<AuditEvent> {
  await initDatabase().catch(() => {})
  const pool = getPool()
  const id = input.id ?? `aud-${Date.now()}-${randomUUID().slice(0, 8)}`
  const timestamp = input.at ?? new Date().toISOString()
  const now = Date.now()

  const event: AuditEvent = {
    id,
    at: timestamp,
    actor: input.actor,
    action: input.action,
    target: input.target,
    detail: input.detail,
    meta: input.meta,
  }

  if (pool) {
    try {
      await pool.query(
        `INSERT INTO audit_logs (id, timestamp, actor, action, target, detail, meta, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         ON CONFLICT (id) DO UPDATE
         SET actor = EXCLUDED.actor, action = EXCLUDED.action, target = EXCLUDED.target, detail = EXCLUDED.detail, meta = EXCLUDED.meta`,
        [
          id,
          timestamp,
          input.actor,
          input.action,
          input.target ?? null,
          input.detail ?? null,
          input.meta ? JSON.stringify(input.meta) : null,
          now,
        ]
      )
      return event
    } catch (err) {
      console.warn("[postgres] insertAuditLog failed, using memory fallback:", (err as Error).message)
    }
  }

  memoryAuditLogs.unshift(event)
  if (memoryAuditLogs.length > 500) memoryAuditLogs.pop()
  return event
}

export async function queryAuditLogs(options?: {
  limit?: number
  query?: string
}): Promise<AuditEvent[]> {
  await initDatabase().catch(() => {})
  const pool = getPool()
  const limit = Math.min(Math.max(options?.limit ?? 500, 1), 2000)
  const q = options?.query?.trim().toLowerCase()

  if (pool) {
    try {
      if (q) {
        const pattern = `%${q}%`
        const res = await pool.query(
          `SELECT id, timestamp, actor, action, target, detail, meta
           FROM audit_logs
           WHERE LOWER(actor) LIKE $1 OR LOWER(action) LIKE $1 OR LOWER(COALESCE(target, '')) LIKE $1 OR LOWER(COALESCE(detail, '')) LIKE $1
           ORDER BY timestamp DESC
           LIMIT $2`,
          [pattern, limit]
        )
        return res.rows.map(mapAuditRow)
      }

      const res = await pool.query(
        `SELECT id, timestamp, actor, action, target, detail, meta
         FROM audit_logs
         ORDER BY timestamp DESC
         LIMIT $1`,
        [limit]
      )
      return res.rows.map(mapAuditRow)
    } catch (err) {
      console.warn("[postgres] queryAuditLogs failed, using memory fallback:", (err as Error).message)
    }
  }

  let list = memoryAuditLogs
  if (q) {
    list = list.filter(
      (e) =>
        e.actor.toLowerCase().includes(q) ||
        e.action.toLowerCase().includes(q) ||
        e.target?.toLowerCase().includes(q) ||
        e.detail?.toLowerCase().includes(q)
    )
  }
  return list.slice(0, limit)
}

function mapAuditRow(row: {
  id: string
  timestamp: string | Date
  actor: string
  action: string
  target: string | null
  detail: string | null
  meta: unknown
}): AuditEvent {
  const at = row.timestamp instanceof Date ? row.timestamp.toISOString() : String(row.timestamp)
  let meta: Record<string, string | number | boolean | null> | undefined
  if (row.meta) {
    if (typeof row.meta === "object") {
      meta = row.meta as Record<string, string | number | boolean | null>
    } else {
      try {
        meta = JSON.parse(String(row.meta))
      } catch {
        // ignore
      }
    }
  }

  return {
    id: row.id,
    at,
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

export async function insertDeliveryLog(
  input: Omit<DeliveryEvent, "id"> & { id?: string }
): Promise<DeliveryEvent> {
  await initDatabase().catch(() => {})
  const pool = getPool()
  const id = input.id ?? `del-${Date.now()}-${randomUUID().slice(0, 8)}`
  const now = Date.now()

  const event: DeliveryEvent = {
    id,
    timestamp: input.timestamp,
    sender: input.sender,
    recipient: input.recipient,
    status: input.status,
    sizeBytes: input.sizeBytes,
    detail: input.detail,
    queueId: input.queueId,
  }

  if (pool) {
    try {
      await pool.query(
        `INSERT INTO delivery_logs (id, timestamp, sender, recipient, status, size_bytes, detail, queue_id, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         ON CONFLICT (id) DO UPDATE
         SET status = EXCLUDED.status, detail = EXCLUDED.detail, queue_id = EXCLUDED.queue_id`,
        [
          id,
          input.timestamp,
          input.sender,
          input.recipient,
          input.status,
          input.sizeBytes ?? null,
          input.detail ?? null,
          input.queueId ?? null,
          now,
        ]
      )
      return event
    } catch (err) {
      console.warn("[postgres] insertDeliveryLog failed, using memory fallback:", (err as Error).message)
    }
  }

  memoryDeliveryLogs.unshift(event)
  if (memoryDeliveryLogs.length > 500) memoryDeliveryLogs.pop()
  return event
}

export async function queryDeliveryLogs(options?: {
  limit?: number
  query?: string
  status?: string
}): Promise<DeliveryEvent[]> {
  await initDatabase().catch(() => {})
  const pool = getPool()
  const limit = Math.min(Math.max(options?.limit ?? 500, 1), 2000)
  const q = options?.query?.trim().toLowerCase()
  const status = options?.status && options.status !== "all" ? options.status : null

  if (pool) {
    try {
      if (q && status) {
        const pattern = `%${q}%`
        const res = await pool.query(
          `SELECT id, timestamp, sender, recipient, status, size_bytes, detail, queue_id
           FROM delivery_logs
           WHERE status = $1 AND (LOWER(sender) LIKE $2 OR LOWER(recipient) LIKE $2 OR LOWER(COALESCE(detail, '')) LIKE $2)
           ORDER BY timestamp DESC
           LIMIT $3`,
          [status, pattern, limit]
        )
        return res.rows.map(mapDeliveryRow)
      }

      if (q) {
        const pattern = `%${q}%`
        const res = await pool.query(
          `SELECT id, timestamp, sender, recipient, status, size_bytes, detail, queue_id
           FROM delivery_logs
           WHERE LOWER(sender) LIKE $1 OR LOWER(recipient) LIKE $1 OR LOWER(COALESCE(detail, '')) LIKE $1
           ORDER BY timestamp DESC
           LIMIT $2`,
          [pattern, limit]
        )
        return res.rows.map(mapDeliveryRow)
      }

      if (status) {
        const res = await pool.query(
          `SELECT id, timestamp, sender, recipient, status, size_bytes, detail, queue_id
           FROM delivery_logs
           WHERE status = $1
           ORDER BY timestamp DESC
           LIMIT $2`,
          [status, limit]
        )
        return res.rows.map(mapDeliveryRow)
      }

      const res = await pool.query(
        `SELECT id, timestamp, sender, recipient, status, size_bytes, detail, queue_id
         FROM delivery_logs
         ORDER BY timestamp DESC
         LIMIT $1`,
        [limit]
      )
      return res.rows.map(mapDeliveryRow)
    } catch (err) {
      console.warn("[postgres] queryDeliveryLogs failed, using memory fallback:", (err as Error).message)
    }
  }

  let list = memoryDeliveryLogs
  if (status) list = list.filter((e) => e.status === status)
  if (q) {
    list = list.filter(
      (e) =>
        e.sender.toLowerCase().includes(q) ||
        e.recipient.toLowerCase().includes(q) ||
        e.detail?.toLowerCase().includes(q)
    )
  }
  return list.slice(0, limit)
}

function mapDeliveryRow(row: {
  id: string
  timestamp: string | Date
  sender: string
  recipient: string
  status: string
  size_bytes: string | number | null
  detail: string | null
  queue_id: string | null
}): DeliveryEvent {
  const at = row.timestamp instanceof Date ? row.timestamp.toISOString() : String(row.timestamp)
  return {
    id: row.id,
    timestamp: at,
    sender: row.sender,
    recipient: row.recipient,
    status: row.status as DeliveryStatus,
    sizeBytes: row.size_bytes != null ? Number(row.size_bytes) : null,
    detail: row.detail ?? undefined,
    queueId: row.queue_id ?? undefined,
  }
}

// ---------------------------------------------------------------------------
// System Log Operations
// ---------------------------------------------------------------------------

export async function insertSystemLog(
  level: "info" | "warn" | "error",
  subsystem: string,
  message: string,
  details?: unknown
): Promise<void> {
  const pool = getPool()
  const id = `sys-${Date.now()}-${randomUUID().slice(0, 8)}`
  const timestamp = new Date().toISOString()
  const now = Date.now()
  const detailsStr = details
    ? typeof details === "string"
      ? details
      : JSON.stringify(details)
    : null

  if (pool) {
    try {
      await pool.query(
        `INSERT INTO system_logs (id, timestamp, level, subsystem, message, details, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [id, timestamp, level, subsystem, message, detailsStr, now]
      )
      return
    } catch {
      // ignore
    }
  }
}

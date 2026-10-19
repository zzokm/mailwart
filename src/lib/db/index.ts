import "server-only"

import { existsSync } from "node:fs"
import path from "node:path"
import { randomUUID } from "node:crypto"
import { Pool } from "pg"

import type { AuditEvent, AuditEventInput } from "@/lib/audit/types"
import type { DeliveryEvent, DeliveryStatus } from "@/lib/stalwart/types"
import type { CloudflareAccountConfig } from "@/lib/cloudflare/types"
import type { DeliverabilitySuiteReport } from "@/lib/deliverability/types"
import { ensureAdminUserInternal } from "./users"

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
  if (process.env.NODE_ENV !== "test" && !connectionString) return null

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
          owner_id VARCHAR(64),
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
        CREATE INDEX IF NOT EXISTS idx_domains_name ON domains(LOWER(name));

        ALTER TABLE domains ADD COLUMN IF NOT EXISTS owner_id VARCHAR(64);
        ALTER TABLE mailboxes ADD COLUMN IF NOT EXISTS owner_id VARCHAR(64);
        CREATE INDEX IF NOT EXISTS idx_domains_owner_id ON domains(owner_id);
        CREATE INDEX IF NOT EXISTS idx_mailboxes_owner_id ON mailboxes(owner_id);

        CREATE TABLE IF NOT EXISTS cloudflare_accounts (
          id VARCHAR(64) PRIMARY KEY,
          user_id VARCHAR(64),
          account_name VARCHAR(255) NOT NULL,
          account_id VARCHAR(255),
          api_token TEXT NOT NULL,
          last_verified_at TIMESTAMPTZ,
          zones_count INTEGER DEFAULT 0,
          status VARCHAR(32) NOT NULL DEFAULT 'active',
          error_message TEXT,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
        CREATE INDEX IF NOT EXISTS idx_cf_user_id ON cloudflare_accounts(user_id);

        CREATE TABLE IF NOT EXISTS copilot_settings (
          id VARCHAR(64) PRIMARY KEY,
          user_id VARCHAR(64),
          active_provider VARCHAR(64) NOT NULL DEFAULT 'openai',
          models JSONB NOT NULL DEFAULT '{}',
          base_urls JSONB NOT NULL DEFAULT '{}',
          api_keys JSONB NOT NULL DEFAULT '{}',
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
        CREATE INDEX IF NOT EXISTS idx_copilot_settings_user_id ON copilot_settings(user_id);

        CREATE TABLE IF NOT EXISTS copilot_conversations (
          id VARCHAR(64) PRIMARY KEY,
          user_id VARCHAR(64),
          actor VARCHAR(64) NOT NULL,
          title VARCHAR(255) NOT NULL,
          provider JSONB NOT NULL,
          messages JSONB NOT NULL DEFAULT '[]',
          message_count INTEGER NOT NULL DEFAULT 0,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
        CREATE INDEX IF NOT EXISTS idx_copilot_conv_user_id ON copilot_conversations(user_id);
        CREATE INDEX IF NOT EXISTS idx_copilot_conv_actor ON copilot_conversations(actor);
        CREATE INDEX IF NOT EXISTS idx_copilot_conv_updated_at ON copilot_conversations(updated_at DESC);

        CREATE TABLE IF NOT EXISTS deliverability_reports (
          id VARCHAR(64) PRIMARY KEY,
          user_id VARCHAR(64),
          overall_score INTEGER NOT NULL,
          total_domains INTEGER NOT NULL,
          report JSONB NOT NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
        CREATE INDEX IF NOT EXISTS idx_deliv_reports_user_id ON deliverability_reports(user_id);
        CREATE INDEX IF NOT EXISTS idx_deliv_reports_created_at ON deliverability_reports(created_at DESC);

        CREATE TABLE IF NOT EXISTS password_reset_otps (
          id VARCHAR(64) PRIMARY KEY,
          user_id VARCHAR(64) NOT NULL,
          email VARCHAR(255) NOT NULL,
          code_hash TEXT NOT NULL,
          salt TEXT NOT NULL,
          reset_token VARCHAR(128),
          verified_at TIMESTAMPTZ,
          attempts INTEGER NOT NULL DEFAULT 0,
          expires_at TIMESTAMPTZ NOT NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
        CREATE INDEX IF NOT EXISTS idx_pw_reset_email ON password_reset_otps(LOWER(email));
        CREATE INDEX IF NOT EXISTS idx_pw_reset_token ON password_reset_otps(reset_token);
        CREATE INDEX IF NOT EXISTS idx_pw_reset_expires ON password_reset_otps(expires_at);

        CREATE TABLE IF NOT EXISTS system_settings (
          key VARCHAR(64) PRIMARY KEY,
          value JSONB NOT NULL,
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );

        CREATE TABLE IF NOT EXISTS user_webmail_settings (
          user_id VARCHAR(64) PRIMARY KEY,
          client VARCHAR(32) NOT NULL DEFAULT 'rav',
          features JSONB NOT NULL DEFAULT '{}',
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
        CREATE INDEX IF NOT EXISTS idx_user_webmail_user_id ON user_webmail_settings(user_id);

        CREATE TABLE IF NOT EXISTS forwarding_rules (
          id VARCHAR(64) PRIMARY KEY,
          domain_id VARCHAR(128) NOT NULL,
          domain_name VARCHAR(255) NOT NULL,
          scope VARCHAR(32) NOT NULL DEFAULT 'user',
          source_type VARCHAR(32) NOT NULL DEFAULT 'exact',
          source VARCHAR(255) NOT NULL,
          source_account_id VARCHAR(128),
          targets JSONB NOT NULL DEFAULT '[]',
          keep_local_copy BOOLEAN NOT NULL DEFAULT true,
          enabled BOOLEAN NOT NULL DEFAULT true,
          backend VARCHAR(32) NOT NULL DEFAULT 'sieve',
          description TEXT,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
        CREATE INDEX IF NOT EXISTS idx_fwd_domain_id ON forwarding_rules(domain_id);
        CREATE INDEX IF NOT EXISTS idx_fwd_source ON forwarding_rules(LOWER(source));

        ALTER TABLE forwarding_rules ADD COLUMN IF NOT EXISTS source_type VARCHAR(32) DEFAULT 'exact';
        ALTER TABLE forwarding_rules ADD COLUMN IF NOT EXISTS backend VARCHAR(32) DEFAULT 'sieve';
        ALTER TABLE forwarding_rules ADD COLUMN IF NOT EXISTS keep_local_copy BOOLEAN DEFAULT true;
        ALTER TABLE forwarding_rules ADD COLUMN IF NOT EXISTS enabled BOOLEAN DEFAULT true;
        ALTER TABLE forwarding_rules ADD COLUMN IF NOT EXISTS description TEXT;
        ALTER TABLE domains ADD COLUMN IF NOT EXISTS catch_all_archival BOOLEAN DEFAULT true;
      `)

      // 2. Seed primary admin account yehia
      await ensureAdminUserInternal(pool)

      // Backfill pre-existing domains, mailboxes, and cloudflare accounts to primary admin
      await pool.query(`
        UPDATE domains 
        SET owner_id = (SELECT id FROM users WHERE role = 'admin' ORDER BY created_at ASC LIMIT 1) 
        WHERE owner_id IS NULL;

        UPDATE mailboxes 
        SET owner_id = (SELECT id FROM users WHERE role = 'admin' ORDER BY created_at ASC LIMIT 1) 
        WHERE owner_id IS NULL;

        UPDATE cloudflare_accounts 
        SET user_id = (SELECT id FROM users WHERE role = 'admin' ORDER BY created_at ASC LIMIT 1) 
        WHERE user_id IS NULL;
      `).catch(() => {})

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
    // 1. Deduplicate incoming accounts by id and lowercase email
    const seenIds = new Set<string>()
    const seenEmails = new Set<string>()
    const dedupedAccounts: typeof accounts = []

    for (const a of accounts) {
      const email = a.email?.trim().toLowerCase()
      const id = a.id?.trim()
      if (!id || !email) continue
      if (seenIds.has(id) || seenEmails.has(email)) continue
      seenIds.add(id)
      seenEmails.add(email)
      dedupedAccounts.push({ ...a, id, email: a.email.trim() })
    }

    for (const a of dedupedAccounts) {
      // 2. Fetch existing owner_id if present by either id or email
      const existing = await pool.query(
        `SELECT id, owner_id FROM mailboxes WHERE id = $1 OR LOWER(email) = LOWER($2) LIMIT 1`,
        [a.id, a.email]
      )
      const existingOwnerId = existing.rows[0]?.owner_id ?? null

      // 3. Clean up any conflicting stale rows having either the same email with different ID,
      // or the same ID with different email, preventing unique constraint collisions.
      await pool.query(
        `DELETE FROM mailboxes WHERE (id != $1 AND LOWER(email) = LOWER($2)) OR (id = $1 AND LOWER(email) != LOWER($2))`,
        [a.id, a.email]
      )

      // 4. Upsert cleanly with ON CONFLICT (id)
      await pool.query(
        `INSERT INTO mailboxes (id, email, name, domain_id, quota_bytes, used_bytes, status, owner_id, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
         ON CONFLICT (id) DO UPDATE
         SET email = EXCLUDED.email,
             name = COALESCE(EXCLUDED.name, mailboxes.name),
             domain_id = EXCLUDED.domain_id,
             quota_bytes = EXCLUDED.quota_bytes,
             used_bytes = EXCLUDED.used_bytes,
             status = EXCLUDED.status,
             owner_id = COALESCE(mailboxes.owner_id, EXCLUDED.owner_id),
             updated_at = NOW()`,
        [
          a.id,
          a.email,
          a.name ?? null,
          a.domainId ?? "",
          a.quotaBytes ?? 0,
          a.usedBytes ?? 0,
          a.status ?? "active",
          existingOwnerId,
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
    const seenIds = new Set<string>()
    const seenNames = new Set<string>()
    const dedupedDomains: typeof domains = []

    for (const d of domains) {
      const name = d.name?.trim().toLowerCase()
      const id = d.id?.trim()
      if (!id || !name) continue
      if (seenIds.has(id) || seenNames.has(name)) continue
      seenIds.add(id)
      seenNames.add(name)
      dedupedDomains.push({ ...d, id, name: d.name.trim() })
    }

    for (const d of dedupedDomains) {
      const existing = await pool.query(
        `SELECT id, owner_id FROM domains WHERE id = $1 OR LOWER(name) = LOWER($2) LIMIT 1`,
        [d.id, d.name]
      )
      const existingOwnerId = existing.rows[0]?.owner_id ?? null

      await pool.query(
        `DELETE FROM domains WHERE (id != $1 AND LOWER(name) = LOWER($2)) OR (id = $1 AND LOWER(name) != LOWER($2))`,
        [d.id, d.name]
      )

      await pool.query(
        `INSERT INTO domains (id, name, description, owner_id, updated_at)
         VALUES ($1, $2, $3, $4, NOW())
         ON CONFLICT (id) DO UPDATE
         SET name = EXCLUDED.name,
             description = COALESCE(EXCLUDED.description, domains.description),
             owner_id = COALESCE(domains.owner_id, EXCLUDED.owner_id),
             updated_at = NOW()`,
        [d.id, d.name, d.description ?? null, existingOwnerId]
      )
    }
  } catch (err) {
    console.error("[postgres] syncDomainsToDb error:", err)
  }
}

export async function assignDomainOwner(
  domainId: string,
  domainName: string,
  ownerId: string
): Promise<void> {
  await initDatabase().catch(() => {})
  const pool = getPool()
  if (!pool) return
  const normName = domainName.toLowerCase()
  try {
    // 1. Try updating existing record by id or name
    const updateRes = await pool.query(
      `UPDATE domains SET owner_id = $1, updated_at = NOW() WHERE id = $2 OR LOWER(name) = $3`,
      [ownerId, domainId, normName]
    )
    // 2. Insert new record if no existing record matched
    if (updateRes.rowCount === 0) {
      await pool.query(
        `INSERT INTO domains (id, name, owner_id, updated_at)
         VALUES ($1, $2, $3, NOW())
         ON CONFLICT (id) DO UPDATE
         SET owner_id = EXCLUDED.owner_id, name = EXCLUDED.name, updated_at = NOW()`,
        [domainId, normName, ownerId]
      )
    }
  } catch (err) {
    console.error("[postgres] assignDomainOwner error:", err)
  }
}

export async function removeDomainRecord(domainIdOrName: string): Promise<void> {
  await initDatabase().catch(() => {})
  const pool = getPool()
  if (!pool) return
  try {
    await pool.query(
      `DELETE FROM domains WHERE id = $1 OR LOWER(name) = LOWER($1)`,
      [domainIdOrName]
    )
  } catch (err) {
    console.error("[postgres] removeDomainRecord error:", err)
  }
}

export async function removeMailboxRecord(mailboxIdOrEmail: string): Promise<void> {
  await initDatabase().catch(() => {})
  const pool = getPool()
  if (!pool) return
  try {
    await pool.query(
      `DELETE FROM mailboxes WHERE id = $1 OR LOWER(email) = LOWER($1)`,
      [mailboxIdOrEmail]
    )
  } catch (err) {
    console.error("[postgres] removeMailboxRecord error:", err)
  }
}

export async function assignMailboxOwner(
  mailboxId: string,
  email: string,
  ownerId: string
): Promise<void> {
  await initDatabase().catch(() => {})
  const pool = getPool()
  if (!pool) return
  try {
    await pool.query(
      `UPDATE mailboxes SET owner_id = $1 WHERE id = $2 OR LOWER(email) = LOWER($3)`,
      [ownerId, mailboxId, email]
    )
  } catch (err) {
    console.error("[postgres] assignMailboxOwner error:", err)
  }
}

export async function getUserOwnedDomainNames(userId: string): Promise<string[]> {
  await initDatabase().catch(() => {})
  const pool = getPool()
  if (!pool || !userId) return []
  try {
    const res = await pool.query(
      `SELECT LOWER(name) as name FROM domains WHERE owner_id = $1`,
      [userId]
    )
    return res.rows.map((r: { name: string }) => r.name)
  } catch {
    return []
  }
}

export async function getUserOwnedDomainIds(userId: string): Promise<string[]> {
  await initDatabase().catch(() => {})
  const pool = getPool()
  if (!pool || !userId) return []
  try {
    const res = await pool.query(
      `SELECT id FROM domains WHERE owner_id = $1`,
      [userId]
    )
    return res.rows.map((r: { id: string }) => r.id)
  } catch {
    return []
  }
}

export async function isDomainOwnedByUser(domainNameOrId: string, userId: string): Promise<boolean> {
  await initDatabase().catch(() => {})
  const pool = getPool()
  if (!pool || !userId) return false
  try {
    const res = await pool.query(
      `SELECT 1 FROM domains WHERE (id = $1 OR LOWER(name) = LOWER($1)) AND owner_id = $2 LIMIT 1`,
      [domainNameOrId, userId]
    )
    return (res.rowCount ?? 0) > 0
  } catch {
    return false
  }
}

export async function getDomainOwner(domainNameOrId: string): Promise<string | null> {
  await initDatabase().catch(() => {})
  const pool = getPool()
  if (!pool || !domainNameOrId) return null
  try {
    const res = await pool.query(
      `SELECT owner_id FROM domains WHERE id = $1 OR LOWER(name) = LOWER($1) LIMIT 1`,
      [domainNameOrId]
    )
    return res.rows[0]?.owner_id || null
  } catch {
    return null
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

// ---------------------------------------------------------------------------
// Cloudflare Account Operations (PostgreSQL-backed)
// ---------------------------------------------------------------------------

export async function getDbCloudflareAccounts(
  userId?: string,
  isAdmin?: boolean
): Promise<CloudflareAccountConfig[]> {
  await initDatabase().catch(() => {})
  const pool = getPool()
  if (!pool) return []
  try {
    let res
    if (isAdmin || !userId) {
      res = await pool.query(
        `SELECT * FROM cloudflare_accounts ORDER BY created_at ASC`
      )
    } else {
      res = await pool.query(
        `SELECT * FROM cloudflare_accounts WHERE user_id = $1 ORDER BY created_at ASC`,
        [userId]
      )
    }
    return res.rows.map(
      (r: {
        id: string
        user_id: string | null
        account_name: string
        account_id: string | null
        api_token: string
        last_verified_at: string | Date | null
        zones_count: number | string | null
        status: string
        error_message: string | null
      }) => ({
        id: r.id,
        userId: r.user_id || undefined,
        accountName: r.account_name,
        accountId: r.account_id || undefined,
        apiToken: r.api_token,
        lastVerifiedAt: r.last_verified_at
          ? new Date(r.last_verified_at).toISOString()
          : undefined,
        zonesCount: r.zones_count != null ? Number(r.zones_count) : undefined,
        status: (r.status || "active") as "active" | "error" | "invalid",
        errorMessage: r.error_message || undefined,
      })
    )
  } catch (err) {
    console.error("[postgres] getDbCloudflareAccounts error:", err)
    return []
  }
}

export async function upsertDbCloudflareAccount(
  account: CloudflareAccountConfig
): Promise<void> {
  await initDatabase().catch(() => {})
  const pool = getPool()
  if (!pool) return
  try {
    await pool.query(
      `INSERT INTO cloudflare_accounts (id, user_id, account_name, account_id, api_token, last_verified_at, zones_count, status, error_message, updated_at)
       VALUES (
         $1, 
         COALESCE($2, (SELECT id FROM users WHERE role = 'admin' ORDER BY created_at ASC LIMIT 1)), 
         $3, $4, $5, $6, $7, $8, $9, NOW()
       )
       ON CONFLICT (id) DO UPDATE
       SET user_id = COALESCE(EXCLUDED.user_id, cloudflare_accounts.user_id),
           account_name = EXCLUDED.account_name,
           account_id = EXCLUDED.account_id,
           api_token = EXCLUDED.api_token,
           last_verified_at = EXCLUDED.last_verified_at,
           zones_count = EXCLUDED.zones_count,
           status = EXCLUDED.status,
           error_message = EXCLUDED.error_message,
           updated_at = NOW()`,
      [
        account.id,
        account.userId || null,
        account.accountName,
        account.accountId || null,
        account.apiToken,
        account.lastVerifiedAt ? new Date(account.lastVerifiedAt) : null,
        account.zonesCount ?? 0,
        account.status || "active",
        account.errorMessage || null,
      ]
    )
  } catch (err) {
    console.error("[postgres] upsertDbCloudflareAccount error:", err)
  }
}

export async function deleteDbCloudflareAccount(id: string): Promise<boolean> {
  await initDatabase().catch(() => {})
  const pool = getPool()
  if (!pool) return false
  try {
    const res = await pool.query(
      `DELETE FROM cloudflare_accounts WHERE id = $1`,
      [id]
    )
    return (res.rowCount ?? 0) > 0
  } catch (err) {
    console.error("[postgres] deleteDbCloudflareAccount error:", err)
    return false
  }
}

// ---------------------------------------------------------------------------
// Copilot Settings Operations (PostgreSQL-backed)
// ---------------------------------------------------------------------------

export type DbCopilotSettings = {
  activeProvider: string
  models: Record<string, string>
  baseUrls: Record<string, string>
  apiKeys: Record<string, string>
}

export async function getDbCopilotSettings(
  userId?: string
): Promise<DbCopilotSettings | null> {
  await initDatabase().catch(() => {})
  const pool = getPool()
  if (!pool) return null
  try {
    let res
    if (userId) {
      res = await pool.query(
        `SELECT * FROM copilot_settings WHERE id = $1 OR id = 'global' ORDER BY CASE WHEN id = $1 THEN 0 ELSE 1 END LIMIT 1`,
        [userId]
      )
    } else {
      res = await pool.query(
        `SELECT * FROM copilot_settings WHERE id = 'global' LIMIT 1`
      )
    }
    if (res.rows.length === 0) return null
    const row = res.rows[0]
    return {
      activeProvider: row.active_provider || "openai",
      models: typeof row.models === "object" && row.models ? row.models : {},
      baseUrls: typeof row.base_urls === "object" && row.base_urls ? row.base_urls : {},
      apiKeys: typeof row.api_keys === "object" && row.api_keys ? row.api_keys : {},
    }
  } catch (err) {
    console.error("[postgres] getDbCopilotSettings error:", err)
    return null
  }
}

export async function upsertDbCopilotSettings(
  settings: {
    activeProvider: string
    models: Record<string, string>
    baseUrls: Record<string, string>
    apiKeys: Record<string, string>
  },
  userId?: string
): Promise<void> {
  await initDatabase().catch(() => {})
  const pool = getPool()
  if (!pool) return
  const id = userId || "global"
  try {
    await pool.query(
      `INSERT INTO copilot_settings (id, user_id, active_provider, models, base_urls, api_keys, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, NOW())
       ON CONFLICT (id) DO UPDATE
       SET active_provider = EXCLUDED.active_provider,
           models = EXCLUDED.models,
           base_urls = EXCLUDED.base_urls,
           api_keys = EXCLUDED.api_keys,
           updated_at = NOW()`,
      [
        id,
        userId || null,
        settings.activeProvider,
        JSON.stringify(settings.models || {}),
        JSON.stringify(settings.baseUrls || {}),
        JSON.stringify(settings.apiKeys || {}),
      ]
    )
  } catch (err) {
    console.error("[postgres] upsertDbCopilotSettings error:", err)
  }
}

// ---------------------------------------------------------------------------
// Copilot Conversation Operations (PostgreSQL-backed with RBAC)
// ---------------------------------------------------------------------------

export type DbCopilotConversationSummary = {
  id: string
  title: string
  createdAt: string
  updatedAt: string
  messageCount: number
}

export type DbCopilotConversationRecord = DbCopilotConversationSummary & {
  version: 1
  provider: { id: string; label: string; model: string }
  messages: unknown[]
}

export async function getDbCopilotConversations(
  actor: string,
  userId?: string,
  isAdmin?: boolean
): Promise<DbCopilotConversationSummary[]> {
  await initDatabase().catch(() => {})
  const pool = getPool()
  if (!pool) return []
  try {
    let res
    if (isAdmin) {
      res = await pool.query(
        `SELECT id, title, message_count, created_at, updated_at
         FROM copilot_conversations
         WHERE actor = $1 OR user_id = $2
         ORDER BY updated_at DESC LIMIT 50`,
        [actor, userId || null]
      )
    } else {
      res = await pool.query(
        `SELECT id, title, message_count, created_at, updated_at
         FROM copilot_conversations
         WHERE (user_id IS NOT NULL AND user_id = $1) OR (user_id IS NULL AND actor = $2)
         ORDER BY updated_at DESC LIMIT 50`,
        [userId || null, actor]
      )
    }
    return res.rows.map(
      (r: {
        id: string
        title: string
        message_count: number
        created_at: Date
        updated_at: Date
      }) => ({
        id: r.id,
        title: r.title,
        messageCount: Number(r.message_count || 0),
        createdAt: new Date(r.created_at).toISOString(),
        updatedAt: new Date(r.updated_at).toISOString(),
      })
    )
  } catch (err) {
    console.error("[postgres] getDbCopilotConversations error:", err)
    return []
  }
}

export async function getDbCopilotConversation(
  id: string,
  actor: string,
  userId?: string,
  isAdmin?: boolean
): Promise<DbCopilotConversationRecord | null> {
  await initDatabase().catch(() => {})
  const pool = getPool()
  if (!pool) return null
  try {
    const res = await pool.query(
      `SELECT * FROM copilot_conversations WHERE id = $1 LIMIT 1`,
      [id]
    )
    if (res.rows.length === 0) return null
    const r = res.rows[0]
    if (!isAdmin) {
      if (userId && r.user_id && r.user_id !== userId) return null
      if (r.actor !== actor && (!userId || r.user_id !== userId)) return null
    }
    return {
      id: r.id,
      version: 1,
      title: r.title,
      messageCount: Number(r.message_count || 0),
      provider:
        typeof r.provider === "object" && r.provider
          ? r.provider
          : JSON.parse(r.provider || "{}"),
      messages: Array.isArray(r.messages)
        ? r.messages
        : JSON.parse(r.messages || "[]"),
      createdAt: new Date(r.created_at).toISOString(),
      updatedAt: new Date(r.updated_at).toISOString(),
    }
  } catch (err) {
    console.error("[postgres] getDbCopilotConversation error:", err)
    return null
  }
}

export async function saveDbCopilotConversation(
  record: DbCopilotConversationRecord,
  userId?: string
): Promise<void> {
  await initDatabase().catch(() => {})
  const pool = getPool()
  if (!pool) return
  try {
    await pool.query(
      `INSERT INTO copilot_conversations (id, user_id, actor, title, provider, messages, message_count, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
       ON CONFLICT (id) DO UPDATE
       SET title = EXCLUDED.title,
           provider = EXCLUDED.provider,
           messages = EXCLUDED.messages,
           message_count = EXCLUDED.message_count,
           updated_at = NOW()`,
      [
        record.id,
        userId || null,
        record.provider?.id || "user",
        record.title,
        JSON.stringify(record.provider || {}),
        JSON.stringify(record.messages || []),
        record.messageCount || (Array.isArray(record.messages) ? record.messages.length : 0),
        record.createdAt ? new Date(record.createdAt) : new Date(),
      ]
    )
  } catch (err) {
    console.error("[postgres] saveDbCopilotConversation error:", err)
  }
}

export async function deleteDbCopilotConversation(
  id: string,
  actor: string,
  userId?: string,
  isAdmin?: boolean
): Promise<boolean> {
  await initDatabase().catch(() => {})
  const pool = getPool()
  if (!pool) return false
  try {
    let res
    if (isAdmin) {
      res = await pool.query(
        `DELETE FROM copilot_conversations WHERE id = $1`,
        [id]
      )
    } else {
      res = await pool.query(
        `DELETE FROM copilot_conversations WHERE id = $1 AND (user_id = $2 OR actor = $3)`,
        [id, userId || null, actor]
      )
    }
    return (res.rowCount ?? 0) > 0
  } catch (err) {
    console.error("[postgres] deleteDbCopilotConversation error:", err)
    return false
  }
}

export async function deleteAllDbCopilotConversations(
  actor: string,
  userId?: string,
  isAdmin?: boolean
): Promise<number> {
  await initDatabase().catch(() => {})
  const pool = getPool()
  if (!pool) return 0
  try {
    let res
    if (isAdmin && !userId) {
      res = await pool.query(
        `DELETE FROM copilot_conversations WHERE actor = $1`,
        [actor]
      )
    } else {
      res = await pool.query(
        `DELETE FROM copilot_conversations WHERE user_id = $1 OR actor = $2`,
        [userId || null, actor]
      )
    }
    return res.rowCount ?? 0
  } catch (err) {
    console.error("[postgres] deleteAllDbCopilotConversations error:", err)
    return 0
  }
}

// ---------------------------------------------------------------------------
// Deliverability Report Operations (PostgreSQL-backed)
// ---------------------------------------------------------------------------

export async function getDbLatestDeliverabilityReport(): Promise<DeliverabilitySuiteReport | null> {
  await initDatabase().catch(() => {})
  const pool = getPool()
  if (!pool) return null
  try {
    const res = await pool.query(
      `SELECT report FROM deliverability_reports ORDER BY created_at DESC LIMIT 1`
    )
    if (res.rows.length === 0) return null
    const r = res.rows[0]
    return typeof r.report === "object" && r.report
      ? (r.report as DeliverabilitySuiteReport)
      : (JSON.parse(r.report) as DeliverabilitySuiteReport)
  } catch (err) {
    console.error("[postgres] getDbLatestDeliverabilityReport error:", err)
    return null
  }
}

export async function saveDbDeliverabilityReport(
  report: DeliverabilitySuiteReport,
  userId?: string
): Promise<void> {
  await initDatabase().catch(() => {})
  const pool = getPool()
  if (!pool) return
  const id = `rep_${Date.now()}_${randomUUID().slice(0, 8)}`
  try {
    await pool.query(
      `INSERT INTO deliverability_reports (id, user_id, overall_score, total_domains, report, created_at)
       VALUES ($1, $2, $3, $4, $5, NOW())`,
      [
        id,
        userId || null,
        report.overallScore ?? 0,
        report.totalDomains ?? (report.domainReports?.length ?? 0),
        JSON.stringify(report),
      ]
    )

    // Keep latest 20 reports, prune older
    await pool.query(
      `DELETE FROM deliverability_reports WHERE id NOT IN (
        SELECT id FROM deliverability_reports ORDER BY created_at DESC LIMIT 20
      )`
    ).catch(() => {})
  } catch (err) {
    console.error("[postgres] saveDbDeliverabilityReport error:", err)
  }
}

export {
  getForwardingRules,
  getForwardingRule,
  saveForwardingRule,
  deleteForwardingRule,
  toggleForwardingRule,
  setDomainCatchAllArchival,
  getDomainCatchAllArchival,
} from "./forwarding"


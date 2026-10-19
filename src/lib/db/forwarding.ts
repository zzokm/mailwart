import "server-only"

import { getPool, initDatabase } from "./index"
import type { ForwardingRule, ForwardSourceType } from "@/lib/stalwart/types"

interface DbForwardingRow {
  id: string
  domain_id: string
  domain_name: string
  scope: string
  source_type: string
  source: string
  source_account_id: string | null
  targets: unknown
  keep_local_copy: boolean
  enabled: boolean
  backend: string
  description: string | null
  created_at: Date | string
  updated_at: Date | string
}

function rowToRule(row: DbForwardingRow): ForwardingRule {
  let targets: string[] = []
  if (Array.isArray(row.targets)) {
    targets = row.targets.map(String)
  } else if (typeof row.targets === "string") {
    try {
      targets = JSON.parse(row.targets)
    } catch {
      targets = [row.targets]
    }
  }

  const scope = (["user", "domain", "wildcard", "regex"].includes(row.scope)
    ? row.scope
    : "user") as ForwardingRule["scope"]

  const sourceType = (["exact", "wildcard", "regex", "domain"].includes(row.source_type)
    ? row.source_type
    : scope === "domain"
      ? "domain"
      : scope === "wildcard"
        ? "wildcard"
        : scope === "regex"
          ? "regex"
          : "exact") as ForwardSourceType

  return {
    id: row.id,
    domainId: row.domain_id,
    domainName: row.domain_name,
    scope,
    sourceType,
    source: row.source,
    sourceAccountId: row.source_account_id,
    targets,
    keepLocalCopy: row.keep_local_copy !== false,
    enabled: row.enabled !== false,
    backend: (row.backend as ForwardingRule["backend"]) || "sieve",
    description: row.description ?? undefined,
    createdAt: row.created_at ? new Date(row.created_at).toISOString() : new Date().toISOString(),
    updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : new Date().toISOString(),
  }
}

/**
 * Fetch all forwarding rules from persistent storage, optionally filtered by domain.
 */
export async function getForwardingRules(domainId?: string): Promise<ForwardingRule[]> {
  await initDatabase()
  const pool = getPool()
  if (!pool) return []

  try {
    const query = domainId
      ? "SELECT * FROM forwarding_rules WHERE domain_id = $1 ORDER BY created_at DESC"
      : "SELECT * FROM forwarding_rules ORDER BY created_at DESC"
    const params = domainId ? [domainId] : []
    const res = await pool.query<DbForwardingRow>(query, params)
    return res.rows.map(rowToRule)
  } catch {
    return []
  }
}

/**
 * Fetch a single forwarding rule by ID.
 */
export async function getForwardingRule(id: string): Promise<ForwardingRule | null> {
  await initDatabase()
  const pool = getPool()
  if (!pool) return null

  try {
    const res = await pool.query<DbForwardingRow>(
      "SELECT * FROM forwarding_rules WHERE id = $1 LIMIT 1",
      [id]
    )
    if (res.rows.length === 0) return null
    return rowToRule(res.rows[0])
  } catch {
    return null
  }
}

/**
 * Insert or update a forwarding rule in PostgreSQL.
 */
export async function saveForwardingRule(rule: ForwardingRule): Promise<ForwardingRule> {
  await initDatabase()
  const pool = getPool()
  if (!pool) throw new Error("Database unavailable")

  const now = new Date()
  const sourceType = rule.sourceType || (rule.scope === "domain" ? "domain" : "exact")

  await pool.query(
    `INSERT INTO forwarding_rules (
      id, domain_id, domain_name, scope, source_type, source,
      source_account_id, targets, keep_local_copy, enabled,
      backend, description, created_at, updated_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
    ON CONFLICT (id) DO UPDATE SET
      domain_id = EXCLUDED.domain_id,
      domain_name = EXCLUDED.domain_name,
      scope = EXCLUDED.scope,
      source_type = EXCLUDED.source_type,
      source = EXCLUDED.source,
      source_account_id = EXCLUDED.source_account_id,
      targets = EXCLUDED.targets,
      keep_local_copy = EXCLUDED.keep_local_copy,
      enabled = EXCLUDED.enabled,
      backend = EXCLUDED.backend,
      description = EXCLUDED.description,
      updated_at = EXCLUDED.updated_at`,
    [
      rule.id,
      rule.domainId,
      rule.domainName,
      rule.scope,
      sourceType,
      rule.source,
      rule.sourceAccountId || null,
      JSON.stringify(rule.targets),
      rule.keepLocalCopy !== false,
      rule.enabled !== false,
      rule.backend || "sieve",
      rule.description || null,
      rule.createdAt ? new Date(rule.createdAt) : now,
      now,
    ]
  )

  return {
    ...rule,
    sourceType,
    updatedAt: now.toISOString(),
  }
}

/**
 * Delete a forwarding rule from persistent storage by ID.
 */
export async function deleteForwardingRule(id: string): Promise<boolean> {
  await initDatabase()
  const pool = getPool()
  if (!pool) return false

  try {
    const res = await pool.query(
      "DELETE FROM forwarding_rules WHERE id = $1",
      [id]
    )
    return (res.rowCount ?? 0) > 0
  } catch (err) {
    console.warn(`[forwarding_rules] Failed to delete rule ${id}:`, err)
    return false
  }
}

/**
 * Toggle the enabled status of a forwarding rule.
 */
export async function toggleForwardingRule(
  id: string,
  enabled?: boolean
): Promise<ForwardingRule | null> {
  await initDatabase()
  const pool = getPool()
  if (!pool) return null

  try {
    const existing = await getForwardingRule(id)
    if (!existing) return null

    const nextEnabled = enabled !== undefined ? enabled : !existing.enabled
    const now = new Date()

    await pool.query(
      "UPDATE forwarding_rules SET enabled = $1, updated_at = $2 WHERE id = $3",
      [nextEnabled, now, id]
    )

    return {
      ...existing,
      enabled: nextEnabled,
      updatedAt: now.toISOString(),
    }
  } catch (err) {
    console.warn(`[forwarding_rules] Failed to toggle rule ${id}:`, err)
    return null
  }
}

/**
 * Set domain catch-all archival flag (whether all delivered emails are copied to catch-all).
 */
export async function setDomainCatchAllArchival(
  domainId: string,
  archival: boolean
): Promise<void> {
  await initDatabase()
  const pool = getPool()
  if (!pool) return

  try {
    await pool.query(
      "UPDATE domains SET catch_all_archival = $1, updated_at = NOW() WHERE id = $2",
      [archival, domainId]
    )
  } catch (err) {
    console.warn(`[domains] Failed to update catch_all_archival for domain ${domainId}:`, err)
  }
}

/**
 * Get domain catch-all archival setting (defaults to true).
 */
export async function getDomainCatchAllArchival(domainId: string): Promise<boolean> {
  await initDatabase()
  const pool = getPool()
  if (!pool) return true

  try {
    const res = await pool.query<{ catch_all_archival: boolean | null }>(
      "SELECT catch_all_archival FROM domains WHERE id = $1 LIMIT 1",
      [domainId]
    )
    if (res.rows.length === 0 || res.rows[0].catch_all_archival === null) {
      return true
    }
    return res.rows[0].catch_all_archival
  } catch {
    return true
  }
}

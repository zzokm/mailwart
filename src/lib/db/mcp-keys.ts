import "server-only"

import { createHash, randomBytes, timingSafeEqual } from "node:crypto"
import { getPool, initDatabase } from "./index"

export interface McpApiKeyRecord {
  id: string
  name: string
  keyHash: string
  prefix: string
  createdBy: string
  lastUsedAt: string | null
  createdAt: string
}

export interface SafeMcpApiKey {
  id: string
  name: string
  prefix: string
  createdBy: string
  lastUsedAt: string | null
  createdAt: string
}

export interface GeneratedMcpApiKey extends SafeMcpApiKey {
  rawKey: string
}

// In-memory fallback store for offline tests and development
const mockKeysStore = new Map<string, McpApiKeyRecord>()

export function hashMcpKey(rawKey: string): string {
  return createHash("sha256").update(rawKey.trim()).digest("hex")
}

export function generateMcpToken(): { rawKey: string; prefix: string; keyHash: string } {
  const tokenBytes = randomBytes(24).toString("hex")
  const rawKey = `mw_mcp_${tokenBytes}`
  const prefix = `mw_mcp_${tokenBytes.slice(0, 6)}...`
  const keyHash = hashMcpKey(rawKey)
  return { rawKey, prefix, keyHash }
}

export async function createMcpApiKey(
  name: string,
  createdBy = "admin"
): Promise<GeneratedMcpApiKey> {
  const id = `mcp_key_${Date.now().toString(36)}_${randomBytes(4).toString("hex")}`
  const { rawKey, prefix, keyHash } = generateMcpToken()
  const createdAt = new Date().toISOString()

  await initDatabase()
  const pool = getPool()

  if (pool) {
    try {
      await pool.query(
        `INSERT INTO mcp_api_keys (id, name, key_hash, prefix, created_by, created_at)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [id, name.trim(), keyHash, prefix, createdBy, createdAt]
      )
    } catch {
      // Fallback to mock store if table not yet migrated or offline
      mockKeysStore.set(id, {
        id,
        name: name.trim(),
        keyHash,
        prefix,
        createdBy,
        lastUsedAt: null,
        createdAt,
      })
    }
  } else {
    mockKeysStore.set(id, {
      id,
      name: name.trim(),
      keyHash,
      prefix,
      createdBy,
      lastUsedAt: null,
      createdAt,
    })
  }

  return {
    id,
    name: name.trim(),
    prefix,
    createdBy,
    lastUsedAt: null,
    createdAt,
    rawKey,
  }
}

export async function listMcpApiKeys(): Promise<SafeMcpApiKey[]> {
  await initDatabase()
  const pool = getPool()

  if (pool) {
    try {
      const res = await pool.query(
        `SELECT id, name, prefix, created_by, last_used_at, created_at
         FROM mcp_api_keys
         ORDER BY created_at DESC`
      )
      return res.rows.map((r) => ({
        id: r.id,
        name: r.name,
        prefix: r.prefix,
        createdBy: r.created_by,
        lastUsedAt: r.last_used_at ? new Date(r.last_used_at).toISOString() : null,
        createdAt: new Date(r.created_at).toISOString(),
      }))
    } catch {
      // Fallback to mock store
      return Array.from(mockKeysStore.values())
        .sort((a, b) => (b.createdAt > a.createdAt ? 1 : -1))
        .map(({ keyHash: _, ...safe }) => safe)
    }
  }

  return Array.from(mockKeysStore.values())
    .sort((a, b) => (b.createdAt > a.createdAt ? 1 : -1))
    .map(({ keyHash: _, ...safe }) => safe)
}

export async function revokeMcpApiKey(id: string): Promise<boolean> {
  await initDatabase()
  const pool = getPool()

  if (pool) {
    try {
      const res = await pool.query(
        `DELETE FROM mcp_api_keys WHERE id = $1`,
        [id]
      )
      mockKeysStore.delete(id)
      return (res.rowCount ?? 0) > 0
    } catch {
      mockKeysStore.delete(id)
      return true
    }
  }

  return mockKeysStore.delete(id)
}

export async function validateMcpApiKey(
  rawKey: string
): Promise<{ valid: boolean; name?: string; actor?: string }> {
  if (!rawKey || typeof rawKey !== "string") {
    return { valid: false }
  }

  const trimmed = rawKey.trim()

  // 1. Environment variable master key override
  const envKey = process.env.MCP_API_KEY?.trim()
  if (envKey && envKey.length > 0) {
    try {
      const bufA = Buffer.from(trimmed)
      const bufB = Buffer.from(envKey)
      if (bufA.length === bufB.length && timingSafeEqual(bufA, bufB)) {
        return { valid: true, name: "Environment Master Key", actor: "admin-master" }
      }
    } catch {
      /* ignore */
    }
  }

  // 2. Query stored keys by hash
  const incomingHash = hashMcpKey(trimmed)
  await initDatabase()
  const pool = getPool()

  if (pool) {
    try {
      const res = await pool.query(
        `SELECT id, name, created_by FROM mcp_api_keys WHERE key_hash = $1 LIMIT 1`,
        [incomingHash]
      )
      if (res.rows.length > 0) {
        const row = res.rows[0]
        // Touch last_used_at non-blockingly
        pool.query(
          `UPDATE mcp_api_keys SET last_used_at = NOW() WHERE id = $1`,
          [row.id]
        ).catch(() => {})
        return {
          valid: true,
          name: row.name,
          actor: row.created_by || "admin-mcp",
        }
      }
    } catch {
      // Check mock store fallback
      for (const rec of mockKeysStore.values()) {
        if (rec.keyHash === incomingHash) {
          rec.lastUsedAt = new Date().toISOString()
          return { valid: true, name: rec.name, actor: rec.createdBy }
        }
      }
    }
  } else {
    for (const rec of mockKeysStore.values()) {
      if (rec.keyHash === incomingHash) {
        rec.lastUsedAt = new Date().toISOString()
        return { valid: true, name: rec.name, actor: rec.createdBy }
      }
    }
  }

  return { valid: false }
}

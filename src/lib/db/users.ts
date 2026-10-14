import "server-only"

import { randomBytes, randomUUID, scryptSync, timingSafeEqual } from "node:crypto"

import type { Pool } from "pg"
import { getPool, initDatabase } from "./index"

export type UserRole = "admin" | "user"

export type DbUser = {
  id: string
  username: string
  email: string
  passwordHash: string
  salt: string
  role: UserRole
  createdAt: string
  updatedAt: string
}

export type SafeUser = {
  id: string
  username: string
  email: string
  role: UserRole
  createdAt: string
  updatedAt: string
}

export function generateSalt(): string {
  return randomBytes(16).toString("hex")
}

export function hashPassword(password: string, salt: string): string {
  return scryptSync(password, salt, 64).toString("hex")
}

export function createPasswordHash(password: string): {
  hash: string
  salt: string
  combined: string
} {
  const salt = generateSalt()
  const hash = hashPassword(password, salt)
  return { hash, salt, combined: `${salt}:${hash}` }
}

export function verifyPassword(
  password: string,
  hash: string,
  salt?: string
): boolean {
  try {
    let actualHash = hash
    let actualSalt = salt

    if (!actualSalt && hash.includes(":")) {
      const parts = hash.split(":")
      actualSalt = parts[0]
      actualHash = parts[1]
    }

    if (!actualSalt) return false

    const computed = scryptSync(password, actualSalt, 64).toString("hex")
    const bufA = Buffer.from(computed, "hex")
    const bufB = Buffer.from(actualHash, "hex")
    if (bufA.length !== bufB.length) return false
    return timingSafeEqual(bufA, bufB)
  } catch {
    return false
  }
}

function mapUserRow(row: {
  id: string
  username: string
  email: string
  password_hash: string
  salt: string
  role: string
  created_at: string | Date
  updated_at: string | Date
}): DbUser {
  return {
    id: row.id,
    username: row.username,
    email: row.email,
    passwordHash: row.password_hash,
    salt: row.salt,
    role: (row.role === "admin" ? "admin" : "user") as UserRole,
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
    updatedAt: row.updated_at instanceof Date ? row.updated_at.toISOString() : String(row.updated_at),
  }
}

export function toSafeUser(user: DbUser): SafeUser {
  return {
    id: user.id,
    username: user.username,
    email: user.email,
    role: user.role,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  }
}

async function findUserByUsernameOrEmailDirect(pool: Pool, identifier: string): Promise<DbUser | null> {
  const clean = identifier.trim().toLowerCase()
  const res = await pool.query(
    `SELECT id, username, email, password_hash, salt, role, created_at, updated_at
     FROM users
     WHERE LOWER(username) = $1 OR LOWER(email) = $1
     LIMIT 1`,
    [clean]
  )

  if (res.rows.length === 0) return null
  return mapUserRow(res.rows[0])
}

export async function findUserByUsernameOrEmail(identifier: string): Promise<DbUser | null> {
  await initDatabase().catch(() => {})
  const pool = getPool()
  if (!pool) return null
  return findUserByUsernameOrEmailDirect(pool, identifier)
}

export async function findUserById(id: string): Promise<SafeUser | null> {
  await initDatabase().catch(() => {})
  const pool = getPool()
  if (!pool) return null

  const res = await pool.query(
    `SELECT id, username, email, password_hash, salt, role, created_at, updated_at
     FROM users
     WHERE id = $1
     LIMIT 1`,
    [id]
  )

  if (res.rows.length === 0) return null
  return toSafeUser(mapUserRow(res.rows[0]))
}

export async function listAllUsers(): Promise<SafeUser[]> {
  await initDatabase().catch(() => {})
  const pool = getPool()
  if (!pool) return []

  const res = await pool.query(
    `SELECT id, username, email, password_hash, salt, role, created_at, updated_at
     FROM users
     ORDER BY (role = 'admin') DESC, created_at ASC`
  )

  return res.rows.map((r) => toSafeUser(mapUserRow(r)))
}

export const listUsers = listAllUsers

export async function createUser(input: {
  username: string
  email: string
  password: string
  role?: UserRole
}): Promise<SafeUser> {
  await initDatabase().catch(() => {})
  const pool = getPool()
  if (!pool) {
    throw new Error("Database connection is not available.")
  }

  const username = input.username.trim().toLowerCase()
  const email = input.email.trim().toLowerCase()
  const role: UserRole = input.role === "admin" ? "admin" : "user"

  // Check unique constraints
  const existing = await findUserByUsernameOrEmailDirect(pool, username)
  if (existing) {
    throw new Error(`Username "${username}" is already taken.`)
  }
  const existingEmail = await findUserByUsernameOrEmailDirect(pool, email)
  if (existingEmail) {
    throw new Error(`Email "${email}" is already registered.`)
  }

  const id = `usr-${Date.now().toString(36)}-${randomUUID().slice(0, 8)}`
  const salt = generateSalt()
  const passwordHash = hashPassword(input.password, salt)

  const res = await pool.query(
    `INSERT INTO users (id, username, email, password_hash, salt, role, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())
     RETURNING id, username, email, password_hash, salt, role, created_at, updated_at`,
    [id, username, email, passwordHash, salt, role]
  )

  return toSafeUser(mapUserRow(res.rows[0]))
}

export async function updateUser(
  id: string,
  patch: {
    email?: string
    password?: string
    role?: UserRole
  }
): Promise<SafeUser> {
  await initDatabase().catch(() => {})
  const pool = getPool()
  if (!pool) throw new Error("Database connection is not available.")

  const current = await findUserById(id)
  if (!current) throw new Error("User not found.")

  let newEmail = current.email
  if (patch.email && patch.email.trim().toLowerCase() !== current.email) {
    const emailCheck = await findUserByUsernameOrEmailDirect(pool, patch.email.trim().toLowerCase())
    if (emailCheck && emailCheck.id !== id) {
      throw new Error(`Email "${patch.email}" is already in use.`)
    }
    newEmail = patch.email.trim().toLowerCase()
  }

  if (patch.password) {
    const salt = generateSalt()
    const passwordHash = hashPassword(patch.password, salt)
    const role = patch.role || current.role

    const res = await pool.query(
      `UPDATE users
       SET email = $1, password_hash = $2, salt = $3, role = $4, updated_at = NOW()
       WHERE id = $5
       RETURNING id, username, email, password_hash, salt, role, created_at, updated_at`,
      [newEmail, passwordHash, salt, role, id]
    )
    return toSafeUser(mapUserRow(res.rows[0]))
  }

  const role = patch.role || current.role
  const res = await pool.query(
    `UPDATE users
     SET email = $1, role = $2, updated_at = NOW()
     WHERE id = $3
     RETURNING id, username, email, password_hash, salt, role, created_at, updated_at`,
    [newEmail, role, id]
  )
  return toSafeUser(mapUserRow(res.rows[0]))
}

export async function deleteUser(id: string): Promise<boolean> {
  await initDatabase().catch(() => {})
  const pool = getPool()
  if (!pool) return false

  const user = await findUserById(id)
  if (!user) return false

  // Protect the primary seeded admin account yehia
  if (user.username === "yehia") {
    throw new Error("Primary admin account 'yehia' cannot be deleted.")
  }

  const res = await pool.query("DELETE FROM users WHERE id = $1", [id])
  return (res.rowCount ?? 0) > 0
}

/**
 * Internal seed worker used by initDatabase() once tables are created.
 */
export async function ensureAdminUserInternal(pool: Pool): Promise<SafeUser | null> {
  try {
    const adminUser = process.env.APP_ADMIN_USER?.trim() || "yehia"
    const defaultPassword = process.env.APP_ADMIN_PASSWORD?.trim() || "admin"
    const defaultEmail = process.env.APP_ADMIN_EMAIL?.trim() || "yehia@yehia.dev"

    // 1. Check if user 'yehia' already exists
    const yehiaUser = await findUserByUsernameOrEmailDirect(pool, adminUser)
    if (yehiaUser) {
      // Check on each deploy: if APP_ADMIN_PASSWORD was changed in env, update the hash!
      if (
        defaultPassword &&
        !verifyPassword(defaultPassword, yehiaUser.passwordHash, yehiaUser.salt)
      ) {
        const newSalt = generateSalt()
        const newHash = hashPassword(defaultPassword, newSalt)
        const updated = await pool.query(
          `UPDATE users
           SET password_hash = $1, salt = $2, updated_at = NOW()
           WHERE id = $3
           RETURNING id, username, email, password_hash, salt, role, created_at, updated_at`,
          [newHash, newSalt, yehiaUser.id]
        )
        if (updated.rows.length > 0) {
          return toSafeUser(mapUserRow(updated.rows[0]))
        }
      }
      return toSafeUser(yehiaUser)
    }

    // 2. Check if legacy 'admin' exists — migrate to 'yehia'
    const legacyAdmin = await findUserByUsernameOrEmailDirect(pool, "admin")
    if (legacyAdmin) {
      const newSalt = generateSalt()
      const newHash = hashPassword(defaultPassword, newSalt)
      const res = await pool.query(
        `UPDATE users
         SET username = $1, password_hash = $2, salt = $3, role = 'admin', updated_at = NOW()
         WHERE id = $4
         RETURNING id, username, email, password_hash, salt, role, created_at, updated_at`,
        [adminUser, newHash, newSalt, legacyAdmin.id]
      )
      return toSafeUser(mapUserRow(res.rows[0]))
    }

    // 3. Otherwise seed new admin user 'yehia'
    const salt = generateSalt()
    const passwordHash = hashPassword(defaultPassword, salt)
    const id = `usr-yehia-root`

    const res = await pool.query(
      `INSERT INTO users (id, username, email, password_hash, salt, role, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())
       ON CONFLICT (username) DO NOTHING
       RETURNING id, username, email, password_hash, salt, role, created_at, updated_at`,
      [id, adminUser, defaultEmail, passwordHash, salt, "admin"]
    )

    if (res.rows.length > 0) {
      return toSafeUser(mapUserRow(res.rows[0]))
    }

    const created = await findUserByUsernameOrEmailDirect(pool, adminUser)
    return created ? toSafeUser(created) : null
  } catch (err) {
    console.error("Failed to seed admin user 'yehia':", err)
    return null
  }
}

/**
 * Public function to seed or ensure the primary admin account 'yehia'.
 */
export async function ensureAdminUser(): Promise<SafeUser | null> {
  await initDatabase().catch(() => {})
  const pool = getPool()
  if (!pool) return null
  return ensureAdminUserInternal(pool)
}

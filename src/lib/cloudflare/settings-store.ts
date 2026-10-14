import "server-only"

import { mkdir, readFile, writeFile } from "fs/promises"
import path from "path"

import {
  deleteDbCloudflareAccount,
  getDbCloudflareAccounts,
  upsertDbCloudflareAccount,
} from "@/lib/db"
import type { CloudflareAccountConfig, CloudflareSettings } from "./types"

const DEFAULT_SETTINGS: CloudflareSettings = {
  accounts: [],
}

function resolveSettingsPath(): string {
  const fromEnv = process.env.CLOUDFLARE_SETTINGS_PATH?.trim()
  if (fromEnv) {
    return path.isAbsolute(fromEnv)
      ? fromEnv
      : path.join(/*turbopackIgnore: true*/ process.cwd(), fromEnv)
  }
  return path.join(
    /*turbopackIgnore: true*/ process.cwd(),
    "data",
    "cloudflare-settings.json"
  )
}

async function ensureParent(filePath: string): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true })
}

function sanitizeAccount(raw: unknown): CloudflareAccountConfig | null {
  if (!raw || typeof raw !== "object") return null
  const obj = raw as Record<string, unknown>
  const apiToken = typeof obj.apiToken === "string" ? obj.apiToken.trim() : ""
  if (!apiToken) return null

  const id = typeof obj.id === "string" && obj.id.trim() ? obj.id.trim() : `acc_${Math.random().toString(36).slice(2, 10)}`
  const accountName = typeof obj.accountName === "string" && obj.accountName.trim() ? obj.accountName.trim() : "Cloudflare Account"

  return {
    id,
    accountName,
    accountId: typeof obj.accountId === "string" ? obj.accountId.trim() : undefined,
    apiToken,
    lastVerifiedAt: typeof obj.lastVerifiedAt === "string" ? obj.lastVerifiedAt : undefined,
    zonesCount: typeof obj.zonesCount === "number" ? obj.zonesCount : undefined,
    status: obj.status === "error" || obj.status === "invalid" ? obj.status : "active",
    errorMessage: typeof obj.errorMessage === "string" ? obj.errorMessage : undefined,
    userId: typeof obj.userId === "string" && obj.userId.trim() ? obj.userId.trim() : undefined,
  }
}

function sanitizeStored(raw: unknown): CloudflareSettings {
  if (!raw || typeof raw !== "object") return { ...DEFAULT_SETTINGS }
  const obj = raw as Record<string, unknown>

  const accounts: CloudflareAccountConfig[] = []

  if (Array.isArray(obj.accounts)) {
    for (const a of obj.accounts) {
      const sanitized = sanitizeAccount(a)
      if (sanitized) accounts.push(sanitized)
    }
  }

  // Automatic migration: If legacy single apiToken exists and accounts is empty
  const legacyToken = typeof obj.apiToken === "string" && obj.apiToken.trim() ? obj.apiToken.trim() : undefined
  if (legacyToken && accounts.length === 0) {
    const legacyName = typeof obj.accountName === "string" && obj.accountName.trim() ? obj.accountName.trim() : "Cloudflare Account"
    accounts.push({
      id: "acc_migrated",
      accountName: legacyName,
      apiToken: legacyToken,
      lastVerifiedAt: typeof obj.lastVerifiedAt === "string" ? obj.lastVerifiedAt : undefined,
      status: "active",
    })
  }

  return {
    accounts,
  }
}

export async function readCloudflareSettings(
  userId?: string,
  isAdmin?: boolean
): Promise<CloudflareSettings> {
  // 1. Check PostgreSQL first
  try {
    const dbAccounts = await getDbCloudflareAccounts(userId, isAdmin)
    if (dbAccounts.length > 0) {
      return { accounts: dbAccounts }
    }
  } catch (err) {
    console.warn("[cloudflare] Database query failed, checking file fallback:", err)
  }

  // 2. Read from filesystem file if exists and backfill into DB
  const filePath = resolveSettingsPath()
  try {
    const text = await readFile(filePath, "utf8")
    const stored = sanitizeStored(JSON.parse(text) as unknown)
    if (stored.accounts.length > 0) {
      for (const a of stored.accounts) {
        upsertDbCloudflareAccount(a).catch(() => {})
      }
      return stored
    }
  } catch {
    // If no settings file exists or permission denied
  }

  // 3. Fallback to env token (only available to admin or unauthenticated/unspecified)
  const envToken = process.env.CLOUDFLARE_API_TOKEN?.trim()
  if (envToken && isAdmin !== false) {
    return {
      accounts: [
        {
          id: "acc_env",
          accountName: process.env.CLOUDFLARE_ACCOUNT_NAME?.trim() || "Environment Account",
          apiToken: envToken,
          status: "active",
        },
      ],
    }
  }
  return { ...DEFAULT_SETTINGS }
}

export async function writeCloudflareSettings(
  next: Partial<CloudflareSettings>
): Promise<CloudflareSettings> {
  const current = await readCloudflareSettings()
  const merged: CloudflareSettings = {
    ...current,
    ...next,
  }

  // 1. Write to PostgreSQL
  if (merged.accounts) {
    for (const a of merged.accounts) {
      await upsertDbCloudflareAccount(a).catch((err) => {
        console.warn("[cloudflare] DB upsert failed:", err)
      })
    }
  }

  // 2. Safe best-effort write to filesystem (never throw EACCES)
  try {
    const filePath = resolveSettingsPath()
    await ensureParent(filePath)
    await writeFile(filePath, JSON.stringify(merged, null, 2), "utf8")
  } catch (err) {
    console.warn(
      "[cloudflare] Filesystem settings write skipped (using PostgreSQL):",
      err instanceof Error ? err.message : err
    )
  }

  return merged
}

export async function saveCloudflareAccount(
  account: Omit<CloudflareAccountConfig, "id"> & { id?: string }
): Promise<CloudflareAccountConfig> {
  const id = account.id || `acc_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`
  const newAccount: CloudflareAccountConfig = {
    ...account,
    id,
  }

  // 1. Upsert directly to PostgreSQL
  await upsertDbCloudflareAccount(newAccount).catch((err) => {
    console.warn("[cloudflare] DB upsert failed:", err)
  })

  // 2. Update memory/cache and attempt safe file write
  const settings = await readCloudflareSettings()
  const existingIdx = settings.accounts.findIndex((a) => a.id === id)
  let updatedAccounts: CloudflareAccountConfig[]
  if (existingIdx >= 0) {
    updatedAccounts = [...settings.accounts]
    updatedAccounts[existingIdx] = newAccount
  } else {
    updatedAccounts = [...settings.accounts, newAccount]
  }

  try {
    const filePath = resolveSettingsPath()
    await ensureParent(filePath)
    await writeFile(filePath, JSON.stringify({ accounts: updatedAccounts }, null, 2), "utf8")
  } catch (err) {
    console.warn(
      "[cloudflare] Filesystem cache write skipped (using PostgreSQL):",
      err instanceof Error ? err.message : err
    )
  }

  return newAccount
}

export async function removeCloudflareAccount(id: string): Promise<boolean> {
  // 1. Delete from PostgreSQL
  await deleteDbCloudflareAccount(id).catch(() => {})

  // 2. Safe file update
  try {
    const settings = await readCloudflareSettings()
    const filtered = settings.accounts.filter((a) => a.id !== id)
    const filePath = resolveSettingsPath()
    await ensureParent(filePath)
    await writeFile(filePath, JSON.stringify({ accounts: filtered }, null, 2), "utf8")
  } catch (err) {
    console.warn(
      "[cloudflare] Filesystem remove cache write skipped:",
      err instanceof Error ? err.message : err
    )
  }

  return true
}

export async function clearCloudflareSettings(): Promise<void> {
  try {
    const accounts = await getDbCloudflareAccounts()
    for (const a of accounts) {
      await deleteDbCloudflareAccount(a.id).catch(() => {})
    }
  } catch {}
  try {
    const filePath = resolveSettingsPath()
    await ensureParent(filePath)
    await writeFile(filePath, JSON.stringify(DEFAULT_SETTINGS, null, 2), "utf8")
  } catch {}
}

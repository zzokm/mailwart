import "server-only"

import { mkdir, readFile, writeFile } from "fs/promises"
import path from "path"

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

export async function readCloudflareSettings(): Promise<CloudflareSettings> {
  const filePath = resolveSettingsPath()
  try {
    const text = await readFile(filePath, "utf8")
    return sanitizeStored(JSON.parse(text) as unknown)
  } catch {
    // If no settings file exists yet, check if env token exists and provide as initial account
    const envToken = process.env.CLOUDFLARE_API_TOKEN?.trim()
    if (envToken) {
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
}

export async function writeCloudflareSettings(
  next: Partial<CloudflareSettings>
): Promise<CloudflareSettings> {
  const current = await readCloudflareSettings()
  const merged: CloudflareSettings = {
    ...current,
    ...next,
  }
  const filePath = resolveSettingsPath()
  await ensureParent(filePath)
  await writeFile(filePath, JSON.stringify(merged, null, 2), "utf8")
  return merged
}

export async function saveCloudflareAccount(
  account: Omit<CloudflareAccountConfig, "id"> & { id?: string }
): Promise<CloudflareAccountConfig> {
  const settings = await readCloudflareSettings()
  const id = account.id || `acc_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`
  const newAccount: CloudflareAccountConfig = {
    ...account,
    id,
  }

  const existingIdx = settings.accounts.findIndex((a) => a.id === id)
  let updatedAccounts: CloudflareAccountConfig[]
  if (existingIdx >= 0) {
    updatedAccounts = [...settings.accounts]
    updatedAccounts[existingIdx] = newAccount
  } else {
    updatedAccounts = [...settings.accounts, newAccount]
  }

  await writeCloudflareSettings({ accounts: updatedAccounts })
  return newAccount
}

export async function removeCloudflareAccount(id: string): Promise<boolean> {
  const settings = await readCloudflareSettings()
  const filtered = settings.accounts.filter((a) => a.id !== id)
  if (filtered.length === settings.accounts.length) {
    return false
  }
  await writeCloudflareSettings({ accounts: filtered })
  return true
}

export async function clearCloudflareSettings(): Promise<void> {
  const filePath = resolveSettingsPath()
  await ensureParent(filePath)
  await writeFile(filePath, JSON.stringify(DEFAULT_SETTINGS, null, 2), "utf8")
}

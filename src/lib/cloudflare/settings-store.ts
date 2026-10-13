import "server-only"

import { mkdir, readFile, writeFile } from "fs/promises"
import path from "path"

import type { CloudflareSettings } from "./types"

const DEFAULT_SETTINGS: CloudflareSettings = {
  apiToken: undefined,
  accountName: undefined,
  lastVerifiedAt: undefined,
  defaultMailHost: undefined,
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

function sanitizeStored(raw: unknown): CloudflareSettings {
  if (!raw || typeof raw !== "object") return { ...DEFAULT_SETTINGS }
  const obj = raw as Record<string, unknown>

  return {
    apiToken: typeof obj.apiToken === "string" && obj.apiToken.trim() ? obj.apiToken.trim() : undefined,
    accountName: typeof obj.accountName === "string" && obj.accountName.trim() ? obj.accountName.trim() : undefined,
    lastVerifiedAt: typeof obj.lastVerifiedAt === "string" ? obj.lastVerifiedAt : undefined,
    defaultMailHost: typeof obj.defaultMailHost === "string" && obj.defaultMailHost.trim() ? obj.defaultMailHost.trim() : undefined,
  }
}

export async function readCloudflareSettings(): Promise<CloudflareSettings> {
  const filePath = resolveSettingsPath()
  try {
    const text = await readFile(filePath, "utf8")
    return sanitizeStored(JSON.parse(text) as unknown)
  } catch {
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

export async function clearCloudflareSettings(): Promise<void> {
  const filePath = resolveSettingsPath()
  await ensureParent(filePath)
  await writeFile(filePath, JSON.stringify(DEFAULT_SETTINGS, null, 2), "utf8")
}

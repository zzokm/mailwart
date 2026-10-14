import "server-only"

import { mkdir, readFile, writeFile } from "fs/promises"
import path from "path"

import {
  COPILOT_PROVIDER_IDS,
  isCopilotProviderId,
  type CopilotProviderId,
} from "./providers"

export type CopilotStoredSettings = {
  activeProvider: CopilotProviderId
  /** Selected model id per provider. */
  models: Partial<Record<CopilotProviderId, string>>
  /** Optional base URL overrides (server-only). */
  baseUrls: Partial<Record<CopilotProviderId, string>>
  /**
   * Optional API keys entered via Settings (server-only).
   * Env keys always win at resolve time — Architecture §16.5 env-first.
   */
  apiKeys: Partial<Record<CopilotProviderId, string>>
}

const DEFAULT_SETTINGS: CopilotStoredSettings = {
  activeProvider: "openai",
  models: {},
  baseUrls: {},
  apiKeys: {},
}

function resolveSettingsPath(): string {
  const fromEnv = process.env.COPILOT_SETTINGS_PATH?.trim()
  if (fromEnv) {
    return path.isAbsolute(fromEnv)
      ? fromEnv
      : path.join(/*turbopackIgnore: true*/ process.cwd(), fromEnv)
  }
  return path.join(
    /*turbopackIgnore: true*/ process.cwd(),
    "data",
    "copilot-settings.json"
  )
}

async function ensureParent(filePath: string): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true })
}

function sanitizeStored(raw: unknown): CopilotStoredSettings {
  if (!raw || typeof raw !== "object") return { ...DEFAULT_SETTINGS }

  const obj = raw as Record<string, unknown>
  const active =
    typeof obj.activeProvider === "string" &&
    isCopilotProviderId(obj.activeProvider)
      ? obj.activeProvider
      : DEFAULT_SETTINGS.activeProvider

  const models: CopilotStoredSettings["models"] = {}
  const baseUrls: CopilotStoredSettings["baseUrls"] = {}
  const apiKeys: CopilotStoredSettings["apiKeys"] = {}

  if (obj.models && typeof obj.models === "object") {
    for (const id of COPILOT_PROVIDER_IDS) {
      const v = (obj.models as Record<string, unknown>)[id]
      if (typeof v === "string" && v.trim()) models[id] = v.trim()
    }
  }
  if (obj.baseUrls && typeof obj.baseUrls === "object") {
    for (const id of COPILOT_PROVIDER_IDS) {
      const v = (obj.baseUrls as Record<string, unknown>)[id]
      if (typeof v === "string" && v.trim()) baseUrls[id] = v.trim()
    }
  }
  if (obj.apiKeys && typeof obj.apiKeys === "object") {
    for (const id of COPILOT_PROVIDER_IDS) {
      const v = (obj.apiKeys as Record<string, unknown>)[id]
      if (typeof v === "string" && v.trim()) apiKeys[id] = v.trim()
    }
  }

  return { activeProvider: active, models, baseUrls, apiKeys }
}

import {
  getDbCopilotSettings,
  upsertDbCopilotSettings,
} from "@/lib/db"

export async function readCopilotSettings(
  userId?: string
): Promise<CopilotStoredSettings> {
  // 1. Check PostgreSQL first
  try {
    const dbSettings = await getDbCopilotSettings(userId)
    if (dbSettings) {
      return sanitizeStored(dbSettings)
    }
  } catch (err) {
    console.warn("[copilot] DB settings read warning:", err)
  }

  // 2. Read from filesystem file if exists and backfill into DB
  const filePath = resolveSettingsPath()
  try {
    const text = await readFile(filePath, "utf8")
    const stored = sanitizeStored(JSON.parse(text) as unknown)
    upsertDbCopilotSettings(stored, userId).catch(() => {})
    return stored
  } catch {
    return { ...DEFAULT_SETTINGS, models: {}, baseUrls: {}, apiKeys: {} }
  }
}

export async function writeCopilotSettings(
  next: CopilotStoredSettings,
  userId?: string
): Promise<void> {
  const sanitized = sanitizeStored(next)

  // 1. Write directly to PostgreSQL
  try {
    await upsertDbCopilotSettings(sanitized, userId)
  } catch (err) {
    console.error("[copilot] DB settings write failed:", err)
  }

  // 2. Best-effort fallback write to disk (never fatal on EACCES)
  try {
    const filePath = resolveSettingsPath()
    await ensureParent(filePath)
    await writeFile(filePath, `${JSON.stringify(sanitized, null, 2)}\n`, "utf8")
  } catch (err) {
    console.warn(
      "[copilot] Disk settings backup skipped (using PostgreSQL):",
      err instanceof Error ? err.message : err
    )
  }
}

export function getCopilotSettingsPath(): string {
  return resolveSettingsPath()
}

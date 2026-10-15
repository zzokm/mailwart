import "server-only"

import { getPool, initDatabase } from "./index"
import { getDefaultWebmailClient } from "@/lib/env"
import {
  DEFAULT_WEBMAIL_SETTINGS,
  WebmailSettings,
} from "@/lib/webmail/types"
import { sanitizeWebmailSettings } from "@/lib/webmail/settings"

export async function getUserWebmailSettings(
  userId?: string | null
): Promise<WebmailSettings> {
  const defaultClient = getDefaultWebmailClient()
  const fallback: WebmailSettings = {
    ...DEFAULT_WEBMAIL_SETTINGS,
    client: defaultClient,
  }

  if (!userId) return fallback

  await initDatabase()
  const pool = getPool()
  if (!pool) return fallback

  try {
    const res = await pool.query(
      "SELECT client, features, updated_at FROM user_webmail_settings WHERE user_id = $1 LIMIT 1",
      [userId]
    )

    if (res.rows.length === 0) {
      return fallback
    }

    const row = res.rows[0]
    const features = typeof row.features === "string" ? JSON.parse(row.features) : row.features || {}

    return sanitizeWebmailSettings({
      client: row.client || defaultClient,
      openInNewTab: features.openInNewTab ?? true,
      ravFeatures: features.ravFeatures,
      roundcubeFeatures: features.roundcubeFeatures,
      updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : undefined,
    })
  } catch (err) {
    console.warn(`[webmail-settings] failed to read settings for user ${userId}:`, err)
    return fallback
  }
}

export async function saveUserWebmailSettings(
  userId: string,
  settings: WebmailSettings
): Promise<WebmailSettings> {
  await initDatabase()
  const pool = getPool()
  if (!pool) throw new Error("Database unavailable")

  const sanitized = sanitizeWebmailSettings(settings)
  const featuresPayload = {
    openInNewTab: sanitized.openInNewTab,
    ravFeatures: sanitized.ravFeatures,
    roundcubeFeatures: sanitized.roundcubeFeatures,
  }

  await pool.query(
    `INSERT INTO user_webmail_settings (user_id, client, features, updated_at)
     VALUES ($1, $2, $3, NOW())
     ON CONFLICT (user_id) DO UPDATE
     SET client = EXCLUDED.client,
         features = EXCLUDED.features,
         updated_at = NOW()`,
    [userId, sanitized.client, JSON.stringify(featuresPayload)]
  )

  return {
    ...sanitized,
    updatedAt: new Date().toISOString(),
  }
}

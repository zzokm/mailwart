import "server-only"

import { getPool, initDatabase } from "./index"

export interface SystemEmailSenderConfig {
  mailboxEmail: string
  domain: string
  password?: string
  host: string
  port: number
  secure: boolean
  fromName?: string
  isNoreply?: boolean
  configuredAt?: string
}

export async function getSystemSetting<T>(key: string): Promise<T | null> {
  await initDatabase()
  const pool = getPool()
  if (!pool) return null

  try {
    const res = await pool.query(
      "SELECT value FROM system_settings WHERE key = $1 LIMIT 1",
      [key]
    )
    if (res.rows.length === 0) return null
    return res.rows[0].value as T
  } catch (err) {
    console.warn(`[system_settings] failed to get setting '${key}':`, err)
    return null
  }
}

export async function setSystemSetting<T>(key: string, value: T): Promise<void> {
  await initDatabase()
  const pool = getPool()
  if (!pool) throw new Error("Database unavailable")

  await pool.query(
    `INSERT INTO system_settings (key, value, updated_at)
     VALUES ($1, $2, NOW())
     ON CONFLICT (key) DO UPDATE
     SET value = EXCLUDED.value, updated_at = NOW()`,
    [key, JSON.stringify(value)]
  )
}

export async function getOutboundEmailConfig(): Promise<SystemEmailSenderConfig | null> {
  return getSystemSetting<SystemEmailSenderConfig>("outbound_email")
}

export async function saveOutboundEmailConfig(
  config: SystemEmailSenderConfig
): Promise<void> {
  await setSystemSetting<SystemEmailSenderConfig>("outbound_email", {
    ...config,
    configuredAt: new Date().toISOString(),
  })
}

export type EmailTemplateId = "macos_dark" | "nordic_dark"

export async function getEmailTemplateSetting(): Promise<EmailTemplateId> {
  const val = await getSystemSetting<string>("reset_password_template")
  return val === "nordic_dark" ? "nordic_dark" : "macos_dark"
}

export async function saveEmailTemplateSetting(template: EmailTemplateId): Promise<void> {
  await setSystemSetting<EmailTemplateId>("reset_password_template", template)
}

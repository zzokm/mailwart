import "server-only"
import { getPool } from "./index"

export interface QuotaWarningState {
  warning90SentAt: Date | null
  warning100SentAt: Date | null
  lastNotifiedUsageBytes: number | null
}

export interface QuotaWarningLogRecord {
  id: string
  mailboxEmail: string
  thresholdPercent: number
  usedBytes: number
  quotaBytes: number
  sentTo: string
  catchAllCopy: string | null
  status: string
  error: string | null
  createdAt: string
}

// In-memory fallback map for mock mode, testing, and offline database fallback
const inMemoryQuotaState = new Map<
  string,
  {
    warning90SentAt: Date | null
    warning100SentAt: Date | null
    lastNotifiedUsageBytes: number | null
  }
>()

const inMemoryQuotaLogs: QuotaWarningLogRecord[] = []

export async function getMailboxQuotaWarningStatus(
  email: string
): Promise<QuotaWarningState> {
  const norm = email.trim().toLowerCase()
  const pool = getPool()
  if (!pool) {
    return (
      inMemoryQuotaState.get(norm) ?? {
        warning90SentAt: null,
        warning100SentAt: null,
        lastNotifiedUsageBytes: null,
      }
    )
  }

  try {
    const res = await pool.query(
      `SELECT quota_warning_90_sent_at, quota_warning_100_sent_at, last_notified_usage_bytes
       FROM mailboxes
       WHERE LOWER(email) = $1
       LIMIT 1`,
      [norm]
    )
    if (res.rows.length === 0) {
      return (
        inMemoryQuotaState.get(norm) ?? {
          warning90SentAt: null,
          warning100SentAt: null,
          lastNotifiedUsageBytes: null,
        }
      )
    }
    const row = res.rows[0]
    return {
      warning90SentAt: row.quota_warning_90_sent_at
        ? new Date(row.quota_warning_90_sent_at)
        : null,
      warning100SentAt: row.quota_warning_100_sent_at
        ? new Date(row.quota_warning_100_sent_at)
        : null,
      lastNotifiedUsageBytes:
        row.last_notified_usage_bytes != null
          ? Number(row.last_notified_usage_bytes)
          : null,
    }
  } catch {
    return (
      inMemoryQuotaState.get(norm) ?? {
        warning90SentAt: null,
        warning100SentAt: null,
        lastNotifiedUsageBytes: null,
      }
    )
  }
}

export async function recordQuotaWarningSent(input: {
  email: string
  level: 90 | 100
  usedBytes: number
  quotaBytes: number
  sentTo: string
  catchAllCopy?: string | null
  status?: string
  error?: string
}): Promise<void> {
  const norm = input.email.trim().toLowerCase()
  const now = new Date()

  // Update in-memory fallback
  const curr = inMemoryQuotaState.get(norm) ?? {
    warning90SentAt: null,
    warning100SentAt: null,
    lastNotifiedUsageBytes: null,
  }
  if (input.level === 90) {
    curr.warning90SentAt = now
  } else {
    curr.warning100SentAt = now
  }
  curr.lastNotifiedUsageBytes = input.usedBytes
  inMemoryQuotaState.set(norm, curr)

  const logId = `qlog-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`
  const logRecord: QuotaWarningLogRecord = {
    id: logId,
    mailboxEmail: norm,
    thresholdPercent: input.level,
    usedBytes: input.usedBytes,
    quotaBytes: input.quotaBytes,
    sentTo: input.sentTo,
    catchAllCopy: input.catchAllCopy ?? null,
    status: input.status ?? "sent",
    error: input.error ?? null,
    createdAt: now.toISOString(),
  }
  inMemoryQuotaLogs.unshift(logRecord)

  const pool = getPool()
  if (!pool) return

  try {
    const colToUpdate =
      input.level === 90
        ? "quota_warning_90_sent_at = NOW()"
        : "quota_warning_100_sent_at = NOW()"

    await pool.query(
      `UPDATE mailboxes
       SET ${colToUpdate},
           last_notified_usage_bytes = $2,
           updated_at = NOW()
       WHERE LOWER(email) = $1`,
      [norm, input.usedBytes]
    )

    await pool.query(
      `INSERT INTO quota_warning_logs (id, mailbox_email, threshold_percent, used_bytes, quota_bytes, sent_to, catch_all_copy, status, error, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())`,
      [
        logId,
        norm,
        input.level,
        input.usedBytes,
        input.quotaBytes,
        input.sentTo,
        input.catchAllCopy ?? null,
        input.status ?? "sent",
        input.error ?? null,
      ]
    )
  } catch (err) {
    console.warn(`[postgres] recordQuotaWarningSent error for ${norm}:`, err)
  }
}

export async function resetQuotaWarningStatus(
  email: string,
  level: 90 | 100 | "all" = "all"
): Promise<void> {
  const norm = email.trim().toLowerCase()

  const curr = inMemoryQuotaState.get(norm)
  if (curr) {
    if (level === 90 || level === "all") curr.warning90SentAt = null
    if (level === 100 || level === "all") curr.warning100SentAt = null
    inMemoryQuotaState.set(norm, curr)
  }

  const pool = getPool()
  if (!pool) return

  try {
    let updateClause = ""
    if (level === 90) {
      updateClause = "quota_warning_90_sent_at = NULL"
    } else if (level === 100) {
      updateClause = "quota_warning_100_sent_at = NULL"
    } else {
      updateClause =
        "quota_warning_90_sent_at = NULL, quota_warning_100_sent_at = NULL"
    }

    await pool.query(
      `UPDATE mailboxes
       SET ${updateClause},
           updated_at = NOW()
       WHERE LOWER(email) = $1`,
      [norm]
    )
  } catch (err) {
    console.warn(`[postgres] resetQuotaWarningStatus error for ${norm}:`, err)
  }
}

export async function getRecentQuotaWarningLogs(
  limit = 50
): Promise<QuotaWarningLogRecord[]> {
  const pool = getPool()
  if (!pool) {
    return inMemoryQuotaLogs.slice(0, limit)
  }
  try {
    const res = await pool.query(
      `SELECT id, mailbox_email, threshold_percent, used_bytes, quota_bytes, sent_to, catch_all_copy, status, error, created_at
       FROM quota_warning_logs
       ORDER BY created_at DESC
       LIMIT $1`,
      [limit]
    )
    return res.rows.map((r) => ({
      id: r.id,
      mailboxEmail: r.mailbox_email,
      thresholdPercent: r.threshold_percent,
      usedBytes: Number(r.used_bytes),
      quotaBytes: Number(r.quota_bytes),
      sentTo: r.sent_to,
      catchAllCopy: r.catch_all_copy,
      status: r.status,
      error: r.error,
      createdAt: new Date(r.created_at).toISOString(),
    }))
  } catch {
    return inMemoryQuotaLogs.slice(0, limit)
  }
}

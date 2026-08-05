/**
 * Parse CSV quota cell into disk bytes.
 * Empty / "default" → null (server default).
 * Supports B, K/KB, M/MB, G/GB suffixes; bare number = bytes.
 */
export function parseQuotaCell(raw: string | undefined | null): {
  ok: true
  bytes: number | null
} | {
  ok: false
  error: string
} {
  if (raw == null) return { ok: true, bytes: null }
  const trimmed = raw.trim()
  if (!trimmed || /^default$/i.test(trimmed)) {
    return { ok: true, bytes: null }
  }

  const match = trimmed.match(
    /^([0-9]+(?:\.[0-9]+)?)\s*(b|k|kb|m|mb|g|gb)?$/i
  )
  if (!match) {
    return {
      ok: false,
      error: `Invalid quota "${raw}". Use e.g. 2G, 500M, or bytes.`,
    }
  }

  const n = Number(match[1])
  if (!Number.isFinite(n) || n < 0) {
    return { ok: false, error: `Invalid quota "${raw}".` }
  }

  const unit = (match[2] ?? "b").toLowerCase()
  const mult =
    unit === "g" || unit === "gb"
      ? 1024 ** 3
      : unit === "m" || unit === "mb"
        ? 1024 ** 2
        : unit === "k" || unit === "kb"
          ? 1024
          : 1

  return { ok: true, bytes: Math.round(n * mult) }
}

export function formatQuotaForCsv(bytes: number | null | undefined): string {
  if (bytes == null) return ""
  if (bytes === 0) return "0"
  if (bytes % 1024 ** 3 === 0) return `${bytes / 1024 ** 3}G`
  if (bytes % 1024 ** 2 === 0) return `${bytes / 1024 ** 2}M`
  if (bytes % 1024 === 0) return `${bytes / 1024}K`
  return String(bytes)
}

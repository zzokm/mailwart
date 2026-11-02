export function formatBytes(bytes: number | null | undefined): string {
  if (bytes == null || Number.isNaN(bytes)) return "-"
  if (bytes === 0) return "0 B"
  const units = ["B", "KB", "MB", "GB", "TB"]
  const i = Math.min(
    Math.floor(Math.log(bytes) / Math.log(1024)),
    units.length - 1
  )
  const value = bytes / 1024 ** i
  return `${value < 10 && i > 0 ? value.toFixed(1) : Math.round(value)} ${units[i]}`
}

export const DEFAULT_MAILBOX_QUOTA_BYTES: number | null = null // Infinite / Unmetered default

export const QUOTA_SCALE_STEP_BYTES = 0.25 * 1024 * 1024 * 1024 // 0.25 GB = 268,435,456 bytes

/**
 * For infinite storage mailboxes, scales the allocated capacity dynamically for overview display:
 * 0.25GB if <= 0.25GB, then 0.5GB, 0.75GB, 1GB, 1.25GB, and so on.
 */
export function scaleInfiniteMailboxQuota(usedBytes: number | null | undefined): number {
  const u = typeof usedBytes === "number" && usedBytes > 0 ? usedBytes : 0
  if (u <= QUOTA_SCALE_STEP_BYTES) {
    return QUOTA_SCALE_STEP_BYTES
  }
  return Math.ceil(u / QUOTA_SCALE_STEP_BYTES) * QUOTA_SCALE_STEP_BYTES
}

export function quotaSummary(
  quotas: Record<string, unknown> | undefined | null
): { label: string; bytes: number | null; used: number; isUnlimited: boolean } {
  const disk =
    quotas?.maxDiskQuota ??
    quotas?.diskQuota ??
    quotas?.disk ??
    quotas?.storage
  const usedRaw = quotas?.diskUsed ?? quotas?.used ?? quotas?.storageUsed
  const used = typeof usedRaw === "number" ? Math.max(0, usedRaw) : 0

  if (typeof disk === "number" && disk > 0) {
    return { label: formatBytes(disk), bytes: disk, used, isUnlimited: false }
  }
  return {
    label: "∞ Infinite",
    bytes: null,
    used,
    isUnlimited: true,
  }
}

/** Progress 0–100 for used/quota */
export function storageProgressPercent(
  used: number | null | undefined,
  quota: number | null | undefined
): number {
  const u = typeof used === "number" ? Math.max(0, used) : 0
  const q =
    typeof quota === "number" && quota > 0
      ? quota
      : scaleInfiniteMailboxQuota(u)
  return Math.min(100, Math.round((u / q) * 100))
}

export function generatePassword(length = 16): string {
  const alphabet =
    "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%"
  const bytes = new Uint8Array(length)
  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    crypto.getRandomValues(bytes)
  } else {
    for (let i = 0; i < length; i++) bytes[i] = Math.floor(Math.random() * 256)
  }
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("")
}

export function parseCsv(text: string): Array<{
  email: string
  password: string
  description?: string
}> {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
  if (lines.length === 0) return []

  const rows: Array<{ email: string; password: string; description?: string }> =
    []
  let start = 0
  const header = lines[0].toLowerCase()
  if (header.includes("email") && header.includes("password")) {
    start = 1
  }

  for (let i = start; i < lines.length; i++) {
    const cols = splitCsvLine(lines[i])
    const email = (cols[0] ?? "").trim()
    const password = (cols[1] ?? "").trim()
    const description = (cols[2] ?? "").trim() || undefined
    if (!email && !password) continue
    rows.push({ email, password, description })
  }
  return rows
}

function splitCsvLine(line: string): string[] {
  const out: string[] = []
  let cur = ""
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"'
        i++
      } else {
        inQuotes = !inQuotes
      }
      continue
    }
    if (ch === "," && !inQuotes) {
      out.push(cur)
      cur = ""
      continue
    }
    cur += ch
  }
  out.push(cur)
  return out
}

export function hostFromUrl(url: string): string {
  try {
    return new URL(url).host
  } catch {
    return url
  }
}

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

export function quotaSummary(
  quotas: Record<string, unknown> | undefined | null
): { label: string; bytes: number | null; used: number | null } {
  if (!quotas || Object.keys(quotas).length === 0) {
    return { label: "Default (server)", bytes: null, used: null }
  }
  const disk = quotas.diskQuota ?? quotas.disk ?? quotas.storage
  const usedRaw = quotas.diskUsed ?? quotas.used ?? quotas.storageUsed
  const used = typeof usedRaw === "number" ? usedRaw : null

  if (typeof disk === "number") {
    return { label: formatBytes(disk), bytes: disk, used }
  }
  if (typeof disk === "string" && disk.trim()) {
    return { label: disk, bytes: null, used }
  }
  return { label: "Custom", bytes: null, used }
}

/** Progress 0–100 for used/quota; null when either side is unknown. */
export function storageProgressPercent(
  used: number | null | undefined,
  quota: number | null | undefined
): number | null {
  if (used == null || quota == null || quota <= 0) return null
  return Math.min(100, Math.round((used / quota) * 100))
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

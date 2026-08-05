/** Split a single CSV line respecting quotes. */
export function splitCsvLine(line: string): string[] {
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

export function parseCsvRecords(
  text: string
): { headers: string[]; rows: string[][] } {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)

  if (lines.length === 0) {
    return { headers: [], rows: [] }
  }

  const first = splitCsvLine(lines[0]).map((h) => h.trim().toLowerCase())
  const looksLikeHeader = first.some((h) =>
    /^(email|password|description|quota|source|targets|keep_local|enabled)$/.test(
      h
    )
  )

  if (looksLikeHeader) {
    return {
      headers: first,
      rows: lines.slice(1).map((line) => splitCsvLine(line)),
    }
  }

  return { headers: [], rows: lines.map((line) => splitCsvLine(line)) }
}

export function recordsToObjects(
  headers: string[],
  rows: string[][]
): Array<Record<string, string>> {
  if (headers.length === 0) return []
  return rows.map((cols) => {
    const obj: Record<string, string> = {}
    headers.forEach((h, i) => {
      obj[h] = (cols[i] ?? "").trim()
    })
    return obj
  })
}

/** Max upload size 2 MB / 5 000 rows per ARCHITECTURE §9. */
export const BULK_MAX_BYTES = 2 * 1024 * 1024
export const BULK_MAX_ROWS = 5_000
export const BULK_CHUNK_SIZE = 25

export function assertCsvLimits(text: string, rowCount: number): void {
  const bytes = new TextEncoder().encode(text).length
  if (bytes > BULK_MAX_BYTES) {
    throw new Error(
      `CSV exceeds ${BULK_MAX_BYTES / (1024 * 1024)} MB limit (${(bytes / (1024 * 1024)).toFixed(2)} MB).`
    )
  }
  if (rowCount > BULK_MAX_ROWS) {
    throw new Error(`CSV exceeds ${BULK_MAX_ROWS} row limit (${rowCount} rows).`)
  }
}

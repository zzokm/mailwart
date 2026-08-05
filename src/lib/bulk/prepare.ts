import {
  assertCsvLimits,
  parseCsvRecords,
  recordsToObjects,
} from "./parse"
import {
  forwardingCsvRowSchema,
  mailboxCsvRowSchema,
  zodIssuesMessage,
} from "./schemas"

const MAILBOX_COLS = ["email", "password", "description", "quota"] as const
const FORWARD_COLS = ["source", "targets", "keep_local", "enabled"] as const

function positionalObjects(
  rows: string[][],
  cols: readonly string[]
): Array<Record<string, string>> {
  return rows.map((cells) => {
    const obj: Record<string, string> = {}
    cols.forEach((c, i) => {
      obj[c] = (cells[i] ?? "").trim()
    })
    return obj
  })
}

export function parseMailboxCsvText(csvText: string): {
  valid: Array<{
    email: string
    password: string
    description: string
    quotaBytes: number | null
  }>
  failed: Array<{
    email: string
    password: string
    description?: string
    reason: string
  }>
} {
  const { headers, rows } = parseCsvRecords(csvText)
  assertCsvLimits(csvText, rows.length)

  const objects =
    headers.length > 0
      ? recordsToObjects(headers, rows).map((o) => ({
          email: o.email ?? "",
          password: o.password ?? "",
          description: o.description ?? "",
          quota: o.quota ?? "",
        }))
      : positionalObjects(rows, MAILBOX_COLS).map((o) => ({
          email: o.email,
          password: o.password,
          description: o.description,
          quota: o.quota,
        }))

  if (objects.length === 0) {
    throw new Error(
      "CSV is empty. Expected columns: email,password,description,quota."
    )
  }

  const valid: Array<{
    email: string
    password: string
    description: string
    quotaBytes: number | null
  }> = []
  const failed: Array<{
    email: string
    password: string
    description?: string
    reason: string
  }> = []

  for (const obj of objects) {
    const parsed = mailboxCsvRowSchema.safeParse(obj)
    if (!parsed.success) {
      failed.push({
        email: obj.email || "(blank)",
        password: obj.password ?? "",
        description: obj.description,
        reason: zodIssuesMessage(parsed.error),
      })
      continue
    }
    valid.push({
      email: parsed.data.email.trim().toLowerCase(),
      password: parsed.data.password,
      description: parsed.data.description?.trim() || "",
      quotaBytes: parsed.data.quota,
    })
  }

  return { valid, failed }
}

export function parseForwardingCsvText(csvText: string): {
  valid: Array<{
    source: string
    targets: string[]
    keepLocalCopy: boolean
    enabled: boolean
  }>
  failed: Array<{ source: string; reason: string }>
} {
  const { headers, rows } = parseCsvRecords(csvText)
  assertCsvLimits(csvText, rows.length)

  const objects =
    headers.length > 0
      ? recordsToObjects(headers, rows).map((o) => ({
          source: o.source ?? "",
          targets: o.targets ?? "",
          keep_local: o.keep_local ?? "",
          enabled: o.enabled ?? "",
        }))
      : positionalObjects(rows, FORWARD_COLS)

  if (objects.length === 0) {
    throw new Error(
      "CSV is empty. Expected columns: source,targets,keep_local,enabled."
    )
  }

  const valid: Array<{
    source: string
    targets: string[]
    keepLocalCopy: boolean
    enabled: boolean
  }> = []
  const failed: Array<{ source: string; reason: string }> = []

  for (const obj of objects) {
    const parsed = forwardingCsvRowSchema.safeParse(obj)
    if (!parsed.success) {
      failed.push({
        source: obj.source || "(blank)",
        reason: zodIssuesMessage(parsed.error),
      })
      continue
    }
    valid.push({
      source: parsed.data.source.trim().toLowerCase(),
      targets: parsed.data.targets,
      keepLocalCopy: parsed.data.keep_local,
      enabled: parsed.data.enabled,
    })
  }

  return { valid, failed }
}

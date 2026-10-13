import { StalwartError } from "./errors"

/**
 * Turn Stalwart / JMAP / Zod / network failures into a single operator-facing string.
 * Prefer typed SetError fields (type + description) over raw JSON dumps.
 */
export function parseActionError(error: unknown): {
  message: string
  code:
    | "config"
    | "auth"
    | "timeout"
    | "transport"
    | "jmap"
    | "not_found"
    | "validation"
    | "unknown"
} {
  if (error instanceof StalwartError) {
    return {
      message: enrichStalwartMessage(error),
      code: error.code,
    }
  }

  if (error && typeof error === "object" && "issues" in error) {
    // ZodError-shaped
    const issues = (error as { issues?: Array<{ message?: string }> }).issues
    if (Array.isArray(issues) && issues.length > 0) {
      return {
        message: issues.map((i) => i.message ?? "Invalid input.").join("; "),
        code: "validation",
      }
    }
  }

  if (error instanceof Error) {
    return { message: error.message || "Unexpected error.", code: "unknown" }
  }

  if (typeof error === "string" && error.trim()) {
    return { message: error, code: "unknown" }
  }

  return { message: "Unexpected error.", code: "unknown" }
}

function enrichStalwartMessage(error: StalwartError): string {
  const base = error.message?.trim() || "Stalwart rejected the change."
  const fromDetails = describeJmapDetails(error.details)

  if (
    base.toLowerCase().includes("objectislinked") ||
    fromDetails?.toLowerCase().includes("objectislinked")
  ) {
    return "Cannot delete domain: mailboxes, aliases, or DKIM keys are still linked in Stalwart. Enable 'Force destroy' to clear them automatically or remove mailboxes first."
  }

  if (!fromDetails) return base
  // Avoid duplicating when formatSetFailure already inlined type:description.
  if (base.includes(fromDetails)) return base
  if (fromDetails === base) return base
  return `${base} (${fromDetails})`
}

/** Extract readable type/description from JMAP error / SetError payloads. */
export function describeJmapDetails(details: unknown): string | null {
  if (details == null) return null

  if (typeof details === "string") {
    const t = details.trim()
    return t || null
  }

  if (typeof details !== "object") return null

  const obj = details as Record<string, unknown>

  // Single SetError / method error
  const type = typeof obj.type === "string" ? obj.type : null
  const description =
    typeof obj.description === "string" ? obj.description : null
  if (type || description) {
    return [type, description].filter(Boolean).join(": ")
  }

  // Map of id → SetError (notCreated / notUpdated / notDestroyed)
  const entries = Object.entries(obj)
  if (entries.length === 0) return null
  const messages: string[] = []
  for (const [id, val] of entries) {
    if (!val || typeof val !== "object") continue
    const e = val as Record<string, unknown>
    const t = typeof e.type === "string" ? e.type : null
    const d = typeof e.description === "string" ? e.description : null
    const part = [t, d].filter(Boolean).join(": ")
    if (part) messages.push(`${id}: ${part}`)
  }
  return messages.length > 0 ? messages.join("; ") : null
}

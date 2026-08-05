/**
 * Strip secrets from tool results before they reach the model / UI stream.
 * Architecture §16.4 — no env secrets, passwords, DKIM private keys, app secrets.
 */

const SECRET_KEY =
  /^(password|secret|api[_-]?key|token|private[_-]?key|private[_-]?key[_-]?pem|authorization|cookie|session)$/i

const SECRET_KEY_PARTIAL =
  /(password|secret|api[_-]?key|private[_-]?key|token)/i

const MAX_DEPTH = 12
const MAX_ARRAY = 200

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function redactString(key: string, value: string): string {
  if (SECRET_KEY.test(key) || SECRET_KEY_PARTIAL.test(key)) {
    return "[redacted]"
  }
  // PEM private blocks
  if (
    value.includes("BEGIN PRIVATE KEY") ||
    value.includes("BEGIN RSA PRIVATE KEY")
  ) {
    return "[redacted-private-key]"
  }
  return value
}

function walk(value: unknown, depth: number): unknown {
  if (depth > MAX_DEPTH) return "[truncated]"
  if (value == null) return value
  if (typeof value === "string") {
    if (
      value.includes("BEGIN PRIVATE KEY") ||
      value.includes("BEGIN RSA PRIVATE KEY")
    ) {
      return "[redacted-private-key]"
    }
    return value
  }
  if (typeof value !== "object") return value

  if (Array.isArray(value)) {
    const sliced = value.slice(0, MAX_ARRAY)
    const mapped = sliced.map((item) => walk(item, depth + 1))
    if (value.length > MAX_ARRAY) {
      mapped.push({ _truncated: `+${value.length - MAX_ARRAY} more` })
    }
    return mapped
  }

  if (!isPlainObject(value)) return String(value)

  const out: Record<string, unknown> = {}
  for (const [key, raw] of Object.entries(value)) {
    if (SECRET_KEY.test(key) || SECRET_KEY_PARTIAL.test(key)) {
      // Keep metadata objects that are not the secret itself (e.g. AppPassword record)
      if (
        isPlainObject(raw) &&
        !("secret" in raw) &&
        key.toLowerCase() === "password" &&
        ("id" in raw || "description" in raw)
      ) {
        out[key] = walk(raw, depth + 1)
        continue
      }
      out[key] = typeof raw === "string" ? redactString(key, raw) : "[redacted]"
      continue
    }
    out[key] = walk(raw, depth + 1)
  }
  return out
}

/** Deep-clone and redact sensitive fields from any tool payload. */
export function sanitizeToolPayload(value: unknown): unknown {
  try {
    return walk(value, 0)
  } catch {
    return { ok: false, error: "Failed to sanitize tool result." }
  }
}

/**
 * Normalize ActionResult-shaped values and sanitize.
 * Passwords that were set successfully become a boolean note.
 */
export function sanitizeToolResult(value: unknown): unknown {
  const cleaned = sanitizeToolPayload(value)

  if (!isPlainObject(cleaned)) return cleaned

  // createAppPassword success shape after redaction
  if (
    cleaned.ok === true &&
    isPlainObject(cleaned.data) &&
    ("secret" in cleaned.data || cleaned.data.secret === "[redacted]")
  ) {
    const data = { ...cleaned.data }
    delete data.secret
    return {
      ...cleaned,
      data: {
        ...data,
        secretReturned: false,
        note: "App password created. Copy the secret once from the mailbox UI — it is not shown in Copilot.",
      },
    }
  }

  // DKIM generate — public DNS only
  if (
    cleaned.ok === true &&
    isPlainObject(cleaned.data) &&
    ("privateKeyPem" in cleaned.data ||
      cleaned.data.privateKeyPem === "[redacted]" ||
      cleaned.data.privateKeyPem === "[redacted-private-key]")
  ) {
    const data = { ...cleaned.data }
    delete data.privateKeyPem
    delete data.publicKeyPem
    return {
      ...cleaned,
      data: {
        ...data,
        note: "DKIM DNS record generated. Private key is only available in the Domains UI — not streamed to Copilot.",
      },
    }
  }

  return cleaned
}

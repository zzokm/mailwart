export class StalwartError extends Error {
  constructor(
    message: string,
    public readonly code:
      | "config"
      | "auth"
      | "timeout"
      | "transport"
      | "jmap"
      | "not_found"
      | "validation",
    public readonly details?: unknown
  ) {
    super(message)
    this.name = "StalwartError"
  }
}

export function mapHttpError(status: number, body: string): StalwartError {
  if (status === 401 || status === 403) {
    return new StalwartError(
      "Mail server rejected admin credentials. Check STALWART_ADMIN_* env.",
      "auth",
      { status, body: body.slice(0, 500) }
    )
  }
  if (status >= 500) {
    return new StalwartError(
      `Stalwart returned HTTP ${status}. Retry.`,
      "transport",
      { status, body: body.slice(0, 500) }
    )
  }
  return new StalwartError(`Stalwart HTTP ${status}.`, "transport", {
    status,
    body: body.slice(0, 500),
  })
}

export function formatSetFailure(
  map: Record<string, { type?: string; description?: string }> | undefined,
  id: string
): string {
  const err = map?.[id]
  if (!err) return "Stalwart rejected the change."
  const parts = [err.type, err.description].filter(Boolean)
  return parts.join(": ") || "Stalwart rejected the change."
}

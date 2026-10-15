/** Client-safe mailwart Webmail SSO entry point. */
export function buildWebmailUrl(
  email?: string,
  client?: "rav" | "roundcube"
): string {
  const params = new URLSearchParams()
  if (email) params.set("email", email)
  if (client) params.set("client", client)
  const qs = params.toString()
  return qs ? `/api/webmail/sso?${qs}` : "/api/webmail/sso"
}

/** Legacy alias for backwards compatibility with Roundcube buttons. */
export function buildRoundcubeUrl(email?: string): string {
  return buildWebmailUrl(email)
}

/** Explicit Rav webmail launcher. */
export function buildRavUrl(email?: string): string {
  return buildWebmailUrl(email, "rav")
}

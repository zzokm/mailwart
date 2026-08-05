/** Client-safe Roundcube deep-link helper (no server env). */
export function buildRoundcubeUrl(
  email?: string,
  base = "https://mail.zokm.me"
): string {
  const normalized = base.replace(/\/$/, "")
  if (!email) return `${normalized}/`
  const url = new URL(normalized)
  url.searchParams.set("_user", email)
  return url.toString()
}

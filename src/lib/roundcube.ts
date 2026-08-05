import { getRoundcubeUrl } from "@/lib/env"

/**
 * Roundcube deep-link builder only — no SSO, no password in URL.
 * Prefill `_user` is best-effort; Roundcube may ignore the query.
 */
export function buildRoundcubeUrl(email?: string): string {
  const base = getRoundcubeUrl().replace(/\/$/, "")
  if (!email) return `${base}/`
  const url = new URL(base)
  url.searchParams.set("_user", email)
  return url.toString()
}

export function roundcubeHostLabel(): string {
  try {
    return new URL(getRoundcubeUrl()).host
  } catch {
    return "mail.zokm.me"
  }
}

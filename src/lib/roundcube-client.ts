/** Client-safe mailwart SSO entry point. */
export function buildRoundcubeUrl(email?: string): string {
  if (!email) return "/webmail/"
  return `/api/webmail/sso?email=${encodeURIComponent(email)}`
}

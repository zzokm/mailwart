import { getRoundcubeUrl } from "@/lib/env"

export function buildRoundcubeUrl(email?: string): string {
  if (!email) return `${getRoundcubeUrl().replace(/\/$/, "")}/`
  return `/api/webmail/sso?email=${encodeURIComponent(email)}`
}

export function roundcubeHostLabel(): string {
  try {
    return new URL(getRoundcubeUrl()).host
  } catch {
    return "email.yehia.dev"
  }
}

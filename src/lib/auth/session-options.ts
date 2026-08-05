import type { SessionOptions } from "iron-session"

/** Build-safe fallback so middleware/session code can load without env. Never use in production login. */
const DEV_FALLBACK_SECRET =
  "email-manager-dev-session-secret-min-32-chars"

export const SESSION_COOKIE_NAME = "em_session"

/** Session TTL: 8 hours. */
export const SESSION_TTL_SECONDS = 60 * 60 * 8

export type SessionData = {
  role?: "admin"
  /** APP_ADMIN_USER at login — used for audit attribution. */
  username?: string
  exp?: number
}

export function getSessionPassword(): string {
  const secret = process.env.SESSION_SECRET
  if (secret && secret.length >= 32) return secret
  return DEV_FALLBACK_SECRET
}

export function getSessionOptions(): SessionOptions {
  return {
    cookieName: SESSION_COOKIE_NAME,
    password: getSessionPassword(),
    ttl: SESSION_TTL_SECONDS,
    cookieOptions: {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
    },
  }
}

export function isSessionValid(session: SessionData): boolean {
  if (session.role !== "admin") return false
  if (typeof session.exp === "number" && Date.now() > session.exp) return false
  return true
}

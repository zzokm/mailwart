import "server-only"

import { cookies } from "next/headers"
import { getIronSession, type IronSession } from "iron-session"

import {
  getSessionOptions,
  isSessionValid,
  SESSION_TTL_SECONDS,
  type SessionData,
} from "@/lib/auth/session-options"

export type { SessionData }

export async function getSession(): Promise<IronSession<SessionData>> {
  return getIronSession<SessionData>(await cookies(), getSessionOptions())
}

export async function isAuthenticated(): Promise<boolean> {
  const session = await getSession()
  return isSessionValid(session)
}

/** Throws if there is no valid admin session. */
export async function requireSession(): Promise<IronSession<SessionData>> {
  const session = await getSession()
  if (!isSessionValid(session)) {
    throw new AuthError("Unauthorized")
  }
  return session
}

export class AuthError extends Error {
  constructor(message = "Unauthorized") {
    super(message)
    this.name = "AuthError"
  }
}

export async function createAdminSession(username?: string): Promise<void> {
  const session = await getSession()
  session.role = "admin"
  if (username?.trim()) session.username = username.trim()
  session.exp = Date.now() + SESSION_TTL_SECONDS * 1000
  await session.save()
}

/** Operator label for audit rows; falls back when session predates username field. */
export async function sessionActor(): Promise<string> {
  try {
    const session = await getSession()
    if (session.username?.trim()) return session.username.trim()
  } catch {
    /* ignore */
  }
  return process.env.APP_ADMIN_USER?.trim() || "admin"
}

export async function destroySession(): Promise<void> {
  const session = await getSession()
  session.destroy()
}

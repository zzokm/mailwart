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

export async function createAdminSession(): Promise<void> {
  const session = await getSession()
  session.role = "admin"
  session.exp = Date.now() + SESSION_TTL_SECONDS * 1000
  await session.save()
}

export async function destroySession(): Promise<void> {
  const session = await getSession()
  session.destroy()
}

"use server"

import { headers } from "next/headers"
import { redirect } from "next/navigation"

import { recordAudit } from "@/lib/audit"
import {
  getAuthConfigError,
  verifyAppAdminCredentials,
} from "@/lib/auth/credentials"
import {
  clearLoginFailures,
  clientIpFromHeaders,
  getLoginRateLimitStatus,
  recordFailedLogin,
} from "@/lib/auth/rate-limit"
import {
  createUserSession,
  destroySession,
  isAuthenticated,
  sessionActor,
} from "@/lib/auth/session"
import {
  ensureAdminUser,
  findUserByUsernameOrEmail,
  verifyPassword,
} from "@/lib/db/users"
import { loginSchema } from "@/lib/validations/auth"
import { zodIssuesMessage } from "@/lib/validations/common"

export type LoginActionResult =
  | { ok: true }
  | { ok: false; error: string; code?: "validation" | "auth" | "rate_limit" | "config" }

export async function loginAction(input: {
  username: string
  password: string
}): Promise<LoginActionResult> {
  const hdrs = await headers()
  const ip = clientIpFromHeaders(hdrs)

  const rate = getLoginRateLimitStatus(ip)
  if (rate.limited) {
    return {
      ok: false,
      error: `Too many login attempts. Try again in ${rate.retryAfterSec}s.`,
      code: "rate_limit",
    }
  }

  const configError = getAuthConfigError()
  if (configError) {
    return { ok: false, error: configError, code: "config" }
  }

  const parsed = loginSchema.safeParse(input)
  if (!parsed.success) {
    recordFailedLogin(ip)
    return {
      ok: false,
      error: zodIssuesMessage(parsed.error),
      code: "validation",
    }
  }

  const { username, password } = parsed.data

  // Ensure admin user exists in DB
  await ensureAdminUser().catch((err) => {
    console.error("[auth] failed to ensure admin user:", err)
  })

  // 1. Look up user in PostgreSQL by username or email
  const dbUser = await findUserByUsernameOrEmail(username).catch(() => null)

  let sessionUser: {
    id: string
    username: string
    email: string
    role: "admin" | "user"
  } | null = null

  if (dbUser && verifyPassword(password, dbUser.passwordHash, dbUser.salt)) {
    sessionUser = {
      id: dbUser.id,
      username: dbUser.username,
      email: dbUser.email,
      role: dbUser.role === "admin" ? "admin" : "user",
    }
  }

  // 2. Fallback check against environment admin credentials
  if (!sessionUser) {
    const adminUser = process.env.APP_ADMIN_USER?.trim() || "yehia"
    if (
      (username.toLowerCase() === adminUser.toLowerCase() ||
        username.toLowerCase() === "yehia" ||
        username.toLowerCase() === "admin") &&
      verifyAppAdminCredentials(username, password)
    ) {
      // Re-seed admin user and authenticate
      const admin = await ensureAdminUser()
      if (admin) {
        sessionUser = {
          id: admin.id,
          username: admin.username,
          email: admin.email,
          role: "admin",
        }
      }
    }
  }

  if (!sessionUser) {
    recordFailedLogin(ip)
    return { ok: false, error: "Invalid username or password.", code: "auth" }
  }

  clearLoginFailures(ip)
  await createUserSession(sessionUser)
  await recordAudit({
    actor: sessionUser.username,
    action: "login",
    detail: `Dashboard session started (${sessionUser.role})`,
  })
  return { ok: true }
}

export async function logoutAction(): Promise<void> {
  const actor = await sessionActor()
  await recordAudit({
    actor,
    action: "logout",
    detail: "Dashboard session ended",
  })
  await destroySession()
  redirect("/login")
}

export async function redirectIfAuthenticated(): Promise<void> {
  if (await isAuthenticated()) {
    redirect("/dashboard")
  }
}

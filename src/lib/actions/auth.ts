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
  createAdminSession,
  destroySession,
  isAuthenticated,
  sessionActor,
} from "@/lib/auth/session"

export type LoginActionResult =
  | { ok: true }
  | { ok: false; error: string }

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
    }
  }

  const configError = getAuthConfigError()
  if (configError) {
    return { ok: false, error: configError }
  }

  const username = input.username.trim()
  const password = input.password

  if (!username || !password) {
    recordFailedLogin(ip)
    return { ok: false, error: "Username and password are required." }
  }

  if (!verifyAppAdminCredentials(username, password)) {
    recordFailedLogin(ip)
    return { ok: false, error: "Invalid username or password." }
  }

  clearLoginFailures(ip)
  await createAdminSession(username)
  await recordAudit({
    actor: username,
    action: "login",
    detail: "Dashboard session started",
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

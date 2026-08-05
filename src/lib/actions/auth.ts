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

  if (!verifyAppAdminCredentials(username, password)) {
    recordFailedLogin(ip)
    return { ok: false, error: "Invalid username or password.", code: "auth" }
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

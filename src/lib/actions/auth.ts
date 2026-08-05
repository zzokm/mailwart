"use server"

import { headers } from "next/headers"
import { redirect } from "next/navigation"

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
  await createAdminSession()
  return { ok: true }
}

export async function logoutAction(): Promise<void> {
  await destroySession()
  redirect("/login")
}

export async function redirectIfAuthenticated(): Promise<void> {
  if (await isAuthenticated()) {
    redirect("/dashboard")
  }
}

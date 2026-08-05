import "server-only"

import { timingSafeEqual } from "crypto"

function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a)
  const bufB = Buffer.from(b)
  if (bufA.length !== bufB.length) {
    // Compare equal-length buffers to keep timing closer to a real check.
    timingSafeEqual(bufA, bufA)
    return false
  }
  return timingSafeEqual(bufA, bufB)
}

export function getAuthConfigError(): string | null {
  const user = process.env.APP_ADMIN_USER
  const password = process.env.APP_ADMIN_PASSWORD
  const secret = process.env.SESSION_SECRET

  if (!user || !password) {
    return "App admin credentials are not configured (APP_ADMIN_USER / APP_ADMIN_PASSWORD)."
  }
  if (!secret || secret.length < 32) {
    return "SESSION_SECRET must be set to at least 32 characters."
  }
  return null
}

export function verifyAppAdminCredentials(
  username: string,
  password: string
): boolean {
  const expectedUser = process.env.APP_ADMIN_USER ?? ""
  const expectedPass = process.env.APP_ADMIN_PASSWORD ?? ""
  if (!expectedUser || !expectedPass) return false

  const userOk = safeEqual(username, expectedUser)
  const passOk = safeEqual(password, expectedPass)
  return userOk && passOk
}

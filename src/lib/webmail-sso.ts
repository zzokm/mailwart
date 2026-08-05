import "server-only"

import { createHmac, randomUUID } from "node:crypto"

const TOKEN_TTL_SECONDS = 30

function base64url(value: string | Buffer): string {
  return Buffer.from(value).toString("base64url")
}

export function createWebmailSsoToken(email: string): string {
  const secret = process.env.WEBMAIL_SSO_SECRET
  if (!secret || secret.length < 32) {
    throw new Error("WEBMAIL_SSO_SECRET must be at least 32 characters.")
  }

  const payload = base64url(
    JSON.stringify({
      email: email.trim().toLowerCase(),
      exp: Math.floor(Date.now() / 1000) + TOKEN_TTL_SECONDS,
      nonce: randomUUID(),
    })
  )
  const signature = createHmac("sha256", secret)
    .update(payload)
    .digest("base64url")

  return `${payload}.${signature}`
}

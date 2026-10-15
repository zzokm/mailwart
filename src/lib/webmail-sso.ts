import "server-only"

import { createHmac, randomUUID, timingSafeEqual } from "node:crypto"

const TOKEN_TTL_SECONDS = 60

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

export function verifyWebmailSsoToken(token: string): { email: string } | null {
  const secret = process.env.WEBMAIL_SSO_SECRET
  if (!secret || secret.length < 32) return null

  const parts = token.split(".")
  if (parts.length !== 2) return null
  const [payloadB64, signature] = parts

  try {
    const expectedSig = createHmac("sha256", secret)
      .update(payloadB64)
      .digest("base64url")

    const sigBuf = Buffer.from(signature)
    const expectedBuf = Buffer.from(expectedSig)

    if (sigBuf.length !== expectedBuf.length || !timingSafeEqual(sigBuf, expectedBuf)) {
      return null
    }

    const json = JSON.parse(Buffer.from(payloadB64, "base64url").toString("utf8"))
    if (typeof json !== "object" || !json) return null

    if (typeof json.exp !== "number" || json.exp < Math.floor(Date.now() / 1000)) {
      return null
    }

    if (typeof json.email !== "string" || !json.email.includes("@")) {
      return null
    }

    return { email: json.email.trim().toLowerCase() }
  } catch {
    return null
  }
}


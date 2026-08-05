import type { AppPassword, TwoFactorStatus } from "./types"

/**
 * Probe Account credentials for app passwords + 2FA.
 * Supports dict and array shapes; never invents unknown fields.
 */
export function probeAccountCredentials(credentials: unknown): {
  appPasswords: AppPassword[]
  twoFactor: TwoFactorStatus
  /** True when credentials were present and parseable enough to list. */
  credentialsPresent: boolean
} {
  if (credentials == null) {
    return {
      appPasswords: [],
      twoFactor: {
        state: "unknown",
        note: "TODO: Account credentials not returned by live Account/get — confirm property after probe.",
      },
      credentialsPresent: false,
    }
  }

  const entries = normalizeCredentialEntries(credentials)
  if (entries.length === 0) {
    return {
      appPasswords: [],
      twoFactor: { state: "disabled" },
      credentialsPresent: true,
    }
  }

  const appPasswords: AppPassword[] = []
  let otpSeen = false
  let passwordSeen = false

  for (const { id, value } of entries) {
    const type = String(value["@type"] ?? value.type ?? "").toLowerCase()
    if (type === "apppassword" || type === "app_password") {
      appPasswords.push({
        id,
        description:
          typeof value.description === "string" && value.description.trim()
            ? value.description
            : id,
        createdAt:
          typeof value.createdAt === "string" ? value.createdAt : undefined,
        expiresAt:
          value.expiresAt == null
            ? null
            : typeof value.expiresAt === "string"
              ? value.expiresAt
              : null,
      })
      continue
    }

    if (type === "password" || type === "accountpassword" || !type) {
      passwordSeen = true
      if (hasOtpAuth(value)) otpSeen = true
    }

    if (type === "otpauth" || type === "otp") {
      otpSeen = true
    }
  }

  const twoFactor: TwoFactorStatus = otpSeen
    ? { state: "enabled" }
    : passwordSeen
      ? { state: "disabled" }
      : {
          state: "unknown",
          note: "TODO: Could not classify Password/OtpAuth credential shape from live probe.",
        }

  return { appPasswords, twoFactor, credentialsPresent: true }
}

function hasOtpAuth(value: Record<string, unknown>): boolean {
  const otp = value.otpAuth ?? value.otpUrl ?? value.otp
  if (otp == null || otp === false || otp === "") return false
  if (typeof otp === "string") return otp.trim().length > 0
  if (typeof otp === "object") return Object.keys(otp as object).length > 0
  return true
}

function normalizeCredentialEntries(
  credentials: unknown
): Array<{ id: string; value: Record<string, unknown> }> {
  if (Array.isArray(credentials)) {
    return credentials
      .map((item, idx) => {
        if (!item || typeof item !== "object") return null
        const value = item as Record<string, unknown>
        const id =
          typeof value.id === "string"
            ? value.id
            : typeof value.name === "string"
              ? value.name
              : String(idx)
        return { id, value }
      })
      .filter((x): x is { id: string; value: Record<string, unknown> } => !!x)
  }

  if (typeof credentials === "object") {
    return Object.entries(credentials as Record<string, unknown>)
      .map(([id, item]) => {
        if (!item || typeof item !== "object") return null
        return { id, value: item as Record<string, unknown> }
      })
      .filter((x): x is { id: string; value: Record<string, unknown> } => !!x)
  }

  return []
}

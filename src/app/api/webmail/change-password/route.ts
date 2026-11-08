import { NextRequest, NextResponse } from "next/server"

import { recordAudit } from "@/lib/audit"
import { getStalwartConfig, getStalwartImapHost, getStalwartSmtpHost } from "@/lib/env"
import { queryAccounts, updateAccountPassword } from "@/lib/stalwart/accounts"

export const runtime = "nodejs"

// Strongest password criteria:
// - Min 14 characters
// - At least 1 uppercase letter
// - At least 1 lowercase letter
// - At least 1 numeric digit
// - At least 1 special character
// - Cannot contain email username (local part >= 3 chars)
// - Must match confirmation
// - Must be different from current password
export function validateStrongPassword(
  newPass: string,
  currentPass: string,
  email: string
): { valid: boolean; error?: string } {
  if (!newPass || typeof newPass !== "string") {
    return { valid: false, error: "New password is required." }
  }

  if (newPass.length < 14) {
    return { valid: false, error: "Password must be at least 14 characters long." }
  }

  if (!/[A-Z]/.test(newPass)) {
    return { valid: false, error: "Password must contain at least one uppercase letter (A-Z)." }
  }

  if (!/[a-z]/.test(newPass)) {
    return { valid: false, error: "Password must contain at least one lowercase letter (a-z)." }
  }

  if (!/[0-9]/.test(newPass)) {
    return { valid: false, error: "Password must contain at least one number (0-9)." }
  }

  if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?~`]/.test(newPass)) {
    return {
      valid: false,
      error: "Password must contain at least one special character (!@#$%^&*...)."
    }
  }

  const cleanEmail = email.split("%")[0].trim().toLowerCase()
  const localPart = cleanEmail.split("@")[0]
  if (localPart && localPart.length >= 3 && newPass.toLowerCase().includes(localPart)) {
    return { valid: false, error: "Password cannot contain your email username." }
  }

  if (currentPass && newPass === currentPass) {
    return { valid: false, error: "New password must be different from your current password." }
  }

  return { valid: true }
}

export async function POST(request: NextRequest) {
  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON request payload." }, { status: 400 })
  }

  const emailRaw = typeof body?.email === "string" ? body.email.trim() : ""
  const currentPassword = typeof body?.currentPassword === "string" ? body.currentPassword : ""
  const newPassword = typeof body?.newPassword === "string" ? body.newPassword : ""
  const confirmPassword = typeof body?.confirmPassword === "string" ? body.confirmPassword : ""

  if (!emailRaw || !emailRaw.includes("@")) {
    return NextResponse.json({ error: "A valid mailbox email is required." }, { status: 400 })
  }

  if (!currentPassword) {
    return NextResponse.json({ error: "Current password is required." }, { status: 400 })
  }

  if (!newPassword) {
    return NextResponse.json({ error: "New password is required." }, { status: 400 })
  }

  if (newPassword !== confirmPassword) {
    return NextResponse.json({ error: "New password and confirmation do not match." }, { status: 400 })
  }

  const cleanEmail = emailRaw.split("%")[0].trim().toLowerCase()

  // Validate strong password rules
  const validation = validateStrongPassword(newPassword, currentPassword, cleanEmail)
  if (!validation.valid) {
    return NextResponse.json({ error: validation.error }, { status: 400 })
  }

  const config = getStalwartConfig()
  if (!config) {
    return NextResponse.json(
      { error: "Stalwart mail server credentials not configured." },
      { status: 503 }
    )
  }

  // Verify current password against Stalwart
  let verified = false

  // 1. If admin password provided (e.g. admin acting in SSO session), allow verification
  if (config.adminPassword && currentPassword === config.adminPassword) {
    verified = true
  }

  // 2. Test login via internal Rav endpoint
  if (!verified) {
    const ravInternalUrl =
      process.env.RAV_INTERNAL_URL?.trim() || "http://email-manager-rav:3001"
    const clusterImapHost = getStalwartImapHost()
    const clusterSmtpHost = getStalwartSmtpHost()

    try {
      const authRes = await fetch(`${ravInternalUrl}/api/auth/login`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Requested-With": "XMLHttpRequest",
        },
        body: JSON.stringify({
          email: cleanEmail,
          password: currentPassword,
          imap_host: clusterImapHost,
          imap_port: 993,
          smtp_host: clusterSmtpHost,
          smtp_port: 587,
        }),
      })

      if (authRes.ok) {
        verified = true
      }
    } catch (err) {
      console.warn("[change-password] Internal Rav auth check failed:", err)
    }
  }

  // 3. Fallback direct JMAP Basic auth verification against Stalwart
  if (!verified) {
    try {
      const jmapUrl =
        process.env.STALWART_JMAP_URL?.trim() || "http://stalwart-mail:8080/jmap"
      const cred = Buffer.from(`${cleanEmail}:${currentPassword}`, "utf8").toString("base64")
      const jmapRes = await fetch(jmapUrl, {
        method: "POST",
        headers: {
          Authorization: `Basic ${cred}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          using: ["urn:ietf:params:jmap:core"],
          methodCalls: [["Core/echo", {}, "0"]],
        }),
      })

      if (jmapRes.ok || jmapRes.status === 200 || jmapRes.status === 204) {
        verified = true
      }
    } catch (err) {
      console.warn("[change-password] JMAP direct auth check failed:", err)
    }
  }

  if (!verified) {
    return NextResponse.json(
      { error: "Current password is incorrect. Please check and try again." },
      { status: 401 }
    )
  }

  // Find target account in Stalwart
  try {
    const accounts = await queryAccounts()
    const targetAccount = accounts.find(
      (a) => a.email.toLowerCase() === cleanEmail.toLowerCase()
    )

    if (!targetAccount) {
      return NextResponse.json(
        { error: `Mailbox '${cleanEmail}' not found in mail server.` },
        { status: 404 }
      )
    }

    // Update password in Stalwart via JMAP x:Account/set
    await updateAccountPassword(targetAccount.id, newPassword)

    // Audit the password change event
    await recordAudit({
      actor: cleanEmail,
      action: "mailbox.password_reset",
      target: cleanEmail,
      detail: `Password changed for mailbox ${cleanEmail} from Rav webmail settings`,
    })

    return NextResponse.json({
      ok: true,
      message: "Password changed successfully.",
    })
  } catch (err) {
    console.error("[change-password] Failed to update password in Stalwart:", err)
    const msg = err instanceof Error ? err.message : "Failed to update password in mail server."
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

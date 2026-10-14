import "server-only"

import crypto from "node:crypto"
import { getPool, initDatabase } from "@/lib/db"
import {
  findUserByEmail,
  generateSalt,
  hashPassword,
  updateUserPassword,
  verifyPassword,
} from "@/lib/db/users"
import { sendPasswordResetEmail } from "@/lib/email/sender"
import { recordAudit } from "@/lib/audit"

function maskEmail(email: string): string {
  const parts = email.split("@")
  if (parts.length !== 2) return email
  const name = parts[0]
  const domain = parts[1]
  if (name.length <= 2) {
    return `${name[0]}*@${domain}`
  }
  return `${name.slice(0, 2)}***${name.slice(-1)}@${domain}`
}

export function validateStrongPassword(password: string): {
  valid: boolean
  errors: string[]
} {
  const errors: string[] = []
  if (password.length < 8) {
    errors.push("Password must be at least 8 characters long.")
  }
  if (!/[A-Z]/.test(password)) {
    errors.push("Password must contain at least one uppercase letter.")
  }
  if (!/[a-z]/.test(password)) {
    errors.push("Password must contain at least one lowercase letter.")
  }
  if (!/[0-9!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) {
    errors.push("Password must contain at least one number or special character.")
  }
  return { valid: errors.length === 0, errors }
}

export async function requestPasswordResetOtp(email: string): Promise<{
  success: boolean
  maskedEmail: string
  cooldownSeconds: number
  error?: string
}> {
  await initDatabase()
  const cleanEmail = email.trim().toLowerCase()

  if (!cleanEmail || !cleanEmail.includes("@")) {
    return {
      success: false,
      maskedEmail: "",
      cooldownSeconds: 0,
      error: "Please enter a valid email address.",
    }
  }

  const pool = getPool()
  if (!pool) {
    return {
      success: false,
      maskedEmail: maskEmail(cleanEmail),
      cooldownSeconds: 0,
      error: "Database unavailable.",
    }
  }

  // Anti-enumeration security check:
  // If user does not exist, simulate success to external observer but do NOT send any email.
  const user = await findUserByEmail(cleanEmail)
  if (!user) {
    return {
      success: true,
      maskedEmail: maskEmail(cleanEmail),
      cooldownSeconds: 60,
    }
  }

  // Check 60-second cooldown on existing OTPs
  const recent = await pool.query(
    `SELECT created_at FROM password_reset_otps 
     WHERE user_id = $1 AND created_at > NOW() - INTERVAL '60 seconds'
     ORDER BY created_at DESC LIMIT 1`,
    [user.id]
  )
  if (recent.rows.length > 0) {
    const elapsedMs = Date.now() - new Date(recent.rows[0].created_at).getTime()
    const remainingSec = Math.max(1, 60 - Math.floor(elapsedMs / 1000))
    return {
      success: false,
      maskedEmail: maskEmail(cleanEmail),
      cooldownSeconds: remainingSec,
      error: `Please wait ${remainingSec} seconds before requesting another code.`,
    }
  }

  // Generate 6-digit cryptographic numeric code
  const code = crypto.randomInt(100000, 1000000).toString()
  const salt = generateSalt()
  const codeHash = hashPassword(code, salt)
  const id = `otp-${crypto.randomUUID()}`

  // Invalidate any previous unverified OTPs for this user
  await pool.query(
    "DELETE FROM password_reset_otps WHERE user_id = $1 AND verified_at IS NULL",
    [user.id]
  )

  // Insert new OTP with 10-minute expiry
  await pool.query(
    `INSERT INTO password_reset_otps 
     (id, user_id, email, code_hash, salt, attempts, expires_at, created_at)
     VALUES ($1, $2, $3, $4, $5, 0, NOW() + INTERVAL '10 minutes', NOW())`,
    [id, user.id, user.email, codeHash, salt]
  )

  // Send the email via configured system sender
  await sendPasswordResetEmail(user.email, code)

  return {
    success: true,
    maskedEmail: maskEmail(user.email),
    cooldownSeconds: 60,
  }
}

export async function verifyPasswordResetOtp(
  email: string,
  code: string
): Promise<{
  success: boolean
  resetToken?: string
  error?: string
}> {
  await initDatabase()
  const cleanEmail = email.trim().toLowerCase()
  const cleanCode = code.trim()

  if (!cleanCode || cleanCode.length !== 6) {
    return { success: false, error: "Please enter a valid 6-digit verification code." }
  }

  const pool = getPool()
  if (!pool) return { success: false, error: "Database unavailable." }

  const res = await pool.query(
    `SELECT id, user_id, code_hash, salt, attempts, expires_at
     FROM password_reset_otps
     WHERE LOWER(email) = $1 AND verified_at IS NULL AND expires_at > NOW()
     ORDER BY created_at DESC LIMIT 1`,
    [cleanEmail]
  )

  if (res.rows.length === 0) {
    return { success: false, error: "Verification code is invalid or has expired." }
  }

  const row = res.rows[0]
  if (row.attempts >= 5) {
    await pool.query("DELETE FROM password_reset_otps WHERE id = $1", [row.id])
    return {
      success: false,
      error: "Too many failed attempts. Please request a new verification code.",
    }
  }

  // Increment attempts counter
  await pool.query(
    "UPDATE password_reset_otps SET attempts = attempts + 1 WHERE id = $1",
    [row.id]
  )

  const matches = verifyPassword(cleanCode, row.code_hash, row.salt)
  if (!matches) {
    return { success: false, error: "Incorrect verification code. Please try again." }
  }

  // Generate a high-entropy one-time reset token
  const resetToken = crypto.randomBytes(32).toString("hex")

  await pool.query(
    `UPDATE password_reset_otps 
     SET reset_token = $1, verified_at = NOW() 
     WHERE id = $2`,
    [resetToken, row.id]
  )

  return { success: true, resetToken }
}

export async function completePasswordReset(
  resetToken: string,
  newPassword: string
): Promise<{
  success: boolean
  error?: string
}> {
  await initDatabase()
  if (!resetToken?.trim()) {
    return { success: false, error: "Invalid password reset session." }
  }

  const check = validateStrongPassword(newPassword)
  if (!check.valid) {
    return { success: false, error: check.errors[0] }
  }

  const pool = getPool()
  if (!pool) return { success: false, error: "Database unavailable." }

  const res = await pool.query(
    `SELECT id, user_id, email, expires_at
     FROM password_reset_otps
     WHERE reset_token = $1 AND verified_at IS NOT NULL AND expires_at > NOW()
     LIMIT 1`,
    [resetToken.trim()]
  )

  if (res.rows.length === 0) {
    return {
      success: false,
      error: "Reset session has expired. Please restart the forgot password process.",
    }
  }

  const row = res.rows[0]

  // Update user's password in database
  const updated = await updateUserPassword(row.user_id, newPassword)

  // Delete all OTP records for this user
  await pool.query("DELETE FROM password_reset_otps WHERE user_id = $1", [row.user_id])

  await recordAudit({
    actor: updated.username,
    action: "user.password_reset",
    detail: `Password reset verified via 6-digit OTP for user '${updated.username}' (${row.email})`,
  }).catch(() => {})

  return { success: true }
}

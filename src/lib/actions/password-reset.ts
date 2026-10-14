"use server"

import {
  requestPasswordResetOtp,
  verifyPasswordResetOtp,
  completePasswordReset,
  validateStrongPassword,
} from "@/lib/auth/password-reset"

export type ActionResult<T = void> =
  | { ok: true; data?: T }
  | { ok: false; error: string }

export async function requestPasswordResetAction(
  email: string
): Promise<ActionResult<{ maskedEmail: string; cooldownSeconds: number }>> {
  try {
    const res = await requestPasswordResetOtp(email)
    if (!res.success) {
      return { ok: false, error: res.error || "Failed to send verification code." }
    }
    return {
      ok: true,
      data: {
        maskedEmail: res.maskedEmail,
        cooldownSeconds: res.cooldownSeconds,
      },
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to request password reset."
    return { ok: false, error: msg }
  }
}

export async function verifyPasswordResetAction(
  email: string,
  code: string
): Promise<ActionResult<{ resetToken: string }>> {
  try {
    const res = await verifyPasswordResetOtp(email, code)
    if (!res.success || !res.resetToken) {
      return { ok: false, error: res.error || "Invalid verification code." }
    }
    return {
      ok: true,
      data: {
        resetToken: res.resetToken,
      },
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to verify code."
    return { ok: false, error: msg }
  }
}

export async function completePasswordResetAction(
  resetToken: string,
  newPassword: string,
  confirmPassword: string
): Promise<ActionResult> {
  try {
    if (newPassword !== confirmPassword) {
      return { ok: false, error: "Passwords do not match." }
    }

    const check = validateStrongPassword(newPassword)
    if (!check.valid) {
      return { ok: false, error: check.errors[0] }
    }

    const res = await completePasswordReset(resetToken, newPassword)
    if (!res.success) {
      return { ok: false, error: res.error || "Failed to update password." }
    }

    return { ok: true }
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to reset password."
    return { ok: false, error: msg }
  }
}

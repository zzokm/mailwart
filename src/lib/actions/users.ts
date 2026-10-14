"use server"

import crypto from "node:crypto"
import { revalidatePath } from "next/cache"

import { recordAudit } from "@/lib/audit"
import {
  getSession,
  requireAdminSession,
  requireSession,
  sessionActor,
} from "@/lib/auth/session"
import {
  createUser,
  deleteUser,
  findUserById,
  findUserByEmail,
  listUsers,
  isPrimaryAdmin,
  updateUserPassword,
  updateUserEmail,
  type SafeUser,
} from "@/lib/db/users"
import { initDatabase, removeMailboxRecord } from "@/lib/db"
import {
  getOutboundEmailConfig,
  saveOutboundEmailConfig,
  type SystemEmailSenderConfig,
} from "@/lib/db/system-settings"
import {
  createAccount,
  updateAccountPassword,
  destroyAccount,
  queryAccounts,
} from "@/lib/stalwart/accounts"
import { sendPasswordResetEmail } from "@/lib/email/sender"


import { queryDomains } from "@/lib/stalwart/domains"
import {
  requestPasswordResetOtp,
  verifyPasswordResetOtp,
  completePasswordReset,
  validateStrongPassword,
} from "@/lib/auth/password-reset"
import { zodIssuesMessage } from "@/lib/validations/common"
import {
  createUserSchema,
  deleteUserSchema,
  type CreateUserInput,
  type DeleteUserInput,
} from "@/lib/validations/users"

export type ActionResult<T = void> =
  | { ok: true; data?: T }
  | { ok: false; error: string }

export async function listUsersAction(): Promise<ActionResult<SafeUser[]>> {
  try {
    await requireAdminSession()
    await initDatabase()
    const users = await listUsers()
    return { ok: true, data: users }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to list users."
    return { ok: false, error: message }
  }
}

export async function createUserAction(
  rawInput: CreateUserInput
): Promise<ActionResult<SafeUser>> {
  try {
    await requireAdminSession()
    await initDatabase()
    const parsed = createUserSchema.safeParse(rawInput)
    if (!parsed.success) {
      return { ok: false, error: zodIssuesMessage(parsed.error) }
    }

    const { username, email, password, role } = parsed.data

    const newUser = await createUser({
      username,
      email,
      password,
      role,
    })

    const actor = await sessionActor()
    await recordAudit({
      actor,
      action: "user.create",
      detail: `Created user ${newUser.username} (${newUser.email}) with role '${newUser.role}'`,
    })

    revalidatePath("/dashboard/settings")
    return { ok: true, data: newUser }
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : "Failed to create user."
    return { ok: false, error: message }
  }
}

export async function deleteUserAction(
  rawInput: DeleteUserInput
): Promise<ActionResult> {
  try {
    const session = await requireAdminSession()
    const parsed = deleteUserSchema.safeParse(rawInput)
    if (!parsed.success) {
      return { ok: false, error: zodIssuesMessage(parsed.error) }
    }

    const userId = (parsed.data.userId || parsed.data.id)!

    const targetUser = await findUserById(userId)
    if (!targetUser) {
      return { ok: false, error: "User not found." }
    }

    // Safety checks: Cannot delete self
    if (session.userId === targetUser.id || session.username === targetUser.username) {
      return { ok: false, error: "You cannot delete your own account." }
    }

    // Safety check: Cannot delete the primary admin account 'yehia'
    if (targetUser.username === "yehia") {
      return { ok: false, error: "The primary admin account cannot be deleted." }
    }

    const deleted = await deleteUser(userId)
    if (!deleted) {
      return { ok: false, error: "User could not be deleted." }
    }

    const actor = await sessionActor()
    await recordAudit({
      actor,
      action: "user.destroy",
      detail: `Deleted user ${targetUser.username} (${targetUser.email})`,
    })

    revalidatePath("/dashboard/settings")
    return { ok: true }
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : "Failed to delete user."
    return { ok: false, error: message }
  }
}

export async function getCurrentUserAction(): Promise<ActionResult<{
  userId?: string
  username?: string
  email?: string
  role?: string
  impersonatingFrom?: {
    userId: string
    username: string
    role: "admin"
  }
}>> {
  try {
    const session = await requireSession()
    return {
      ok: true,
      data: {
        userId: session.userId,
        username: session.username,
        email: session.email,
        role: session.role,
        impersonatingFrom: session.impersonatingFrom,
      },
    }
  } catch {
    return { ok: false, error: "Unauthenticated" }
  }
}

export async function impersonateUserAction(
  targetUserId: string
): Promise<ActionResult<SafeUser>> {
  try {
    const session = await getSession()
    const isAdmin =
      session.role === "admin" || session.impersonatingFrom?.role === "admin"
    if (!isAdmin) {
      return { ok: false, error: "Only administrators can impersonate users." }
    }

    await initDatabase()
    const targetUser = await findUserById(targetUserId)
    if (!targetUser) {
      return { ok: false, error: "Target user not found." }
    }

    const originalAdmin = session.impersonatingFrom || {
      userId: session.userId || "",
      username: session.username || "yehia",
      role: "admin" as const,
    }

    session.impersonatingFrom = originalAdmin
    session.userId = targetUser.id
    session.username = targetUser.username
    session.email = targetUser.email
    session.role = targetUser.role
    await session.save()

    const actor = originalAdmin.username
    await recordAudit({
      actor,
      action: "user.impersonate",
      detail: `Admin ${actor} switched to user ${targetUser.username} (${targetUser.email})`,
    })

    revalidatePath("/", "layout")
    return { ok: true, data: targetUser }
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : "Failed to switch to user."
    return { ok: false, error: message }
  }
}

export async function stopImpersonatingAction(): Promise<ActionResult> {
  try {
    const session = await getSession()
    if (!session.impersonatingFrom) {
      return { ok: false, error: "Not currently impersonating any user." }
    }

    const originalAdmin = session.impersonatingFrom
    const impersonatedUser = session.username

    session.userId = originalAdmin.userId
    session.username = originalAdmin.username
    session.role = originalAdmin.role
    session.isPrimary = isPrimaryAdmin(originalAdmin.username)
    delete session.impersonatingFrom
    await session.save()

    await recordAudit({
      actor: originalAdmin.username,
      action: "user.stop_impersonate",
      detail: `Admin ${originalAdmin.username} exited impersonation of ${impersonatedUser}`,
    })

    revalidatePath("/", "layout")
    return { ok: true }
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : "Failed to exit impersonation."
    return { ok: false, error: message }
  }
}

/**
 * Primary admin can directly update any user's password (or their own) to any password.
 */
export async function adminUpdateUserPasswordAction(
  targetUserId: string,
  newPassword: string
): Promise<ActionResult<SafeUser>> {
  try {
    const session = await requireSession()
    if (!isPrimaryAdmin(session.username)) {
      return {
        ok: false,
        error: "Forbidden: Only the primary administrator can directly modify passwords.",
      }
    }

    if (!newPassword) {
      return { ok: false, error: "Password cannot be empty." }
    }

    const targetUser = await findUserById(targetUserId)
    if (!targetUser) {
      return { ok: false, error: "Target user not found." }
    }

    const updated = await updateUserPassword(targetUserId, newPassword)

    const actor = session.username || "yehia"
    await recordAudit({
      actor,
      action: "user.password_change",
      detail: `Primary admin ${actor} directly set password for user '${targetUser.username}' (${targetUser.email})`,
    })

    revalidatePath("/dashboard/settings")
    return { ok: true, data: updated }
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to update password."
    return { ok: false, error: msg }
  }
}

/**
 * Primary admin can change their own email and anyone else's email.
 */
export async function adminUpdateUserEmailAction(
  targetUserId: string,
  newEmail: string
): Promise<ActionResult<SafeUser>> {
  try {
    const session = await requireSession()
    if (!isPrimaryAdmin(session.username)) {
      return {
        ok: false,
        error: "Forbidden: Only the primary administrator can modify user email addresses.",
      }
    }

    const cleanEmail = newEmail.trim().toLowerCase()
    if (!cleanEmail || !cleanEmail.includes("@")) {
      return { ok: false, error: "Please enter a valid email address." }
    }

    const targetUser = await findUserById(targetUserId)
    if (!targetUser) {
      return { ok: false, error: "Target user not found." }
    }

    const existing = await findUserByEmail(cleanEmail)
    if (existing && existing.id !== targetUserId) {
      return { ok: false, error: "Email address is already in use by another user." }
    }

    const updated = await updateUserEmail(targetUserId, cleanEmail)

    if (targetUserId === session.userId) {
      session.email = cleanEmail
      await session.save()
    }

    const actor = session.username || "yehia"
    await recordAudit({
      actor,
      action: "user.email_change",
      detail: `Primary admin ${actor} updated email for user '${targetUser.username}' from ${targetUser.email} to ${cleanEmail}`,
    })

    revalidatePath("/dashboard/settings")
    return { ok: true, data: updated }
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to update email address."
    return { ok: false, error: msg }
  }
}

/**
 * Primary admin self-updates password from account settings without OTP.
 */
export async function primaryAdminSelfUpdatePasswordAction(
  newPassword: string
): Promise<ActionResult<SafeUser>> {
  try {
    const session = await requireSession()
    if (!isPrimaryAdmin(session.username)) {
      return {
        ok: false,
        error: "Forbidden: Only the primary administrator can update password directly.",
      }
    }

    if (!newPassword || newPassword.length < 4) {
      return { ok: false, error: "Password must be at least 4 characters long." }
    }

    const updated = await updateUserPassword(session.userId!, newPassword)
    await recordAudit({
      actor: session.username || "yehia",
      action: "user.password_change",
      detail: `Primary admin ${session.username} updated their own password`,
    })

    return { ok: true, data: updated }
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to update password."
    return { ok: false, error: msg }
  }
}

/**
 * Setup a dedicated noreply mailbox on the selected domain in 1-click and configure it as the system email sender.
 */
export async function setupNoreplyEmailAction(
  domainName: string
): Promise<ActionResult<SystemEmailSenderConfig>> {
  try {
    const session = await requireSession()
    if (!isPrimaryAdmin(session.username)) {
      return {
        ok: false,
        error: "Forbidden: Only the primary administrator can configure the system sender mailbox.",
      }
    }

    const cleanDomain = domainName.trim().toLowerCase()
    const domains = await queryDomains()
    const domain = domains.find((d) => d.name.toLowerCase() === cleanDomain)
    if (!domain) {
      return { ok: false, error: `Domain '${cleanDomain}' not found in Stalwart.` }
    }

    const targetEmail = `noreply@${cleanDomain}`
    const generatedPassword = crypto.randomBytes(18).toString("base64") + "!Aa1"

    const accounts = await queryAccounts(domains)
    let account = accounts.find((a) => a.email.toLowerCase() === targetEmail)

    if (!account) {
      account = await createAccount({
        local: "noreply",
        email: targetEmail,
        domainId: domain.id,
        password: generatedPassword,
        description: "Automated System Mailer",
      })
    } else {
      await updateAccountPassword(account.id, generatedPassword)
    }


    const host = `mail.${cleanDomain}`
    const config: SystemEmailSenderConfig = {
      mailboxEmail: targetEmail,
      domain: cleanDomain,
      password: generatedPassword,
      host,
      port: 587,
      secure: false,
      fromName: "mailwart",
      isNoreply: true,
      configuredAt: new Date().toISOString(),
    }

    await saveOutboundEmailConfig(config)

    await recordAudit({
      actor: session.username || "yehia",
      action: "system.setup_noreply",
      detail: `Configured system sender mailbox to ${targetEmail} on ${cleanDomain}`,
    })

    revalidatePath("/dashboard/settings")
    return { ok: true, data: config }
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to setup noreply mailbox."
    return { ok: false, error: msg }
  }
}

/**
 * Changes the active domain for the 1-click noreply mailbox:
 * Removes the old noreply mailbox on the old domain from Stalwart,
 * creates a new noreply mailbox on the new domain with the same abstracted password,
 * and updates system outbound mailer configuration.
 */
export async function changeNoreplyDomainAction(
  newDomainName: string
): Promise<ActionResult<SystemEmailSenderConfig>> {
  try {
    const session = await requireSession()
    if (!isPrimaryAdmin(session.username)) {
      return {
        ok: false,
        error: "Forbidden: Only the primary administrator can change the noreply domain.",
      }
    }

    const currentConfig = await getOutboundEmailConfig()
    if (!currentConfig) {
      return {
        ok: false,
        error: "No system outbound sender is currently configured.",
      }
    }

    const newCleanDomain = newDomainName.trim().toLowerCase()
    if (newCleanDomain === currentConfig.domain.toLowerCase()) {
      return {
        ok: false,
        error: `Noreply is already configured on domain '@${newCleanDomain}'.`,
      }
    }

    const domains = await queryDomains()
    const targetDomain = domains.find((d) => d.name.toLowerCase() === newCleanDomain)
    if (!targetDomain) {
      return { ok: false, error: `Domain '${newCleanDomain}' not found in Stalwart.` }
    }

    const oldEmail = currentConfig.mailboxEmail.toLowerCase()
    const oldDomain = currentConfig.domain.toLowerCase()
    const passwordToUse =
      currentConfig.password || crypto.randomBytes(18).toString("base64") + "!Aa1"

    const accounts = await queryAccounts(domains)

    // 1. Remove old mailbox from Stalwart if it existed
    const oldAccount = accounts.find((a) => a.email.toLowerCase() === oldEmail)
    if (oldAccount) {
      try {
        await destroyAccount(oldAccount.id)
        await removeMailboxRecord(oldAccount.id).catch(() => {})
      } catch (destroyErr) {
        console.warn(`[changeNoreplyDomain] Failed to destroy old account ${oldEmail}:`, destroyErr)
      }
    }

    // 2. Provision new mailbox noreply@<newCleanDomain> on Stalwart
    const newTargetEmail = `noreply@${newCleanDomain}`
    const existingNewAccount = accounts.find(
      (a) => a.email.toLowerCase() === newTargetEmail
    )

    if (!existingNewAccount) {
      await createAccount({
        local: "noreply",
        email: newTargetEmail,
        domainId: targetDomain.id,
        password: passwordToUse,
        description: "Automated System Mailer",
      })
    } else {
      await updateAccountPassword(existingNewAccount.id, passwordToUse)
    }

    // 3. Update configuration in database
    const updatedConfig: SystemEmailSenderConfig = {
      mailboxEmail: newTargetEmail,
      domain: newCleanDomain,
      password: passwordToUse,
      host: `mail.${newCleanDomain}`,
      port: currentConfig.port || 587,
      secure: currentConfig.secure ?? false,
      fromName: currentConfig.fromName || "mailwart",
      isNoreply: true,
      configuredAt: new Date().toISOString(),
    }

    await saveOutboundEmailConfig(updatedConfig)

    await recordAudit({
      actor: session.username || "yehia",
      action: "system.change_noreply_domain",
      detail: `Switched noreply domain from @${oldDomain} to @${newCleanDomain} (removed ${oldEmail}, provisioned ${newTargetEmail})`,
    })

    revalidatePath("/dashboard/settings")
    return { ok: true, data: updatedConfig }
  } catch (err) {
    const msg =
      err instanceof Error ? err.message : "Failed to change noreply domain."
    return { ok: false, error: msg }
  }
}

/**
 * Test outbound deliverability by dispatching a verification code email to any target email.
 */
export async function sendTestVerificationEmailAction(input: {
  to: string
  code?: string
}): Promise<
  ActionResult<{
    messageId?: string
    to: string
    code: string
    senderEmail: string
    host: string
  }>
> {
  try {
    const session = await requireSession()
    if (!isPrimaryAdmin(session.username)) {
      return {
        ok: false,
        error: "Forbidden: Only the primary administrator can trigger system mailer tests.",
      }
    }

    const cleanTo = input.to?.trim().toLowerCase()
    if (!cleanTo || !cleanTo.includes("@")) {
      return { ok: false, error: "Please enter a valid recipient email address." }
    }

    const config = await getOutboundEmailConfig()
    if (!config) {
      return {
        ok: false,
        error: "System outbound mailer is not configured. Please setup or configure a mailbox first.",
      }
    }

    const testCode = (input.code?.trim() || crypto.randomInt(100000, 1000000).toString())

    const res = await sendPasswordResetEmail(cleanTo, testCode)
    if (!res.success) {
      return {
        ok: false,
        error: res.error || "Failed to dispatch test verification email.",
      }
    }

    await recordAudit({
      actor: session.username || "yehia",
      action: "system.test_email",
      detail: `Sent test verification code (${testCode}) to ${cleanTo} via ${config.mailboxEmail}`,
    }).catch(() => {})

    return {
      ok: true,
      data: {
        messageId: res.messageId,
        to: cleanTo,
        code: testCode,
        senderEmail: config.mailboxEmail,
        host: config.host,
      },
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to send test email."
    return { ok: false, error: msg }
  }
}

/**
 * Configure any existing mailbox as the system sender for password reset and OTP emails.
 */
export async function saveSystemEmailSenderAction(
  input: SystemEmailSenderConfig
): Promise<ActionResult<void>> {
  try {
    const session = await requireSession()
    if (!isPrimaryAdmin(session.username)) {
      return {
        ok: false,
        error: "Forbidden: Only the primary administrator can configure system outbound email.",
      }
    }

    if (!input.mailboxEmail || !input.host) {
      return { ok: false, error: "Mailbox email and SMTP host are required." }
    }

    await saveOutboundEmailConfig(input)

    await recordAudit({
      actor: session.username || "yehia",
      action: "system.outbound_email_config",
      detail: `Updated system outbound mail sender to ${input.mailboxEmail} (${input.host}:${input.port})`,
    })

    revalidatePath("/dashboard/settings")
    return { ok: true }
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to save outbound email config."
    return { ok: false, error: msg }
  }
}

/**
 * Retrieve current system outbound email settings.
 */
export async function getSystemEmailSenderAction(): Promise<
  ActionResult<SystemEmailSenderConfig | null>
> {
  try {
    await requireAdminSession()
    const config = await getOutboundEmailConfig()
    return { ok: true, data: config }
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to load outbound email config."
    return { ok: false, error: msg }
  }
}

/**
 * Request OTP for in-account password change (used by regular users and secondary admins).
 */
export async function requestInAccountPasswordChangeOtpAction(): Promise<
  ActionResult<{ maskedEmail: string; cooldownSeconds: number }>
> {
  try {
    const session = await requireSession()
    const user = await findUserById(session.userId!)
    if (!user) {
      return { ok: false, error: "User session not found in database." }
    }

    const res = await requestPasswordResetOtp(user.email)
    if (!res.success) {
      return { ok: false, error: res.error || "Failed to dispatch verification code." }
    }

    return {
      ok: true,
      data: {
        maskedEmail: res.maskedEmail,
        cooldownSeconds: res.cooldownSeconds,
      },
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to request password reset code."
    return { ok: false, error: msg }
  }
}

/**
 * Verify OTP for in-account password change.
 */
export async function verifyInAccountPasswordChangeOtpAction(
  code: string
): Promise<ActionResult<{ resetToken: string }>> {
  try {
    const session = await requireSession()
    const user = await findUserById(session.userId!)
    if (!user) {
      return { ok: false, error: "User session not found in database." }
    }

    const res = await verifyPasswordResetOtp(user.email, code)
    if (!res.success || !res.resetToken) {
      return { ok: false, error: res.error || "Invalid verification code." }
    }

    return { ok: true, data: { resetToken: res.resetToken } }
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to verify code."
    return { ok: false, error: msg }
  }
}

/**
 * Complete in-account password change.
 */
export async function completeInAccountPasswordChangeAction(
  resetToken: string,
  newPassword: string,
  confirmPassword: string
): Promise<ActionResult> {
  try {
    await requireSession()
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

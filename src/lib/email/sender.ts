import "server-only"

import nodemailer from "nodemailer"
import { getOutboundEmailConfig } from "@/lib/db/system-settings"
import { recordAudit } from "@/lib/audit"

export interface SendEmailOptions {
  to: string
  subject: string
  html: string
  text: string
}

export async function sendSystemEmail(options: SendEmailOptions): Promise<{
  success: boolean
  messageId?: string
  error?: string
}> {
  const config = await getOutboundEmailConfig()

  if (!config) {
    const errMsg =
      "System outbound mail is not configured. Configure a mailbox in Admin Settings."
    await recordAudit({
      actor: "system",
      action: "system.email_failed",
      detail: errMsg,
      meta: { to: options.to, subject: options.subject },
    }).catch(() => {})
    return { success: false, error: errMsg }
  }

  // Attempt with configured host first, fallback to stalwart-mail or mail.zokm.me if container networking/hairpin NAT fails
  const candidateHosts = [
    config.host,
    "stalwart-mail",
    "mail.zokm.me",
  ].filter((h, idx, arr): h is string => Boolean(h) && arr.indexOf(h) === idx)

  let lastError: unknown = null

  for (const host of candidateHosts) {
    try {
      const transporter = nodemailer.createTransport({
        host,
        port: config.port || 587,
        secure: config.port === 465,
        auth: config.password
          ? {
              user: config.mailboxEmail,
              pass: config.password,
            }
          : undefined,
        tls: {
          rejectUnauthorized: false, // accommodate self-signed or internal docker certificates
        },
        connectionTimeout: 8000,
      })

      const fromAddress = config.fromName
        ? `"${config.fromName}" <${config.mailboxEmail}>`
        : config.mailboxEmail

      const info = await transporter.sendMail({
        from: fromAddress,
        to: options.to,
        subject: options.subject,
        text: options.text,
        html: options.html,
      })

      await recordAudit({
        actor: "system",
        action: "system.email_sent",
        detail: `System email dispatched to ${options.to} via ${config.mailboxEmail} (${host})`,
        meta: { to: options.to, subject: options.subject, messageId: info.messageId, host },
      }).catch(() => {})

      return { success: true, messageId: info.messageId }
    } catch (err) {
      lastError = err
      console.warn(`[nodemailer] Attempt with host '${host}' failed, trying next candidate:`, err)
    }
  }

  const errorMsg = lastError instanceof Error ? lastError.message : String(lastError)
  await recordAudit({
    actor: "system",
    action: "system.email_failed",
    detail: `Failed to dispatch email to ${options.to}: ${errorMsg}`,
    meta: { error: errorMsg, host: config.host, port: config.port },
  }).catch(() => {})
  return { success: false, error: errorMsg }
}


import {
  getEmailTemplateSetting,
  type EmailTemplateId,
} from "@/lib/db/system-settings"
import {
  renderPasswordResetEmailHtml,
  renderPasswordResetEmailText,
} from "@/lib/email/templates/password-reset"

/**
 * Sends a clean, branded 6-digit OTP verification email for password resets or deliverability tests.
 * Supports template selection via system settings or explicit override.
 */
export async function sendPasswordResetEmail(
  recipientEmail: string,
  otpCode: string,
  templateOverride?: EmailTemplateId
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  const activeTemplate: EmailTemplateId =
    templateOverride ||
    (await getEmailTemplateSetting().catch(() => "macos_dark" as EmailTemplateId))

  const subject = `Your mailwart verification code: ${otpCode}`
  const html = renderPasswordResetEmailHtml(otpCode, activeTemplate)
  const text = renderPasswordResetEmailText(otpCode)

  return sendSystemEmail({
    to: recipientEmail,
    subject,
    html,
    text,
  })
}

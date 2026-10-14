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


/**
 * Sends a clean, branded 6-digit OTP verification email for password resets or deliverability tests.
 */
export async function sendPasswordResetEmail(
  recipientEmail: string,
  otpCode: string
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  const subject = `Your mailwart verification code: ${otpCode}`

  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Password Reset Code</title>
</head>
<body style="margin: 0; padding: 0; background-color: #090a0d; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #f3f4f6;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: #090a0d; padding: 40px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width: 500px; background-color: #12151c; border-radius: 14px; border: 1px solid #232834; overflow: hidden; box-shadow: 0 10px 25px rgba(0,0,0,0.5);">
          <!-- Header -->
          <tr>
            <td style="padding: 28px 32px 20px 32px; border-bottom: 1px solid #1f2430;">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                <tr>
                  <td>
                    <span style="font-size: 20px; font-weight: 800; letter-spacing: -0.03em; color: #ffffff;">mailwart</span>
                  </td>
                  <td align="right">
                    <span style="font-size: 11px; font-family: ui-monospace, SFMono-Regular, monospace; text-transform: uppercase; letter-spacing: 0.1em; color: #0284c7; background-color: rgba(2, 132, 199, 0.12); padding: 4px 8px; border-radius: 6px; border: 1px solid rgba(2, 132, 199, 0.25);">security</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="padding: 32px;">
              <h1 style="margin: 0 0 12px 0; font-size: 18px; font-weight: 600; color: #ffffff; line-height: 1.4;">
                Password Reset Verification Code
              </h1>
              <p style="margin: 0 0 28px 0; font-size: 14px; line-height: 1.6; color: #9ca3af;">
                You recently requested to reset your password for your <strong>mailwart</strong> console account. Enter the 6-digit verification code below to proceed:
              </p>

              <!-- OTP Code Display Card -->
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-bottom: 28px;">
                <tr>
                  <td align="center" style="background-color: #0b0d13; border: 1px solid #283040; border-radius: 10px; padding: 24px;">
                    <div style="font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; font-size: 36px; font-weight: 800; letter-spacing: 0.35em; color: #38bdf8; text-align: center; text-indent: 0.35em;">
                      ${otpCode}
                    </div>
                  </td>
                </tr>
              </table>

              <p style="margin: 0 0 12px 0; font-size: 12px; line-height: 1.6; color: #6b7280;">
                ⏱ This code will expire in <strong>10 minutes</strong>. For security, never share this code with anyone.
              </p>
              <p style="margin: 0; font-size: 12px; line-height: 1.6; color: #6b7280;">
                If you did not request this verification code, please ignore this email. Your account credentials will remain securely intact.
              </p>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="padding: 20px 32px; background-color: #0e1017; border-top: 1px solid #1f2430; text-align: center;">
              <p style="margin: 0; font-size: 11px; color: #4b5563; font-family: ui-monospace, SFMono-Regular, monospace;">
                Automated security transmission from mailwart console
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
`

  const text = `mailwart — Password Reset Verification Code\n\nYour 6-digit verification code is: ${otpCode}\n\nThis code will expire in 10 minutes.\nIf you did not request this code, you can safely ignore this email.`

  return sendSystemEmail({
    to: recipientEmail,
    subject,
    html,
    text,
  })
}

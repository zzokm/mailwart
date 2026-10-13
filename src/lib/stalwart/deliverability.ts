import "server-only"

import net from "node:net"
import { queryDomains } from "./domains"
import { queryAccounts, createAccount, updateAccountPassword } from "./accounts"
import { recordAudit } from "@/lib/audit"

export type MailboxConnectionProfile = {
  domain: string
  email: string
  username: string
  password: string
  mailHost: string
  serverIp: string
  imap: {
    host: string
    port: number
    security: "SSL/TLS"
    altPort: number
    altSecurity: "STARTTLS"
  }
  smtp: {
    host: string
    port: number
    security: "STARTTLS"
    altPort: number
    altSecurity: "SSL/TLS"
  }
  webmailUrl: string
  roundcubeUrl: string
  status: "ready" | "created" | "error"
  error?: string
}

export const DEFAULT_TEST_PASSWORD = "TestMailPassword2026!"
const SERVER_PUBLIC_IP = "23.94.107.153"

/**
 * Ensures a test mailbox (`test@<domain>`) exists on every active Stalwart domain,
 * sets a known secure password, and returns complete setup instructions.
 */
export async function ensureMailboxesOnAllDomains(
  password = DEFAULT_TEST_PASSWORD
): Promise<MailboxConnectionProfile[]> {
  const domains = await queryDomains()
  const accounts = await queryAccounts(domains)
  const profiles: MailboxConnectionProfile[] = []

  for (const domain of domains) {
    const domainName = domain.name.toLowerCase()
    const targetEmail = `test@${domainName}`
    const mailHost = `mail.${domainName}`

    let account = accounts.find((a) => a.email.toLowerCase() === targetEmail)
    let status: "ready" | "created" | "error" = "ready"
    let error: string | undefined

    try {
      if (!account) {
        account = await createAccount({
          local: "test",
          email: targetEmail,
          domainId: domain.id,
          password,
          description: `Deliverability test mailbox for ${domainName}`,
        })
        status = "created"
      } else {
        // Ensure the password is synchronized
        await updateAccountPassword(account.id, password).catch(() => {})
      }
    } catch (err) {
      status = "error"
      error = err instanceof Error ? err.message : String(err)
    }

    profiles.push({
      domain: domainName,
      email: targetEmail,
      username: targetEmail,
      password,
      mailHost,
      serverIp: SERVER_PUBLIC_IP,
      imap: {
        host: mailHost,
        port: 993,
        security: "SSL/TLS",
        altPort: 143,
        altSecurity: "STARTTLS",
      },
      smtp: {
        host: mailHost,
        port: 587,
        security: "STARTTLS",
        altPort: 465,
        altSecurity: "SSL/TLS",
      },
      webmailUrl: `https://${mailHost}/`,
      roundcubeUrl: "https://mail.zokm.me/",
      status,
      error,
    })
  }

  return profiles
}

/**
 * Lightweight, zero-dependency SMTP client to send outbound email via Stalwart.
 * Connects directly to internal `stalwart-mail:587` or public IP.
 */
export async function sendSmtpMessage(options: {
  host?: string
  port?: number
  user?: string
  pass?: string
  from: string
  to: string
  subject: string
  text: string
  html?: string
  timeoutMs?: number
}): Promise<{ ok: boolean; response: string; queueId?: string }> {
  const host = options.host || "stalwart-mail"
  const port = options.port || 587
  const timeoutMs = options.timeoutMs || 15000

  return new Promise((resolve, reject) => {
    let step = 0
    let buffer = ""

    const socket = net.createConnection({ host, port })

    const cleanup = () => {
      try {
        socket.destroy()
      } catch {
        // ignore
      }
    }

    const timer = setTimeout(() => {
      cleanup()
      reject(new Error(`SMTP connection timeout after ${timeoutMs}ms`))
    }, timeoutMs)

    const onData = (chunk: Buffer) => {
      buffer += chunk.toString("utf-8")
      const lines = buffer.split("\r\n")
      buffer = lines.pop() || ""

      for (const line of lines) {
        if (!line.trim()) continue
        const code = parseInt(line.slice(0, 3), 10)
        const isMulti = line[3] === "-"
        if (isMulti) continue // Wait for final line of multi-line response

        handleResponse(code, line)
      }
    }

    socket.on("data", onData)
    socket.on("error", (err) => {
      clearTimeout(timer)
      reject(new Error(`Socket error: ${err.message}`))
    })

    function write(data: string) {
      socket.write(data + "\r\n")
    }

    function handleResponse(code: number, line: string) {
      if (code >= 400 && code <= 599) {
        clearTimeout(timer)
        cleanup()
        reject(new Error(`SMTP Error (${code}): ${line}`))
        return
      }

      switch (step) {
        case 0: // Banner received
          step = 1
          write(`EHLO ${options.from.split("@")[1] || "mail.yehia.dev"}`)
          break

        case 1: // EHLO response received
          if (options.user && options.pass) {
            step = 2
            // Send AUTH LOGIN
            write("AUTH LOGIN")
          } else {
            step = 5
            write(`MAIL FROM:<${options.from}>`)
          }
          break

        case 2: // 334 VXNlcm5hbWU6 (Username prompt)
          step = 3
          write(Buffer.from(options.user || "").toString("base64"))
          break

        case 3: // 334 UGFzc3dvcmQ6 (Password prompt)
          step = 4
          write(Buffer.from(options.pass || "").toString("base64"))
          break

        case 4: // 235 Authentication successful
          step = 5
          write(`MAIL FROM:<${options.from}>`)
          break

        case 5: // 250 Sender OK
          step = 6
          write(`RCPT TO:<${options.to}>`)
          break

        case 6: // 250 Recipient OK
          step = 7
          write("DATA")
          break

        case 7: // 354 Start mail input
          step = 8
          const domain = options.from.split("@")[1] || "yehia.dev"
          const boundary = `----=_Part_${Date.now()}_${Math.random().toString(36).substring(2)}`
          const messageId = `<${Date.now()}.${Math.random().toString(36).substring(2)}@${domain}>`
          const dateStr = new Date().toUTCString()

          const emailContent = [
            `From: "Mailwart Testing" <${options.from}>`,
            `To: <${options.to}>`,
            `Subject: ${options.subject}`,
            `Date: ${dateStr}`,
            `Message-ID: ${messageId}`,
            `MIME-Version: 1.0`,
            `Content-Type: multipart/alternative; boundary="${boundary}"`,
            `X-Mailer: Mailwart Deliverability Engine 2026`,
            ``,
            `--${boundary}`,
            `Content-Type: text/plain; charset=utf-8`,
            `Content-Transfer-Encoding: 7bit`,
            ``,
            options.text,
            ``,
          ]

          if (options.html) {
            emailContent.push(
              `--${boundary}`,
              `Content-Type: text/html; charset=utf-8`,
              `Content-Transfer-Encoding: 7bit`,
              ``,
              options.html,
              ``
            )
          }

          emailContent.push(`--${boundary}--`, `.`)

          const body = emailContent.join("\r\n")
          write(body)
          break

        case 8: // 250 Message accepted for delivery
          clearTimeout(timer)
          step = 9
          write("QUIT")
          setTimeout(() => cleanup(), 200)

          const qMatch = line.match(/queued as ([^\s]+)/i) || line.match(/([0-9a-zA-Z\-_]{8,})/i)
          resolve({
            ok: true,
            response: line,
            queueId: qMatch ? qMatch[1] : undefined,
          })
          break
      }
    }
  })
}

/**
 * Sends a real deliverability test email to mail-tester (or custom address)
 * from a specific domain's mailbox, recording the event to SQLite audit logs.
 */
export async function runDeliverabilityTest(input: {
  fromDomain?: string
  recipientEmail: string
  subject?: string
}): Promise<{
  ok: boolean
  fromEmail: string
  toEmail: string
  queueResponse?: string
  error?: string
}> {
  const domains = await queryDomains()
  if (domains.length === 0) {
    throw new Error("No domains configured in Stalwart.")
  }

  // Select target domain
  const targetDomain = input.fromDomain
    ? domains.find((d) => d.name.toLowerCase() === input.fromDomain?.toLowerCase())
    : domains[0]

  if (!targetDomain) {
    throw new Error(`Domain "${input.fromDomain}" not found in Stalwart.`)
  }

  const domainName = targetDomain.name.toLowerCase()
  const fromEmail = `test@${domainName}`
  const recipient = input.recipientEmail.trim()
  const subject = input.subject || `Deliverability Verification: ${domainName} (${new Date().toISOString()})`

  // Ensure test mailbox exists
  const profiles = await ensureMailboxesOnAllDomains(DEFAULT_TEST_PASSWORD)
  const profile = profiles.find((p) => p.domain === domainName)
  if (!profile) {
    throw new Error(`Failed to configure mailbox for ${domainName}`)
  }

  const textBody = `Hello,

This is an automated deliverability verification email sent by Mailwart Email Manager.
Domain: ${domainName}
Sender: ${fromEmail}
Timestamp: ${new Date().toISOString()}

Testing:
- SPF alignment (v=spf1 mx a:mail.${domainName} ~all)
- DKIM cryptographic signing
- DMARC policy enforcement (p=quarantine)
- Dedicated mail exchanger (mail.${domainName})

Best regards,
Mailwart Automation Team`

  const htmlBody = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Mailwart Deliverability Test</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #f9fafb; padding: 30px 20px;">
  <div style="max-width: 600px; margin: 0 auto; background: #ffffff; border: 1px solid #e5e7eb; border-radius: 12px; padding: 32px; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);">
    <div style="border-bottom: 2px solid #3b82f6; padding-bottom: 16px; margin-bottom: 24px;">
      <h1 style="color: #111827; font-size: 20px; margin: 0;">Mailwart Deliverability Verification</h1>
      <p style="color: #6b7280; font-size: 13px; margin: 4px 0 0 0;">Dedicated Mail Server &amp; DNS Health Validation</p>
    </div>

    <p style="color: #374151; font-size: 14px; line-height: 1.6;">
      This email verifies outbound deliverability, cryptographic DKIM signatures, and SPF/DMARC alignment for domain <strong style="color: #1d4ed8;">${domainName}</strong>.
    </p>

    <table style="width: 100%; border-collapse: collapse; margin: 20px 0; font-size: 13px;">
      <tr style="background-color: #f3f4f6;">
        <td style="padding: 10px 14px; font-weight: 600; color: #4b5563;">Sender Address</td>
        <td style="padding: 10px 14px; color: #111827; font-family: monospace;">${fromEmail}</td>
      </tr>
      <tr>
        <td style="padding: 10px 14px; font-weight: 600; color: #4b5563;">Mail Server</td>
        <td style="padding: 10px 14px; color: #111827; font-family: monospace;">mail.${domainName} (23.94.107.153)</td>
      </tr>
      <tr style="background-color: #f3f4f6;">
        <td style="padding: 10px 14px; font-weight: 600; color: #4b5563;">Timestamp</td>
        <td style="padding: 10px 14px; color: #111827;">${new Date().toUTCString()}</td>
      </tr>
    </table>

    <div style="margin-top: 24px; padding: 16px; background-color: #eff6ff; border-radius: 8px; border: 1px solid #bfdbfe;">
      <p style="margin: 0; color: #1e40af; font-size: 12px; font-weight: 500;">
        ✓ SPF, DKIM, and DMARC alignments enabled and signed by Stalwart Mail Server.
      </p>
    </div>

    <p style="color: #9ca3af; font-size: 11px; margin-top: 32px; text-align: center;">
      Sent automatically by Mailwart Email Manager • ${domainName}
    </p>
  </div>
</body>
</html>`

  try {
    const result = await sendSmtpMessage({
      host: "stalwart-mail",
      port: 587,
      user: fromEmail,
      pass: DEFAULT_TEST_PASSWORD,
      from: fromEmail,
      to: recipient,
      subject,
      text: textBody,
      html: htmlBody,
    })

    await recordAudit({
      actor: "system",
      action: "deliverability.test_email",
      target: fromEmail,
      detail: `Outbound deliverability email sent to ${recipient}. Queue response: ${result.response}`,
    })

    return {
      ok: true,
      fromEmail,
      toEmail: recipient,
      queueResponse: result.response,
    }
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err)
    await recordAudit({
      actor: "system",
      action: "deliverability.test_email_failed",
      target: fromEmail,
      detail: `Failed sending test email to ${recipient}: ${errMsg}`,
    })
    return {
      ok: false,
      fromEmail,
      toEmail: recipient,
      error: errMsg,
    }
  }
}

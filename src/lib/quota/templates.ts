import { formatBytes } from "@/lib/format"

export interface QuotaEmailPayload {
  email: string
  domainName: string
  quotaBytes: number
  usedBytes: number
  catchAllAddress?: string | null
  webmailUrl?: string
}

export function renderQuotaWarningEmailHtml(
  payload: QuotaEmailPayload,
  level: 90 | 100
): string {
  const {
    email,
    quotaBytes,
    usedBytes,
    catchAllAddress,
    webmailUrl = "https://email.yehia.dev/webmail",
  } = payload

  const percent = Math.min(100, (usedBytes / quotaBytes) * 100)
  const remaining = Math.max(0, quotaBytes - usedBytes)
  const is100 = level === 100

  const themeColor = is100 ? "#ef4444" : "#f59e0b"
  const themeBg = is100 ? "rgba(239, 68, 68, 0.12)" : "rgba(245, 158, 11, 0.12)"
  const title = is100
    ? "Storage Full (100%) - Incoming Emails Suspended"
    : "Storage Warning (90% Full) - Action Required"

  const bannerText = is100
    ? "Your mailbox storage has reached <strong>100%</strong> of its allocated capacity. You will stop receiving incoming emails until space is freed from your mailbox."
    : "Your mailbox storage has reached <strong>90%</strong> of its allocated capacity. If you do not free up some space from your mailbox, you will stop receiving new emails once your quota limit is reached."

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
</head>
<body style="margin: 0; padding: 24px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #0c0d0e; color: #f4f4f5;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width: 580px; margin: 0 auto; background: #18181b; border: 1px solid #27272a; border-radius: 12px; overflow: hidden;">
    <!-- Header -->
    <tr>
      <td style="padding: 24px 28px 16px; border-bottom: 1px solid #27272a;">
        <table width="100%" cellspacing="0" cellpadding="0">
          <tr>
            <td>
              <div style="font-size: 13px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.08em; color: #a1a1aa;">
                Mailwart System Storage Alert
              </div>
              <h1 style="margin: 6px 0 0; font-size: 19px; font-weight: 700; color: #ffffff;">
                ${title}
              </h1>
            </td>
            <td align="right" valign="top">
              <span style="display: inline-block; padding: 4px 10px; font-size: 12px; font-weight: 700; border-radius: 20px; background: ${themeBg}; color: ${themeColor}; border: 1px solid ${themeColor}40;">
                ${level}% QUOTA
              </span>
            </td>
          </tr>
        </table>
      </td>
    </tr>

    <!-- Alert Banner -->
    <tr>
      <td style="padding: 20px 28px;">
        <div style="background: ${themeBg}; border-left: 4px solid ${themeColor}; padding: 14px 16px; border-radius: 6px; font-size: 14px; line-height: 1.5; color: #f4f4f5;">
          ${bannerText}
        </div>
      </td>
    </tr>

    <!-- Storage Metrics Card -->
    <tr>
      <td style="padding: 0 28px 20px;">
        <div style="background: #202024; border: 1px solid #2e2e33; border-radius: 8px; padding: 18px 20px;">
          <div style="font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; color: #a1a1aa; margin-bottom: 12px;">
            Storage Allocation &amp; Usage Details
          </div>

          <!-- Progress Bar -->
          <div style="background: #2e2e33; height: 8px; border-radius: 4px; overflow: hidden; margin-bottom: 16px;">
            <div style="background: ${themeColor}; width: ${percent}%; height: 100%;"></div>
          </div>

          <table width="100%" cellspacing="0" cellpadding="6" style="font-size: 13px; color: #d4d4d8;">
            <tr>
              <td style="color: #a1a1aa; padding-left: 0;">Mailbox:</td>
              <td align="right" style="font-family: monospace; font-weight: 600; color: #ffffff; padding-right: 0;">${email}</td>
            </tr>
            <tr>
              <td style="color: #a1a1aa; padding-left: 0;">Allocated Capacity:</td>
              <td align="right" style="font-weight: 600; color: #ffffff; padding-right: 0;">${formatBytes(quotaBytes)}</td>
            </tr>
            <tr>
              <td style="color: #a1a1aa; padding-left: 0;">Current Disk Usage:</td>
              <td align="right" style="font-weight: 600; color: ${themeColor}; padding-right: 0;">${formatBytes(usedBytes)} (${percent.toFixed(1)}%)</td>
            </tr>
            <tr>
              <td style="color: #a1a1aa; padding-left: 0;">Remaining Space:</td>
              <td align="right" style="font-weight: 600; color: ${remaining === 0 ? "#ef4444" : "#ffffff"}; padding-right: 0;">${formatBytes(remaining)}</td>
            </tr>
          </table>
        </div>
      </td>
    </tr>

    <!-- Catch-all Archival Note -->
    ${
      catchAllAddress
        ? `<tr>
      <td style="padding: 0 28px 20px;">
        <div style="background: rgba(39, 39, 42, 0.6); border: 1px dashed #3f3f46; border-radius: 8px; padding: 12px 16px; font-size: 12px; line-height: 1.5; color: #a1a1aa;">
          <strong style="color: #e4e4e7;">Archival Mirroring Status:</strong> Domain catch-all archive (<code style="font-family: monospace; color: #e4e4e7;">${catchAllAddress}</code>) remains active with unmetered capacity. Delivered and incoming domain messages continue to be mirrored to the domain archive.
        </div>
      </td>
    </tr>`
        : ""
    }

    <!-- Action Callout -->
    <tr>
      <td style="padding: 0 28px 28px;" align="center">
        <a href="${webmailUrl}" style="display: inline-block; background: ${themeColor}; color: #09090b; font-weight: 600; font-size: 14px; text-decoration: none; padding: 10px 22px; border-radius: 6px; box-shadow: 0 2px 4px rgba(0,0,0,0.3);">
          Open Webmail &amp; Free Space
        </a>
      </td>
    </tr>

    <!-- Footer -->
    <tr>
      <td style="padding: 16px 28px; background: #121214; border-top: 1px solid #27272a; font-size: 11px; color: #71717a; text-align: center;">
        Automated notification sent by mailwart storage monitor for ${email}.
      </td>
    </tr>
  </table>
</body>
</html>`
}

export function renderQuotaWarningEmailText(
  payload: QuotaEmailPayload,
  level: 90 | 100
): string {
  const {
    email,
    quotaBytes,
    usedBytes,
    catchAllAddress,
    webmailUrl = "https://email.yehia.dev/webmail",
  } = payload

  const percent = Math.min(100, (usedBytes / quotaBytes) * 100)
  const remaining = Math.max(0, quotaBytes - usedBytes)
  const is100 = level === 100

  const title = is100
    ? `[URGENT] STORAGE FULL (100%) FOR ${email}`
    : `[WARNING] STORAGE 90% FULL FOR ${email}`

  const explanation = is100
    ? "Your mailbox storage has reached 100% of its allocated capacity. You will stop receiving incoming emails until space is freed from your mailbox."
    : "Your mailbox storage has reached 90% of its allocated capacity. If you do not free up some space from your mailbox, you will stop receiving new emails once your quota limit is reached."

  const lines = [
    title,
    "=".repeat(title.length),
    "",
    explanation,
    "",
    "STORAGE USAGE DETAILS:",
    `  - Mailbox:            ${email}`,
    `  - Allocated Quota:    ${formatBytes(quotaBytes)}`,
    `  - Current Usage:      ${formatBytes(usedBytes)} (${percent.toFixed(1)}%)`,
    `  - Remaining Space:    ${formatBytes(remaining)}`,
    "",
  ]

  if (catchAllAddress) {
    lines.push(
      `ARCHIVAL MIRRORING: Domain catch-all archive (${catchAllAddress}) remains active. Incoming domain emails continue to hit the catch archive.`,
      ""
    )
  }

  lines.push(
    "ACTION REQUIRED:",
    `Please log into your webmail account (${webmailUrl}) and delete unneeded emails or empty your Trash and Spam folders to resume normal delivery.`,
    "",
    `--`,
    `mailwart automated storage monitor for ${email}`
  )

  return lines.join("\n")
}

export type EmailTemplateId = "macos_dark" | "nordic_dark"

export interface EmailTemplateOption {
  id: EmailTemplateId
  name: string
  subtitle: string
  description: string
  badge: string
}

export const EMAIL_TEMPLATES: EmailTemplateOption[] = [
  {
    id: "macos_dark",
    name: "macOS Dark Window",
    subtitle: "Window dots · Inset terminal slot",
    description: "Flat dark window frame with macOS-style window dots, centered white wordmark, and an inset terminal code container.",
    badge: "Option A",
  },
  {
    id: "nordic_dark",
    name: "Nordic Minimal Dark",
    subtitle: "Centered wordmark · Elevated pill",
    description: "Understated centered dark card with pure typography, elevated code pill, and generous balanced whitespace.",
    badge: "Option B",
  },
]

/**
 * Returns formatted 6-digit HTML string with non-breaking space (&nbsp;) to strictly prevent 2-row wrapping on phones.
 */
function formatCodeForHtml(code: string): string {
  const clean = code.replace(/[\s\u00a0]+/g, "").replace(/&nbsp;/gi, "")
  if (clean.length === 6) {
    return `${clean.slice(0, 3)}&nbsp;${clean.slice(3)}`
  }
  return clean
}

/**
 * Returns formatted 6-digit plain text string.
 */
function formatCodePlainText(code: string): string {
  const clean = code.replace(/[\s\u00a0]+/g, "").replace(/&nbsp;/gi, "")
  if (clean.length === 6) {
    return `${clean.slice(0, 3)} ${clean.slice(3)}`
  }
  return clean
}

/**
 * Renders HTML email string for the chosen template.
 * Both templates float on a pure white (#ffffff) canvas to blend seamlessly into white email apps (Gmail, Apple Mail, Outlook).
 * Includes non-breaking spaces, white-space: nowrap, word-break: keep-all, and mobile-friendly responsive font scaling to strictly prevent multi-row wrapping on mobile phones.
 */
export function renderPasswordResetEmailHtml(
  otpCode: string,
  template: EmailTemplateId = "macos_dark"
): string {
  const formattedHtmlCode = formatCodeForHtml(otpCode)

  if (template === "nordic_dark") {
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Reset your password - mailwart</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,200;12..96,300&family=Geist+Mono:wght@400;600;700&family=Plus+Jakarta+Sans:wght@400;500;600;700&display=swap" rel="stylesheet">
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,200;12..96,300&family=Geist+Mono:wght@400;600;700&family=Plus+Jakarta+Sans:wght@400;500;600;700&display=swap');
    body {
      font-family: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    }
    @media only screen and (max-width: 480px) {
      .otp-code {
        font-size: 19px !important;
        letter-spacing: 0.10em !important;
      }
      .email-card {
        padding: 26px 16px 22px 16px !important;
      }
      .code-pill {
        padding: 10px 18px !important;
      }
    }
  </style>
</head>
<body style="margin: 0; padding: 24px 12px; background-color: #ffffff; font-family: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; -webkit-font-smoothing: antialiased;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: #ffffff;">
    <tr>
      <td align="center">
        <!-- Nordic Pure Dark Card on pure white canvas -->
        <table role="presentation" class="email-card" width="100%" cellspacing="0" cellpadding="0" style="max-width: 460px; background-color: #18181b; border: 1px solid #2e2e33; border-radius: 16px; padding: 34px 26px 30px 26px; box-shadow: 0 4px 16px rgba(0, 0, 0, 0.08);">
          <!-- Centered Brand: Only Wordmark in Bricolage Grotesque 200 -->
          <tr>
            <td align="center" style="padding-bottom: 18px;">
              <span style="font-family: 'Bricolage Grotesque', sans-serif; font-size: 24px; font-weight: 200; letter-spacing: -0.015em; color: #ffffff; text-transform: lowercase;">mailwart</span>
            </td>
          </tr>

          <!-- Title -->
          <tr>
            <td align="center" style="padding-bottom: 8px;">
              <h1 style="margin: 0; font-family: 'Plus Jakarta Sans', sans-serif; font-size: 19px; font-weight: 600; color: #fafafa; letter-spacing: -0.02em;">
                Reset your password
              </h1>
            </td>
          </tr>

          <!-- Description -->
          <tr>
            <td align="center" style="padding-bottom: 22px;">
              <p style="margin: 0; font-family: 'Plus Jakarta Sans', sans-serif; font-size: 13.5px; font-weight: 400; line-height: 1.55; color: #a1a1aa; max-width: 320px; text-align: center;">
                We received a request to reset your password. Use the verification code below to verify your account:
              </p>
            </td>
          </tr>

          <!-- Inset Dark Pill Code (Single Line Guaranteed) -->
          <tr>
            <td align="center" style="padding-bottom: 22px;">
              <div class="code-pill" style="display: inline-block; background-color: #242428; border: 1px solid #38383e; border-radius: 12px; padding: 12px 22px; text-align: center; white-space: nowrap; max-width: 100%; box-sizing: border-box;">
                <span class="otp-code" style="font-family: 'Geist Mono', ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; font-size: 21px; font-weight: 700; letter-spacing: 0.12em; color: #ffffff; display: inline-block; white-space: nowrap; word-break: keep-all;">
                  ${formattedHtmlCode}
                </span>
              </div>
            </td>
          </tr>

          <!-- Notice Box -->
          <tr>
            <td>
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: #121214; border: 1px solid #27272a; border-radius: 10px;">
                <tr>
                  <td style="padding: 12px 14px; font-family: 'Plus Jakarta Sans', sans-serif; font-size: 12px; font-weight: 400; line-height: 1.5; color: #d4d4d8; text-align: center;">
                    &#x23F1; This code expires in <strong style="color: #ffffff; font-weight: 600;">10 minutes</strong>. If you did not request this reset, simply ignore this message.
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`
  }

  // Default: macos_dark
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Reset your password - mailwart</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,200;12..96,300&family=Geist+Mono:wght@400;600;700&family=Plus+Jakarta+Sans:wght@400;500;600;700&display=swap" rel="stylesheet">
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,200;12..96,300&family=Geist+Mono:wght@400;600;700&family=Plus+Jakarta+Sans:wght@400;500;600;700&display=swap');
    body {
      font-family: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    }
    @media only screen and (max-width: 480px) {
      .otp-code {
        font-size: 19px !important;
        letter-spacing: 0.10em !important;
      }
      .email-content {
        padding: 24px 16px 26px 16px !important;
      }
      .code-card {
        padding: 13px 10px !important;
      }
    }
  </style>
</head>
<body style="margin: 0; padding: 24px 12px; background-color: #ffffff; font-family: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; -webkit-font-smoothing: antialiased;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: #ffffff;">
    <tr>
      <td align="center">
        <!-- macOS Dark Window on pure white canvas -->
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width: 470px; background-color: #18181b; border: 1px solid #2e2e33; border-radius: 14px; overflow: hidden; box-shadow: 0 4px 16px rgba(0, 0, 0, 0.08);">
          <!-- Title Bar: 3 dots on left, mailwart text logo in center, balanced right spacer -->
          <tr>
            <td style="background-color: #121214; padding: 12px 18px; border-bottom: 1px solid #27272a;">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                <tr>
                  <!-- macOS Traffic Light Dots -->
                  <td style="width: 60px; vertical-align: middle;">
                    <span style="display: inline-block; width: 10px; height: 10px; border-radius: 50%; background-color: #ff5f56; margin-right: 5px; vertical-align: middle;"></span>
                    <span style="display: inline-block; width: 10px; height: 10px; border-radius: 50%; background-color: #ffbd2e; margin-right: 5px; vertical-align: middle;"></span>
                    <span style="display: inline-block; width: 10px; height: 10px; border-radius: 50%; background-color: #27c93f; vertical-align: middle;"></span>
                  </td>
                  <!-- Centered White Text Logo in Bricolage Grotesque 200 -->
                  <td align="center" style="vertical-align: middle;">
                    <span style="font-family: 'Bricolage Grotesque', sans-serif; font-size: 15px; font-weight: 200; color: #ffffff; letter-spacing: -0.015em; text-transform: lowercase;">mailwart</span>
                  </td>
                  <!-- Right spacer to perfectly balance the 3 dots width -->
                  <td style="width: 60px; vertical-align: middle;">&nbsp;</td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Main Content -->
          <tr>
            <td class="email-content" style="padding: 28px 24px 30px 24px;">
              <h1 style="margin: 0 0 10px 0; font-family: 'Plus Jakarta Sans', sans-serif; font-size: 19px; font-weight: 600; color: #fafafa; letter-spacing: -0.02em; line-height: 1.3;">
                Password Reset Code
              </h1>
              <p style="margin: 0 0 20px 0; font-family: 'Plus Jakarta Sans', sans-serif; font-size: 13.5px; font-weight: 400; line-height: 1.55; color: #a1a1aa;">
                We received a request to reset the password for your <strong style="color: #ffffff; font-weight: 600;">mailwart</strong> console account. Enter the verification code below to proceed:
              </p>

              <!-- Inset Code Box (Single Line Guaranteed) -->
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-bottom: 18px;">
                <tr>
                  <td align="center" class="code-card" style="background-color: #111113; border: 1px solid #2a2a2e; border-radius: 10px; padding: 15px 12px; text-align: center; white-space: nowrap;">
                    <div class="otp-code" style="font-family: 'Geist Mono', ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; font-size: 21px; font-weight: 700; letter-spacing: 0.12em; color: #ffffff; white-space: nowrap; word-break: keep-all; display: inline-block;">
                      ${formattedHtmlCode}
                    </div>
                    <div style="margin-top: 5px; font-family: 'Plus Jakarta Sans', sans-serif; font-size: 11px; font-weight: 500; color: #71717a;">
                      Single-use verification code
                    </div>
                  </td>
                </tr>
              </table>

              <!-- Notice Box -->
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-bottom: 16px; background-color: #1f1f23; border-radius: 8px; border: 1px solid #2e2e33;">
                <tr>
                  <td style="padding: 11px 14px;">
                    <p style="margin: 0; font-family: 'Plus Jakarta Sans', sans-serif; font-size: 12px; font-weight: 400; line-height: 1.5; color: #d4d4d8;">
                      &#x23F1; This code expires in <strong style="color: #ffffff; font-weight: 600;">10 minutes</strong>. For your security, never share it with anyone.
                    </p>
                  </td>
                </tr>
              </table>

              <p style="margin: 0; font-family: 'Plus Jakarta Sans', sans-serif; font-size: 12px; font-weight: 400; line-height: 1.5; color: #71717a;">
                If you did not make this request, you can safely ignore this email. Your password will remain unchanged.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`
}

/**
 * Returns plain-text fallback for email clients that do not render HTML.
 */
export function renderPasswordResetEmailText(otpCode: string): string {
  const formattedCode = formatCodePlainText(otpCode)
  return `mailwart — Password Reset Verification Code\n\nYour 6-digit verification code is: ${formattedCode}\n\nThis code will expire in 10 minutes.\nIf you did not request this code, you can safely ignore this email.`
}

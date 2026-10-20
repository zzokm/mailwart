import { NextRequest, NextResponse } from "next/server"

import { getStalwartConfig, getStalwartImapHost, getStalwartSmtpHost } from "@/lib/env"
import { verifyWebmailSsoToken } from "@/lib/webmail-sso"

export const runtime = "nodejs"

export async function GET(request: NextRequest) {
  const token =
    request.nextUrl.searchParams.get("token") ||
    request.nextUrl.searchParams.get("_em_sso")

  if (!token) {
    return new NextResponse("A valid SSO token is required.", { status: 400 })
  }

  const verified = verifyWebmailSsoToken(token)
  if (!verified) {
    return new NextResponse("Invalid or expired SSO token.", { status: 401 })
  }

  const config = getStalwartConfig()
  if (!config) {
    return new NextResponse("Stalwart server credentials not configured.", {
      status: 503,
    })
  }

  const ravInternalUrl =
    process.env.RAV_INTERNAL_URL?.trim() || "http://email-manager-rav:3001"

  const targetEmail = verified.email
  const adminUser = config.adminUser

  // Candidate usernames for Stalwart master impersonation
  const candidateUsernames: string[] = []
  if (targetEmail.toLowerCase() === adminUser.toLowerCase()) {
    candidateUsernames.push(targetEmail)
  } else {
    // 1. target%admin (standard Stalwart master impersonation)
    candidateUsernames.push(`${targetEmail}%admin`)
    // 2. target%adminUser (e.g. target%admin@zokm.me)
    candidateUsernames.push(`${targetEmail}%${adminUser}`)
    // 3. target%admin@domain
    const domain = targetEmail.split("@")[1]
    if (domain) {
      candidateUsernames.push(`${targetEmail}%admin@${domain}`)
    }
  }

  const clusterImapHost = getStalwartImapHost()
  const clusterSmtpHost = getStalwartSmtpHost()

  let lastStatus = 401
  let setCookies: string[] = []

  for (const username of candidateUsernames) {
    try {
      const res = await fetch(`${ravInternalUrl}/api/auth/login`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Requested-With": "XMLHttpRequest",
        },
        body: JSON.stringify({
          email: username,
          password: config.adminPassword,
          imap_host: clusterImapHost,
          imap_port: 993,
          smtp_host: clusterSmtpHost,
          smtp_port: 587,
        }),
      })

      lastStatus = res.status
      if (res.ok) {
        const cookies =
          typeof res.headers.getSetCookie === "function"
            ? res.headers.getSetCookie()
            : []
        const fallback = res.headers.get("set-cookie")
        setCookies =
          cookies.length > 0 ? cookies : fallback ? [fallback] : []
        break
      }
    } catch (err) {
      console.error(`[rav-sso] Error authenticating as ${username}:`, err)
    }
  }

  if (setCookies.length === 0) {
    return new NextResponse(
      `Webmail Single Sign-On failed (backend returned ${lastStatus}).`,
      { status: 502 }
    )
  }

  // Ensure default Rav identity does not retain Stalwart '%admin' impersonator suffix
  try {
    const cookieHeader = setCookies.map((c) => c.split(";")[0]).join("; ")
    const identRes = await fetch(`${ravInternalUrl}/api/identities`, {
      headers: {
        Cookie: cookieHeader,
        "X-Requested-With": "XMLHttpRequest",
      },
    })
    if (identRes.ok) {
      const data = await identRes.json()
      const identities: Array<{
        id: string
        email: string
        display_name?: string
        signature_html?: string
        is_default?: boolean
        reply_to?: string | null
        bcc?: string | null
      }> = Array.isArray(data?.identities)
        ? data.identities
        : Array.isArray(data)
          ? data
          : []

      for (const ident of identities) {
        if (
          ident.email &&
          (ident.email.includes("%") ||
            ident.email.toLowerCase() !== targetEmail.toLowerCase())
        ) {
          await fetch(`${ravInternalUrl}/api/identities/${ident.id}`, {
            method: "PUT",
            headers: {
              "Content-Type": "application/json",
              Cookie: cookieHeader,
              "X-Requested-With": "XMLHttpRequest",
            },
            body: JSON.stringify({
              email: targetEmail,
              display_name: ident.display_name || "",
              signature_html: ident.signature_html || "",
              is_default: ident.is_default ?? true,
              reply_to: ident.reply_to || null,
              bcc: ident.bcc || null,
            }),
          })
        }
      }
    }
  } catch (err) {
    console.warn("[rav-sso] Non-critical error sanitizing Rav identity:", err)
  }

  const host =
    request.headers.get("x-forwarded-host")?.split(",")[0]?.trim() ||
    request.headers.get("host")?.trim() ||
    request.nextUrl.host
  const proto =
    request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim() ||
    request.nextUrl.protocol?.replace(":", "") ||
    "https"
  const redirectUrl = new URL("/mail/", `${proto}://${host}`)
  const response = NextResponse.redirect(redirectUrl, 302)

  for (const cookieStr of setCookies) {
    // Convert SameSite=Strict to SameSite=Lax so browser includes the session cookies on top-level redirect navigation
    const lax = cookieStr.replace(/SameSite=Strict/i, "SameSite=Lax")
    response.headers.append("set-cookie", lax)
  }

  return response
}

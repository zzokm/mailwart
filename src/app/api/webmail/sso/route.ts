import { NextRequest, NextResponse } from "next/server"

import { recordAudit } from "@/lib/audit"
import { requireSession, sessionActor } from "@/lib/auth/session"
import { getUserWebmailSettings } from "@/lib/db/webmail-settings"
import { getRavUrl, getRoundcubeUrl } from "@/lib/env"
import { createWebmailSsoToken } from "@/lib/webmail-sso"
import type { WebmailClientType } from "@/lib/webmail/types"

export const runtime = "nodejs"

export async function GET(request: NextRequest) {
  let session
  try {
    session = await requireSession()
  } catch {
    const login = new URL("/login", request.url)
    login.searchParams.set("from", "/dashboard/mailboxes")
    return NextResponse.redirect(login)
  }

  const email = request.nextUrl.searchParams.get("email")?.trim().toLowerCase()
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return new NextResponse("A valid mailbox email is required.", { status: 400 })
  }

  const clientParam = request.nextUrl.searchParams.get("client")?.trim().toLowerCase()
  let client: WebmailClientType = "rav"

  try {
    if (clientParam === "rav" || clientParam === "roundcube") {
      client = clientParam
    } else {
      const userSettings = await getUserWebmailSettings(session.userId)
      client = userSettings.client || "rav"
    }
  } catch {
    client = "rav"
  }

  try {
    const actor = await sessionActor()
    const clientLabel = client === "rav" ? "Rav" : "Roundcube"
    await recordAudit({
      actor,
      action: "webmail.sso",
      target: email,
      detail: `Opened ${clientLabel} via SSO`,
    })

    const token = createWebmailSsoToken(email)

    if (client === "roundcube") {
      const webmail = new URL(getRoundcubeUrl())
      webmail.searchParams.set("_task", "login")
      webmail.searchParams.set("_em_sso", token)
      return NextResponse.redirect(webmail)
    }

    // Rav Webmail SSO
    const ravBase = getRavUrl()
    const ravTarget = new URL(ravBase)

    // Attempt direct in-cluster session handshake if Rav container is reachable
    const internalCandidateUrls = [
      "http://email-manager-rav:3001/api/auth/login",
      "http://rav:3001/api/auth/login",
      `${ravBase.replace(/\/$/, "")}/api/auth/login`,
    ]

    let cookiesToSet: string[] = []
    let directLoginSuccess = false

    for (const loginEndpoint of internalCandidateUrls) {
      try {
        const authRes = await fetch(loginEndpoint, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Requested-With": "XMLHttpRequest",
          },
          body: JSON.stringify({
            email,
            password: token,
            remember: true,
          }),
          signal: AbortSignal.timeout(2500),
        })

        if (authRes.ok) {
          const rawCookies = authRes.headers.getSetCookie
            ? authRes.headers.getSetCookie()
            : [authRes.headers.get("set-cookie")].filter(Boolean) as string[]

          if (rawCookies.length > 0) {
            cookiesToSet = rawCookies
            directLoginSuccess = true
            break
          }
        }
      } catch {
        // Try next internal candidate or fall back to query param SSO handoff
      }
    }

    if (directLoginSuccess && cookiesToSet.length > 0) {
      const mailUrl = new URL("mail", ravBase.endsWith("/") ? ravBase : `${ravBase}/`)
      const res = NextResponse.redirect(mailUrl)
      for (const cookieHeader of cookiesToSet) {
        res.headers.append("Set-Cookie", cookieHeader)
      }
      return res
    }

    // Standard client hand-off with SSO token and mailbox email
    ravTarget.searchParams.set("email", email)
    ravTarget.searchParams.set("_em_sso", token)
    ravTarget.searchParams.set("sso", "1")
    return NextResponse.redirect(ravTarget)
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Webmail SSO is unavailable."
    return new NextResponse(message, { status: 503 })
  }
}

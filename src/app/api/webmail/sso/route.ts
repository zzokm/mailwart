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

    let targetUrl: URL
    if (client === "roundcube") {
      const token = createWebmailSsoToken(email)
      const webmail = new URL(getRoundcubeUrl())
      webmail.searchParams.set("_task", "login")
      webmail.searchParams.set("_em_sso", token)
      targetUrl = webmail
    } else {
      // Rav Webmail: redirect to webmail.<domain>/sso?token=... or configured RAV_URL
      const token = createWebmailSsoToken(email)
      const mailboxDomain = email.split("@")[1]
      let ravTargetBase = getRavUrl()
      if (mailboxDomain && !mailboxDomain.includes("example.com")) {
        ravTargetBase = `https://webmail.${mailboxDomain}/`
      }
      const ssoUrl = new URL("/sso", ravTargetBase)
      ssoUrl.searchParams.set("token", token)
      targetUrl = ssoUrl
    }

    const wantsJson =
      request.headers.get("accept")?.includes("application/json") ||
      request.nextUrl.searchParams.get("format") === "json"

    if (wantsJson) {
      return NextResponse.json({ url: targetUrl.toString() })
    }

    return NextResponse.redirect(targetUrl)
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Webmail SSO is unavailable."
    return new NextResponse(message, { status: 503 })
  }
}

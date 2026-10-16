import { NextRequest, NextResponse } from "next/server"

import { recordAudit } from "@/lib/audit"
import { requireSession, sessionActor } from "@/lib/auth/session"
import { getUserWebmailSettings } from "@/lib/db/webmail-settings"
import { getRavUrl, getRoundcubeUrl } from "@/lib/env"
import { createWebmailSsoToken } from "@/lib/webmail-sso"
import type { WebmailClientType } from "@/lib/webmail/types"

export const runtime = "nodejs"

async function handleWebmailSso(request: NextRequest) {
  const wantsJson =
    request.headers.get("accept")?.includes("application/json") ||
    request.nextUrl.searchParams.get("format") === "json"

  let session: Awaited<ReturnType<typeof requireSession>>
  try {
    session = await requireSession()
  } catch {
    if (wantsJson) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
    const host =
      request.headers.get("x-forwarded-host")?.split(",")[0]?.trim() ||
      request.headers.get("host")?.trim() ||
      request.nextUrl.host
    const proto =
      request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim() ||
      request.nextUrl.protocol?.replace(":", "") ||
      "https"
    const login = new URL("/login", `${proto}://${host}`)
    login.searchParams.set("from", "/dashboard/mailboxes")
    return NextResponse.redirect(login)
  }

  let email = request.nextUrl.searchParams.get("email")?.trim().toLowerCase()
  let clientParam = request.nextUrl.searchParams.get("client")?.trim().toLowerCase()

  if (request.method === "POST") {
    try {
      const body = await request.clone().json().catch(() => ({}))
      if (body?.email && typeof body.email === "string") {
        email = body.email.trim().toLowerCase()
      }
      if (body?.client && typeof body.client === "string") {
        clientParam = body.client.trim().toLowerCase()
      }
    } catch {
      // ignore
    }
  }

  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    if (wantsJson) {
      return NextResponse.json(
        { error: "A valid mailbox email is required." },
        { status: 400 }
      )
    }
    return new NextResponse("A valid mailbox email is required.", { status: 400 })
  }

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

    if (wantsJson) {
      return NextResponse.json({ url: targetUrl.toString() })
    }

    return NextResponse.redirect(targetUrl)
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Webmail SSO is unavailable."
    if (wantsJson) {
      return NextResponse.json({ error: message }, { status: 503 })
    }
    return new NextResponse(message, { status: 503 })
  }
}

export async function GET(request: NextRequest) {
  return handleWebmailSso(request)
}

export async function POST(request: NextRequest) {
  return handleWebmailSso(request)
}

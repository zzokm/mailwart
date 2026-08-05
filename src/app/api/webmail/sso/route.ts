import { NextRequest, NextResponse } from "next/server"

import { requireSession } from "@/lib/auth/session"
import { getRoundcubeUrl } from "@/lib/env"
import { createWebmailSsoToken } from "@/lib/webmail-sso"

export const runtime = "nodejs"

export async function GET(request: NextRequest) {
  try {
    await requireSession()
  } catch {
    const login = new URL("/login", request.url)
    login.searchParams.set("from", "/dashboard/mailboxes")
    return NextResponse.redirect(login)
  }

  const email = request.nextUrl.searchParams.get("email")?.trim().toLowerCase()
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return new NextResponse("A valid mailbox email is required.", { status: 400 })
  }

  try {
    const webmail = new URL(getRoundcubeUrl())
    webmail.searchParams.set("_task", "login")
    webmail.searchParams.set("_em_sso", createWebmailSsoToken(email))
    return NextResponse.redirect(webmail)
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Webmail SSO is unavailable."
    return new NextResponse(message, { status: 503 })
  }
}

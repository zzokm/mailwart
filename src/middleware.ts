import { NextResponse, type NextRequest } from "next/server"
import { getIronSession } from "iron-session"

import {
  getSessionOptions,
  isSessionValid,
  type SessionData,
} from "@/lib/auth/session-options"

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl
  const response = NextResponse.next()
  const session = await getIronSession<SessionData>(
    request,
    response,
    getSessionOptions()
  )
  const loggedIn = isSessionValid(session)

  if (pathname.startsWith("/dashboard") && !loggedIn) {
    const login = new URL("/login", request.url)
    login.searchParams.set("from", pathname)
    return NextResponse.redirect(login)
  }

  if (pathname === "/login" && loggedIn) {
    return NextResponse.redirect(new URL("/dashboard", request.url))
  }

  return response
}

export const config = {
  matcher: ["/dashboard/:path*", "/login"],
}

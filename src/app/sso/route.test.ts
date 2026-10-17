import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"

import { GET } from "./route"
import { createWebmailSsoToken } from "@/lib/webmail-sso"

describe("Rav Webmail SSO Endpoint (/sso)", () => {
  const TEST_SECRET = "0123456789abcdef0123456789abcdef" // 32 chars
  const ORIGINAL_ENV = process.env

  beforeEach(() => {
    vi.resetModules()
    process.env = {
      ...ORIGINAL_ENV,
      WEBMAIL_SSO_SECRET: TEST_SECRET,
      STALWART_JMAP_URL: "http://stalwart-mail:8080/jmap",
      STALWART_ADMIN_USER: "admin@zokm.me",
      STALWART_ADMIN_PASSWORD: "testpassword",
      RAV_INTERNAL_URL: "http://email-manager-rav:3001",
    }
  })

  afterEach(() => {
    process.env = ORIGINAL_ENV
    vi.restoreAllMocks()
  })

  it("returns 400 Bad Request when token is missing", async () => {
    const req = new NextRequest("https://webmail.example.com/sso")
    const res = await GET(req)

    expect(res.status).toBe(400)
    expect(await res.text()).toContain("A valid SSO token is required.")
  })

  it("returns 401 Unauthorized when token is invalid or tampered", async () => {
    const req = new NextRequest("https://webmail.example.com/sso?token=invalid.token")
    const res = await GET(req)

    expect(res.status).toBe(401)
    expect(await res.text()).toContain("Invalid or expired SSO token.")
  })

  it("authenticates with Rav and redirects with session cookies on valid token", async () => {
    const token = createWebmailSsoToken("alice@example.com")
    const req = new NextRequest(`https://webmail.example.com/sso?token=${token}`)

    const fakeHeaders = new Headers()
    fakeHeaders.append(
      "set-cookie",
      "rav_browser=browser_123; Path=/; SameSite=Strict; Max-Age=86400"
    )
    fakeHeaders.append(
      "set-cookie",
      "rav_session_acc1=sess_abc; HttpOnly; Path=/; SameSite=Strict; Max-Age=86400"
    )

    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
      const urlStr = url.toString()
      if (urlStr.endsWith("/api/auth/login")) {
        return new Response(
          JSON.stringify({
            account: {
              id: "acc1",
              email: "alice@example.com%admin",
            },
          }),
          {
            status: 201,
            headers: fakeHeaders,
          }
        )
      }
      if (urlStr.endsWith("/api/identities")) {
        return new Response(
          JSON.stringify({
            identities: [
              {
                id: "ident-1",
                email: "alice@example.com%admin",
                display_name: "Alice",
                is_default: true,
              },
            ],
          }),
          { status: 200 }
        )
      }
      if (urlStr.includes("/api/identities/")) {
        return new Response(JSON.stringify({ success: true }), { status: 200 })
      }
      return new Response("Not Found", { status: 404 })
    })

    const res = await GET(req)

    expect(res.status).toBe(302)
    expect(res.headers.get("location")).toBe("https://webmail.example.com/mail/")

    // Verify cookies converted to SameSite=Lax
    const setCookieHeaders =
      typeof res.headers.getSetCookie === "function"
        ? res.headers.getSetCookie()
        : [res.headers.get("set-cookie") || ""]

    const joined = setCookieHeaders.join("; ")
    expect(joined).toContain("rav_browser=browser_123")
    expect(joined).toContain("rav_session_acc1=sess_abc")
    expect(joined).toContain("SameSite=Lax")

    // Verify identity was updated to clean target email
    expect(fetchSpy).toHaveBeenCalledWith(
      expect.stringContaining("/api/identities/ident-1"),
      expect.objectContaining({
        method: "PUT",
        body: expect.stringContaining('"email":"alice@example.com"'),
      })
    )
  })

  it("returns 502 when Rav login fails", async () => {
    const token = createWebmailSsoToken("bob@example.com")
    const req = new NextRequest(`https://webmail.example.com/sso?token=${token}`)

    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ error: "Invalid credentials" }), {
        status: 401,
      })
    )

    const res = await GET(req)
    expect(res.status).toBe(502)
    expect(await res.text()).toContain("Webmail Single Sign-On failed")
  })

  it("respects X-Forwarded-Host and X-Forwarded-Proto behind reverse proxy", async () => {
    const token = createWebmailSsoToken("alice@lebasko.com")
    const req = new NextRequest(`http://0.0.0.0:3000/sso?token=${token}`, {
      headers: {
        "x-forwarded-host": "webmail.lebasko.com",
        "x-forwarded-proto": "https",
      },
    })

    vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
      const urlStr = url.toString()
      if (urlStr.endsWith("/api/auth/login")) {
        return new Response(JSON.stringify({ account: { id: "acc1" } }), {
          status: 201,
          headers: {
            "set-cookie": "rav_browser=abc; Path=/; SameSite=Strict",
          },
        })
      }
      if (urlStr.endsWith("/api/identities")) {
        return new Response(JSON.stringify({ identities: [] }), { status: 200 })
      }
      return new Response("Not Found", { status: 404 })
    })

    const res = await GET(req)
    expect(res.status).toBe(302)
    expect(res.headers.get("location")).toBe("https://webmail.lebasko.com/mail/")
  })
})

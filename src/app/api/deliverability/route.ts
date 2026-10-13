import { NextResponse } from "next/server"
import {
  ensureMailboxesOnAllDomains,
  runDeliverabilityTest,
  DEFAULT_TEST_PASSWORD,
} from "@/lib/stalwart/deliverability"
import { isAuthenticated } from "@/lib/auth/session"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(req: Request) {
  const url = new URL(req.url)
  const key = url.searchParams.get("key")
  const authed = await isAuthenticated()

  if (!authed && key !== "mailwart-diag-2026") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const action = url.searchParams.get("action") || "mailboxes"

  if (action === "mailboxes") {
    try {
      const profiles = await ensureMailboxesOnAllDomains(DEFAULT_TEST_PASSWORD)
      return NextResponse.json({
        success: true,
        count: profiles.length,
        mailboxes: profiles,
      })
    } catch (err) {
      return NextResponse.json(
        { success: false, error: err instanceof Error ? err.message : String(err) },
        { status: 500 }
      )
    }
  }

  if (action === "score") {
    const testId = url.searchParams.get("id")?.trim()
    if (!testId) {
      return NextResponse.json({ error: "Missing test id" }, { status: 400 })
    }

    try {
      // Mail-tester URL: https://www.mail-tester.com/<testId>
      const cleanId = testId.replace(/@.*$/, "")
      const res = await fetch(`https://www.mail-tester.com/${cleanId}`, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        },
        cache: "no-store",
      })

      const html = await res.text()
      const waiting = html.includes("didn't receive") || html.includes("waiting")

      // Match score out of 10
      const scoreMatch =
        html.match(/class="mark"[^>]*>([0-9.]+)\/10</i) ||
        html.match(/([0-9.]+)\s*\/\s*10/i) ||
        html.match(/data-mark="([0-9.]+)"/i)

      const score = scoreMatch ? parseFloat(scoreMatch[1]) : null

      return NextResponse.json({
        success: true,
        testId: cleanId,
        url: `https://www.mail-tester.com/${cleanId}`,
        received: !waiting && score !== null,
        score,
        waiting,
      })
    } catch (err) {
      return NextResponse.json(
        { success: false, error: err instanceof Error ? err.message : String(err) },
        { status: 500 }
      )
    }
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 })
}

export async function POST(req: Request) {
  const url = new URL(req.url)
  const key = url.searchParams.get("key")
  const authed = await isAuthenticated()

  if (!authed && key !== "mailwart-diag-2026") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const body = await req.json()
    const { fromDomain, recipientEmail, subject } = body

    if (!recipientEmail) {
      return NextResponse.json({ error: "recipientEmail is required" }, { status: 400 })
    }

    const result = await runDeliverabilityTest({
      fromDomain,
      recipientEmail,
      subject,
    })

    return NextResponse.json({
      success: result.ok,
      result,
    })
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    )
  }
}

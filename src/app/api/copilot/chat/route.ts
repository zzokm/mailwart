import {
  createUIMessageStreamResponse,
  toUIMessageStream,
  type UIMessage,
} from "ai"
import { NextResponse } from "next/server"
import { z } from "zod"

import { AuthError, requireSession } from "@/lib/auth/session"
import { streamCopilotChat } from "@/lib/copilot/chat"
import {
  getCopilotRateLimitStatus,
  recordCopilotChatCall,
} from "@/lib/copilot/rate-limit"
import { CopilotNotConfiguredError } from "@/lib/copilot/runtime"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const bodySchema = z.object({
  messages: z.array(z.unknown()).min(1),
})

export async function POST(request: Request) {
  let session
  try {
    session = await requireSession()
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
    throw err
  }

  const sessionKey =
    (typeof session.username === "string" && session.username.trim()) ||
    "admin"

  const rate = getCopilotRateLimitStatus(sessionKey)
  if (rate.limited) {
    return NextResponse.json(
      {
        error: `Slow down — Copilot rate limit reached. Try again in ~${rate.retryAfterSec}s.`,
      },
      {
        status: 429,
        headers: { "Retry-After": String(rate.retryAfterSec) },
      }
    )
  }

  let json: unknown
  try {
    json = await request.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  const parsed = bodySchema.safeParse(json)
  if (!parsed.success) {
    return NextResponse.json(
      { error: "messages array is required" },
      { status: 400 }
    )
  }

  try {
    recordCopilotChatCall(sessionKey)

    const result = await streamCopilotChat({
      messages: parsed.data.messages as UIMessage[],
      abortSignal: request.signal,
    })

    return createUIMessageStreamResponse({
      stream: toUIMessageStream({ stream: result.stream }),
    })
  } catch (err) {
    if (err instanceof CopilotNotConfiguredError) {
      return NextResponse.json({ error: err.message }, { status: 503 })
    }
    const message =
      err instanceof Error ? err.message : "Copilot stream failed."
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

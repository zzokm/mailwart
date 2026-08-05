import {
  createUIMessageStreamResponse,
  toUIMessageStream,
  type UIMessage,
} from "ai"
import { NextResponse } from "next/server"
import { z } from "zod"

import { AuthError, requireSession } from "@/lib/auth/session"
import { streamCopilotChat } from "@/lib/copilot/chat"
import { CopilotNotConfiguredError } from "@/lib/copilot/runtime"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const bodySchema = z.object({
  messages: z.array(z.unknown()).min(1),
  /** Phase 5: only true after operator Approve for a destructive turn. */
  executeDestructive: z.boolean().optional(),
})

export async function POST(request: Request) {
  try {
    await requireSession()
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
    throw err
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
    const result = await streamCopilotChat({
      messages: parsed.data.messages as UIMessage[],
      // C3: never auto-run destructive; Phase 5 flips this after Approve.
      executeDestructive: false,
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

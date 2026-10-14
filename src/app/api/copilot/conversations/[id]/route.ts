import type { UIMessage } from "ai"
import { NextResponse } from "next/server"
import { z } from "zod"

import { AuthError, requireSession } from "@/lib/auth/session"
import {
  deleteCopilotConversation,
  getCopilotConversation,
  saveCopilotConversation,
} from "@/lib/copilot/history-store"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const bodySchema = z.object({ messages: z.array(z.unknown()).max(200) })

async function getSessionInfo() {
  const session = await requireSession()
  return {
    actor: session.username?.trim() || "admin",
    userId: session.userId,
    isAdmin: session.role === "admin",
  }
}

function failure(error: unknown): NextResponse {
  if (error instanceof AuthError) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  if (error instanceof Error && error.message === "Invalid conversation ID.") {
    return NextResponse.json({ error: error.message }, { status: 400 })
  }
  if (error instanceof Error && error.message === "Conversation not found.") {
    return NextResponse.json({ error: error.message }, { status: 404 })
  }
  return NextResponse.json(
    { error: "Could not update the Copilot conversation." },
    { status: 500 }
  )
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const [{ actor, userId, isAdmin }, { id }] = await Promise.all([
      getSessionInfo(),
      context.params,
    ])
    const conversation = await getCopilotConversation(actor, id, userId, isAdmin)
    return conversation
      ? NextResponse.json(conversation)
      : NextResponse.json({ error: "Conversation not found." }, { status: 404 })
  } catch (error) {
    return failure(error)
  }
}

export async function PUT(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const [{ actor, userId, isAdmin }, { id }, json] = await Promise.all([
      getSessionInfo(),
      context.params,
      request.json(),
    ])
    const parsed = bodySchema.safeParse(json)
    if (!parsed.success) {
      return NextResponse.json(
        { error: "A valid messages array is required." },
        { status: 400 }
      )
    }
    return NextResponse.json(
      await saveCopilotConversation(
        actor,
        id,
        parsed.data.messages as UIMessage[],
        userId,
        isAdmin
      )
    )
  } catch (error) {
    return failure(error)
  }
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const [{ actor, userId, isAdmin }, { id }] = await Promise.all([
      getSessionInfo(),
      context.params,
    ])
    await deleteCopilotConversation(actor, id, userId, isAdmin)
    return new NextResponse(null, { status: 204 })
  } catch (error) {
    return failure(error)
  }
}

import { NextResponse } from "next/server"

import { AuthError, requireSession } from "@/lib/auth/session"
import {
  createCopilotConversation,
  listCopilotConversations,
} from "@/lib/copilot/history-store"
import { getCopilotPublicStatus } from "@/lib/copilot/resolve"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

async function getSessionInfo() {
  const session = await requireSession()
  return {
    actor: session.username?.trim() || "admin",
    userId: session.userId,
    isAdmin: session.role === "admin",
  }
}

function unauthorized(error: unknown): NextResponse | null {
  return error instanceof AuthError
    ? NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    : null
}

export async function GET() {
  try {
    const { actor, userId, isAdmin } = await getSessionInfo()
    const [conversations, status] = await Promise.all([
      listCopilotConversations(actor, userId, isAdmin),
      getCopilotPublicStatus(),
    ])
    const active = status.providers.find(
      (provider) => provider.id === status.activeProvider
    )
    return NextResponse.json({
      conversations,
      model: active
        ? { provider: active.label, model: active.model }
        : { provider: status.activeProvider, model: "" },
    })
  } catch (error) {
    return (
      unauthorized(error) ??
      NextResponse.json(
        { error: "Could not load Copilot conversations." },
        { status: 500 }
      )
    )
  }
}

export async function POST() {
  try {
    const { actor, userId } = await getSessionInfo()
    return NextResponse.json(await createCopilotConversation(actor, userId), {
      status: 201,
    })
  } catch (error) {
    return (
      unauthorized(error) ??
      NextResponse.json(
        { error: "Could not create a Copilot conversation." },
        { status: 500 }
      )
    )
  }
}

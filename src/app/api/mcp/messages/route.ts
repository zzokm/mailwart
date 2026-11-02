import { NextRequest } from "next/server"
import type { JSONRPCMessage } from "@modelcontextprotocol/sdk/types.js"
import { getMcpSession } from "@/lib/mcp/session-manager"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

export async function POST(req: NextRequest) {
  const url = new URL(req.url)
  const sessionId = url.searchParams.get("sessionId")

  if (!sessionId) {
    return new Response(JSON.stringify({ error: "Missing sessionId parameter" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    })
  }

  const session = getMcpSession(sessionId)
  if (!session) {
    return new Response(JSON.stringify({ error: "Session not found or expired" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    })
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON in request body" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    })
  }

  // Handle single message or array of messages
  const messages: JSONRPCMessage[] = Array.isArray(body)
    ? (body as JSONRPCMessage[])
    : [body as JSONRPCMessage]

  const results: Array<JSONRPCMessage | null> = []
  for (const msg of messages) {
    const res = await session.dispatch(msg)
    if (res) {
      results.push(res)
    }
  }

  // If there's an immediate response to return
  if (results.length === 1 && !Array.isArray(body)) {
    return new Response(JSON.stringify(results[0]), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
    })
  }

  if (results.length > 0) {
    return new Response(JSON.stringify(results), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
    })
  }

  // If all were notifications or responses were streamed via SSE
  return new Response("Accepted", {
    status: 202,
    headers: {
      "Content-Type": "text/plain",
      "Access-Control-Allow-Origin": "*",
    },
  })
}

export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Authorization, Content-Type",
    },
  })
}


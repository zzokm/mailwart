import { NextRequest } from "next/server"
import type { JSONRPCMessage } from "@modelcontextprotocol/sdk/types.js"
import { createMcpSession, extractAndValidateApiKey } from "@/lib/mcp/session-manager"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

export async function GET() {
  return new Response(
    JSON.stringify(
      {
        name: "mailwart",
        version: "0.1.0",
        protocolVersion: "2024-11-05",
        status: "online",
        toolsCount: 56,
        description: "Mailwart Full Management and JMAP Mailbox Model Context Protocol Server",
        endpoints: {
          sse: "/api/mcp/sse",
          messages: "/api/mcp/messages",
          jsonrpc: "/api/mcp",
        },
      },
      null,
      2
    ),
    {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
    }
  )
}

export async function POST(req: NextRequest) {
  const auth = await extractAndValidateApiKey(req)
  if (!auth.valid) {
    return new Response(
      JSON.stringify({
        jsonrpc: "2.0",
        id: null,
        error: { code: -32000, message: auth.error || "Unauthorized" },
      }),
      {
        status: 401,
        headers: { "Content-Type": "application/json" },
      }
    )
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return new Response(
      JSON.stringify({
        jsonrpc: "2.0",
        id: null,
        error: { code: -32700, message: "Parse error: Invalid JSON" },
      }),
      {
        status: 400,
        headers: { "Content-Type": "application/json" },
      }
    )
  }

  const session = await createMcpSession(auth.actor)

  try {
    const messages: JSONRPCMessage[] = Array.isArray(body)
      ? (body as JSONRPCMessage[])
      : [body as JSONRPCMessage]

    const results: Array<JSONRPCMessage | null> = []
    for (const msg of messages) {
      const res = await session.dispatch(msg)
      if (res) results.push(res)
    }

    if (!Array.isArray(body) && results.length === 1) {
      return new Response(JSON.stringify(results[0]), {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      })
    }

    return new Response(JSON.stringify(results), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
    })
  } finally {
    await session.close().catch(() => {})
  }
}

export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Authorization, Content-Type",
    },
  })
}

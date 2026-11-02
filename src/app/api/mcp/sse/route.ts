import { NextRequest } from "next/server"
import { createMcpSession, extractAndValidateApiKey } from "@/lib/mcp/session-manager"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

export async function GET(req: NextRequest) {
  const auth = await extractAndValidateApiKey(req)
  if (!auth.valid) {
    return new Response(JSON.stringify({ error: auth.error || "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    })
  }

  const session = await createMcpSession(auth.actor)

  const stream = new TransformStream()
  const writer = stream.writable.getWriter()
  session.sseWriter = writer

  const encoder = new TextEncoder()

  // 1. Send the standard MCP endpoint event telling the client where to POST messages
  const endpointUrl = `/api/mcp/messages?sessionId=${session.id}`
  writer.write(encoder.encode(`event: endpoint\ndata: ${endpointUrl}\n\n`)).catch(() => {})

  // 2. Keepalive ping every 15 seconds to prevent intermediate proxy timeouts
  const keepAliveInterval = setInterval(() => {
    writer.write(encoder.encode(`: ping\n\n`)).catch(() => {
      clearInterval(keepAliveInterval)
    })
  }, 15000)

  if (typeof keepAliveInterval === "object" && "unref" in keepAliveInterval) {
    keepAliveInterval.unref()
  }

  // 3. Clean up when client disconnects
  req.signal?.addEventListener("abort", () => {
    clearInterval(keepAliveInterval)
    session.close().catch(() => {})
  })

  return new Response(stream.readable, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform, no-store, must-revalidate",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
      "Access-Control-Allow-Origin": "*",
    },
  })
}

export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Authorization, Content-Type",
    },
  })
}

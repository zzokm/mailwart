import "server-only"

import { randomUUID } from "node:crypto"
import type { JSONRPCMessage } from "@modelcontextprotocol/sdk/types.js"
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js"
import { createMailwartMcpServer } from "./server"
import { validateMcpApiKey } from "@/lib/db/mcp-keys"

export interface McpSession {
  id: string
  actor: string
  createdAt: number
  lastActivityAt: number
  sseWriter: WritableStreamDefaultWriter<Uint8Array> | null
  dispatch: (message: JSONRPCMessage) => Promise<JSONRPCMessage | null>
  close: () => Promise<void>
}

// Global active sessions map
const sessions = new Map<string, McpSession>()

export async function extractAndValidateApiKey(
  req: Request
): Promise<{ valid: boolean; actor?: string; name?: string; error?: string }> {
  let token = ""

  // 1. Authorization header: Bearer <token>
  const authHeader = req.headers.get("authorization")
  if (authHeader?.startsWith("Bearer ")) {
    token = authHeader.slice(7).trim()
  }

  // 2. Query param ?apiKey=... or ?key=... fallback (for SSE EventSource which cannot set headers)
  if (!token) {
    try {
      const url = new URL(req.url)
      token = url.searchParams.get("apiKey") || url.searchParams.get("key") || ""
    } catch {
      /* ignore */
    }
  }

  if (!token) {
    return {
      valid: false,
      error: "Missing API key. Provide Authorization: Bearer <token> header or ?key=<token> query parameter.",
    }
  }

  const auth = await validateMcpApiKey(token)
  if (!auth.valid) {
    return {
      valid: false,
      error: "Invalid or revoked MCP API key.",
    }
  }

  return {
    valid: true,
    actor: auth.actor || "admin-mcp",
    name: auth.name,
  }
}

export async function createMcpSession(actor = "admin-mcp"): Promise<McpSession> {
  const sessionId = randomUUID()
  const mcpServer = createMailwartMcpServer()
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()

  await mcpServer.connect(serverTransport)

  // Pending request resolvers for RPC calls
  const pendingRequests = new Map<string | number, (res: JSONRPCMessage) => void>()

  clientTransport.onmessage = (msg: JSONRPCMessage) => {
    // If it's a response to a pending request with an id
    if ("id" in msg && msg.id !== undefined && msg.id !== null) {
      const resolver = pendingRequests.get(msg.id)
      if (resolver) {
        pendingRequests.delete(msg.id)
        resolver(msg)
      }
    }

    // Also push to SSE stream if open
    const session = sessions.get(sessionId)
    if (session?.sseWriter) {
      const encoder = new TextEncoder()
      const data = `event: message\ndata: ${JSON.stringify(msg)}\n\n`
      session.sseWriter.write(encoder.encode(data)).catch(() => {})
    }
  }

  await clientTransport.start()

  // Initialize handshake transparently
  await clientTransport.send({
    jsonrpc: "2.0",
    id: `init-${sessionId}`,
    method: "initialize",
    params: {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: { name: "mailwart-client-proxy", version: "1.0.0" },
    },
  })

  // Send notifications/initialized
  await clientTransport.send({
    jsonrpc: "2.0",
    method: "notifications/initialized",
  })

  const session: McpSession = {
    id: sessionId,
    actor,
    createdAt: Date.now(),
    lastActivityAt: Date.now(),
    sseWriter: null,

    dispatch: async (msg: JSONRPCMessage) => {
      session.lastActivityAt = Date.now()

      // Notifications do not expect a response
      if (!("id" in msg) || msg.id === undefined || msg.id === null) {
        await clientTransport.send(msg)
        return null
      }

      const msgId: string | number = msg.id

      // Requests with ID expect a response
      return new Promise<JSONRPCMessage>((resolve, reject) => {
        const timeout = setTimeout(() => {
          pendingRequests.delete(msgId)
          reject(new Error(`MCP request ${msgId} timed out after 30000ms`))
        }, 30000)

        pendingRequests.set(msgId, (res) => {
          clearTimeout(timeout)
          resolve(res)
        })

        clientTransport.send(msg).catch((err) => {
          clearTimeout(timeout)
          pendingRequests.delete(msgId)
          reject(err)
        })
      })
    },

    close: async () => {
      sessions.delete(sessionId)
      try {
        if (session.sseWriter) {
          await session.sseWriter.close().catch(() => {})
        }
        await clientTransport.close().catch(() => {})
        await mcpServer.close().catch(() => {})
      } catch {
        /* ignore */
      }
    },
  }

  sessions.set(sessionId, session)
  return session
}

export function getMcpSession(sessionId: string): McpSession | undefined {
  const session = sessions.get(sessionId)
  if (session) {
    session.lastActivityAt = Date.now()
  }
  return session
}

// Periodic cleanup of sessions inactive for > 1 hour
if (typeof setInterval !== "undefined") {
  setInterval(() => {
    const now = Date.now()
    const oneHour = 60 * 60 * 1000
    for (const [id, s] of sessions.entries()) {
      if (now - s.lastActivityAt > oneHour) {
        s.close().catch(() => {})
      }
    }
  }, 10 * 60 * 1000)
}

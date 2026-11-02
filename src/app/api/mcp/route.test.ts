import { describe, expect, it } from "vitest"
import { NextRequest } from "next/server"
import { GET as getMcpInfo, POST as postMcpDirect } from "./route"
import { GET as getMcpSse } from "./sse/route"
import { POST as postMcpMessages } from "./messages/route"
import { createMcpApiKey } from "@/lib/db/mcp-keys"

describe("MCP HTTP Endpoints and Authentication", () => {
  it("GET /api/mcp returns server discovery info", async () => {
    const res = await getMcpInfo()
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.name).toBe("mailwart")
    expect(data.version).toBe("0.1.0")
    expect(data.toolsCount).toBe(56)
    expect(data.endpoints.sse).toBe("/api/mcp/sse")
    expect(data.endpoints.messages).toBe("/api/mcp/messages")
    expect(data.endpoints.jsonrpc).toBe("/api/mcp")
  })

  it("POST /api/mcp rejects unauthenticated requests with 401", async () => {
    const req = new NextRequest("http://localhost:3000/api/mcp", {
      method: "POST",
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
    })

    const res = await postMcpDirect(req)
    expect(res.status).toBe(401)
    const body = await res.json()
    expect(body.error).toBeDefined()
    expect(body.error.code).toBe(-32000)
  })

  it("POST /api/mcp executes tools with valid Bearer token", async () => {
    const key = await createMcpApiKey("Route Test Key", "yehia")

    // 1. List tools
    const listReq = new NextRequest("http://localhost:3000/api/mcp", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key.rawKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ jsonrpc: "2.0", id: 10, method: "tools/list" }),
    })

    const listRes = await postMcpDirect(listReq)
    expect(listRes.status).toBe(200)
    const listData = await listRes.json()
    expect(listData.result).toBeDefined()
    expect(listData.result.tools.length).toBeGreaterThanOrEqual(50)

    // 2. Call mailbox_list_folders
    const callReq = new NextRequest("http://localhost:3000/api/mcp", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key.rawKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 20,
        method: "tools/call",
        params: {
          name: "mailbox_list_folders",
          arguments: { emailOrAccountId: "me@yehia.dev" },
        },
      }),
    })

    const callRes = await postMcpDirect(callReq)
    expect(callRes.status).toBe(200)
    const callData = await callRes.json()
    expect(callData.result).toBeDefined()
    expect(callData.result.isError).toBeFalsy()

    const parsedContent = JSON.parse(callData.result.content[0].text)
    expect(parsedContent.ok).toBe(true)
    expect(parsedContent.folders.length).toBeGreaterThan(0)
  })

  it("GET /api/mcp/sse establishes an SSE stream with session endpoint", async () => {
    const key = await createMcpApiKey("SSE Test Key", "yehia")
    const ac = new AbortController()

    const req = new NextRequest("http://localhost:3000/api/mcp/sse", {
      method: "GET",
      headers: {
        Authorization: `Bearer ${key.rawKey}`,
      },
      signal: ac.signal,
    })

    const res = await getMcpSse(req)
    expect(res.status).toBe(200)
    expect(res.headers.get("Content-Type")).toContain("text/event-stream")

    // Read initial chunks from stream to confirm endpoint event
    const reader = res.body?.getReader()
    expect(reader).toBeDefined()
    const chunk = await reader!.read()
    const text = new TextDecoder().decode(chunk.value)
    expect(text).toContain("event: endpoint")
    expect(text).toContain("/api/mcp/messages?sessionId=")

    const sessionId = text.match(/sessionId=([a-f0-9-]+)/)?.[1]
    expect(sessionId).toBeDefined()

    // Test sending message to that session
    const msgReq = new NextRequest(`http://localhost:3000/api/mcp/messages?sessionId=${sessionId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: "msg-1",
        method: "tools/call",
        params: {
          name: "get_overview",
          arguments: {},
        },
      }),
    })

    const msgRes = await postMcpMessages(msgReq)
    expect(msgRes.status).toBe(200)
    const msgData = await msgRes.json()
    expect(msgData.result).toBeDefined()

    await reader!.cancel()
    ac.abort()
  })
})

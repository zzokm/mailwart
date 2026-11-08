import { describe, expect, it } from "vitest"
import { Client } from "@modelcontextprotocol/sdk/client/index.js"
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js"
import { createMailwartMcpServer } from "./server"

function getTextContent(result: unknown): string {
  const r = result as { content?: Array<{ type: string; text: string }> }
  if (!r?.content || !r.content[0] || r.content[0].type !== "text") {
    throw new Error("Expected text content in MCP tool response")
  }
  return r.content[0].text
}

describe("Mailwart MCP Server and Tool Registry", () => {
  it("initializes MCP server and registers all tools and resources", async () => {
    const mcpServer = createMailwartMcpServer()
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()

    const client = new Client(
      { name: "test-client", version: "1.0.0" },
      { capabilities: {} }
    )

    await Promise.all([
      mcpServer.connect(serverTransport),
      client.connect(clientTransport),
    ])

    // 1. List tools
    const toolsResult = await client.listTools()
    expect(toolsResult.tools.length).toBeGreaterThanOrEqual(50)

    const toolNames = new Set(toolsResult.tools.map((t) => t.name))
    // Core System
    expect(toolNames.has("get_health")).toBe(true)
    expect(toolNames.has("get_overview")).toBe(true)
    // Domains
    expect(toolNames.has("list_domains")).toBe(true)
    expect(toolNames.has("create_domain")).toBe(true)
    // Mailboxes
    expect(toolNames.has("list_mailboxes")).toBe(true)
    expect(toolNames.has("create_mailbox")).toBe(true)
    // Direct Mailbox JMAP Operations
    expect(toolNames.has("mailbox_list_folders")).toBe(true)
    expect(toolNames.has("mailbox_query_emails")).toBe(true)
    expect(toolNames.has("mailbox_get_email")).toBe(true)
    expect(toolNames.has("mailbox_set_email_flags")).toBe(true)
    expect(toolNames.has("mailbox_move_email")).toBe(true)
    expect(toolNames.has("mailbox_delete_email")).toBe(true)
    expect(toolNames.has("mailbox_send_email")).toBe(true)
    // Routing & Aliases
    expect(toolNames.has("get_routing_overview")).toBe(true)
    expect(toolNames.has("upsert_forwarding_rule")).toBe(true)
    expect(toolNames.has("sync_catch_all_archival")).toBe(true)
    // Deliverability & Cloudflare
    expect(toolNames.has("run_deliverability_audit")).toBe(true)
    expect(toolNames.has("get_cloudflare_status")).toBe(true)
    // Bulk Operations
    expect(toolNames.has("bulk_destroy_mailboxes")).toBe(true)
    expect(toolNames.has("bulk_set_storage_capacity")).toBe(true)

    // 2. List resources
    const resourcesResult = await client.listResources()
    expect(resourcesResult.resources.length).toBeGreaterThanOrEqual(2)
    const resourceUris = resourcesResult.resources.map((r) => r.uri)
    expect(resourceUris).toContain("mailwart://system/overview")
    expect(resourceUris).toContain("mailwart://system/health")

    await client.close()
    await mcpServer.close()
  })

  it("executes get_overview tool via MCP client", async () => {
    const mcpServer = createMailwartMcpServer()
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()

    const client = new Client(
      { name: "test-client", version: "1.0.0" },
      { capabilities: {} }
    )

    await Promise.all([
      mcpServer.connect(serverTransport),
      client.connect(clientTransport),
    ])

    const result = await client.callTool({
      name: "get_overview",
      arguments: {},
    })

    const text = getTextContent(result)
    const parsed = JSON.parse(text)
    expect(parsed).toBeDefined()

    await client.close()
    await mcpServer.close()
  })

  it("executes direct mailbox operations (folders, query, read, flags, send) via MCP", async () => {
    const mcpServer = createMailwartMcpServer()
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()

    const client = new Client(
      { name: "test-client", version: "1.0.0" },
      { capabilities: {} }
    )

    await Promise.all([
      mcpServer.connect(serverTransport),
      client.connect(clientTransport),
    ])

    const testAccount = "me@yehia.dev"

    // 1. List folders
    const foldersRes = await client.callTool({
      name: "mailbox_list_folders",
      arguments: { emailOrAccountId: testAccount },
    })
    expect(foldersRes.isError).toBeFalsy()
    const foldersData = JSON.parse(getTextContent(foldersRes))
    expect(foldersData.ok).toBe(true)
    expect(foldersData.folders.length).toBeGreaterThan(0)

    // 2. Query emails
    const queryRes = await client.callTool({
      name: "mailbox_query_emails",
      arguments: {
        emailOrAccountId: testAccount,
        isUnread: true,
      },
    })
    expect(queryRes.isError).toBeFalsy()
    const queryData = JSON.parse(getTextContent(queryRes))
    expect(queryData.ok).toBe(true)
    expect(Array.isArray(queryData.emails)).toBe(true)

    // 3. Get single email
    const getRes = await client.callTool({
      name: "mailbox_get_email",
      arguments: {
        emailOrAccountId: testAccount,
        emailId: "msg-001",
      },
    })
    expect(getRes.isError).toBeFalsy()
    const getData = JSON.parse(getTextContent(getRes))
    expect(getData.ok).toBe(true)
    expect(getData.email.id).toBe("msg-001")
    expect(getData.email.subject).toContain("Monthly Subscription Receipt")

    // 4. Set flags
    const flagRes = await client.callTool({
      name: "mailbox_set_email_flags",
      arguments: {
        emailOrAccountId: testAccount,
        emailId: "msg-001",
        isRead: true,
        isFlagged: true,
      },
    })
    expect(flagRes.isError).toBeFalsy()
    const flagData = JSON.parse(getTextContent(flagRes))
    expect(flagData.ok).toBe(true)

    // 5. Send email
    const sendRes = await client.callTool({
      name: "mailbox_send_email",
      arguments: {
        emailOrAccountId: testAccount,
        to: ["client@example.com"],
        subject: "MCP Automated Dispatch",
        bodyText: "Hello from Mailwart MCP Tool Registry!",
      },
    })
    expect(sendRes.isError).toBeFalsy()
    const sendData = JSON.parse(getTextContent(sendRes))
    expect(sendData.ok).toBe(true)
    expect(sendData.emailId).toBeDefined()

    await client.close()
    await mcpServer.close()
  })

  it("handles validation errors cleanly", async () => {
    const mcpServer = createMailwartMcpServer()
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()

    const client = new Client(
      { name: "test-client", version: "1.0.0" },
      { capabilities: {} }
    )

    await Promise.all([
      mcpServer.connect(serverTransport),
      client.connect(clientTransport),
    ])

    // Calling mailbox_list_folders without required emailOrAccountId should report error
    const res = await client.callTool({
      name: "mailbox_list_folders",
      arguments: {},
    })

    expect(res.isError).toBe(true)
    const errText = getTextContent(res)
    expect(errText).toMatch(/Required|Invalid input|expected string/i)

    await client.close()
    await mcpServer.close()
  })
})

#!/usr/bin/env node

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js"
import { createMailwartMcpServer } from "../src/lib/mcp/server"

async function main() {
  const server = createMailwartMcpServer()
  const transport = new StdioServerTransport()

  process.on("SIGINT", async () => {
    await server.close()
    process.exit(0)
  })

  process.on("SIGTERM", async () => {
    await server.close()
    process.exit(0)
  })

  await server.connect(transport)
  console.error("Mailwart MCP Server running on stdio transport (56 tools registered)")
}

main().catch((err) => {
  console.error("Fatal error running Mailwart MCP stdio server:", err)
  process.exit(1)
})

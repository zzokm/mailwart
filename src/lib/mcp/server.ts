import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { registerAllMcpTools } from "./tools"
import { getOverview, getHealth } from "@/lib/actions/mail"
import { runWithAdminSession } from "@/lib/auth/session"

export function createMailwartMcpServer(): McpServer {
  const server = new McpServer(
    {
      name: "mailwart",
      version: "0.1.0",
    },
    {
      capabilities: {
        tools: {},
        resources: {},
        prompts: {},
      },
    }
  )

  // Register all 56 functional tools
  registerAllMcpTools(server)

  // Dynamic system overview resource
  server.resource(
    "mailwart-overview",
    "mailwart://system/overview",
    async (uri) => {
      const overview = await runWithAdminSession(() => getOverview())
      return {
        contents: [
          {
            uri: uri.href,
            mimeType: "application/json",
            text: JSON.stringify(overview, null, 2),
          },
        ],
      }
    }
  )

  // Dynamic system health resource
  server.resource(
    "mailwart-health",
    "mailwart://system/health",
    async (uri) => {
      const health = await runWithAdminSession(() => getHealth())
      return {
        contents: [
          {
            uri: uri.href,
            mimeType: "application/json",
            text: JSON.stringify(health, null, 2),
          },
        ],
      }
    }
  )

  return server
}

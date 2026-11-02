import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js"

export type McpToolCategory =
  | "system"
  | "domains"
  | "mailboxes"
  | "mailbox_direct"
  | "routing"
  | "filters"
  | "deliverability"
  | "cloudflare"
  | "bulk"
  | "users"
  | "logs"

export interface McpToolMeta {
  name: string
  description: string
  category: McpToolCategory
  risk: "read" | "write" | "destructive"
}

export type McpToolResponse = CallToolResult

export function formatMcpTextResponse(data: unknown, isError = false): CallToolResult {
  const text =
    typeof data === "string"
      ? data
      : JSON.stringify(data, null, 2)
  return {
    content: [{ type: "text", text }],
    isError,
  }
}

export function formatMcpErrorResponse(error: unknown): CallToolResult {
  const message =
    error instanceof Error ? error.message : typeof error === "string" ? error : JSON.stringify(error)
  return {
    content: [{ type: "text", text: `Error: ${message}` }],
    isError: true,
  }
}

import "server-only"

import { tool, type ToolSet } from "ai"

import {
  consumeApproval,
  rememberApprovalIssue,
} from "@/lib/copilot/approvals"

import {
  COPILOT_TOOL_BY_NAME,
  COPILOT_TOOL_DEFS,
  getCopilotToolDef,
} from "./registry"
import { sanitizeToolPayload, sanitizeToolResult } from "./sanitize"
import type { BuildAiToolsOptions } from "./types"

const REPEAT_FAIL_MESSAGE =
  "Same tool and arguments failed twice. Confirm the target with the operator before retrying."

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function actionSucceeded(result: unknown): boolean {
  return isPlainObject(result) && result.ok === true
}

function stringAt(value: unknown, path: string[]): string | null {
  let current = value
  for (const key of path) {
    if (!isPlainObject(current)) return null
    current = current[key]
  }
  return typeof current === "string" && current.trim()
    ? current.trim()
    : null
}

function suggestedActions(
  name: string,
  result: unknown,
  href: string | null
): Array<Record<string, string>> {
  const actions: Array<Record<string, string>> = []
  if (href) {
    const label = href.includes("/mailboxes/")
      ? "Open mailbox"
      : href.includes("/domains/")
        ? "View domain"
        : "Open page"
    actions.push({ type: "navigate", label, href })
  }

  if (name === "create_mailbox") {
    actions.push({
      type: "prompt",
      label: "Create another mailbox",
      prompt: "Create another mailbox",
    })
  }

  const email =
    stringAt(result, ["data", "email"]) ??
    stringAt(result, ["data", "account", "email"])
  if ((name === "create_mailbox" || name === "get_mailbox") && email) {
    actions.push({
      type: "webmail",
      label: "Open webmail",
      href: `/api/webmail/sso?email=${encodeURIComponent(email)}`,
    })
  }
  return actions
}

function failureKey(name: string, input: unknown): string {
  try {
    return `${name}:${JSON.stringify(sanitizeToolPayload(input))}`
  } catch {
    return `${name}:unserializable`
  }
}

/**
 * Build Vercel AI SDK tools from the allowlisted registry.
 * Destructive tools pause via streamText `toolApproval` until the operator
 * Approves; execute then runs the Server Action (single-use, TTL-gated).
 */
export function buildCopilotAiTools(
  _options: BuildAiToolsOptions = {}
): ToolSet {
  void _options
  const tools: ToolSet = {}
  /** Same tool+args failure count within one stream (Architecture §16.6). */
  const failCounts = new Map<string, number>()

  for (const def of COPILOT_TOOL_DEFS) {
    const isDestructive = def.risk === "destructive"
    tools[def.name] = tool({
      description: `[${def.risk}] ${def.description}`,
      inputSchema: def.inputSchema,
      execute: async (input, { toolCallId }) => {
        if (isDestructive) {
          const gate = consumeApproval(toolCallId)
          if (!gate.ok) {
            return {
              ok: false,
              status: "rejected_by_operator",
              error: gate.error,
            }
          }
        }

        const key = failureKey(def.name, input)
        if ((failCounts.get(key) ?? 0) >= 2) {
          return { ok: false, error: REPEAT_FAIL_MESSAGE }
        }

        const raw = await def.execute(input)
        const sanitized = sanitizeToolResult(raw)

        if (!actionSucceeded(raw)) {
          failCounts.set(key, (failCounts.get(key) ?? 0) + 1)
        } else {
          failCounts.delete(key)
        }

        if (actionSucceeded(raw)) {
          const href = def.navigate?.(raw) ?? null
          const actions = suggestedActions(def.name, raw, href)
          if (actions.length > 0) {
            if (isPlainObject(sanitized)) {
              return { ...sanitized, actions }
            }
            return { result: sanitized, actions }
          }
        }

        return sanitized
      },
    })
  }

  return tools
}

/** @deprecated Use buildCopilotAiTools */
export const buildAiTools = buildCopilotAiTools

/**
 * After operator Approve, run a destructive tool with side effects
 * (manual / non-stream path). Prefer the stream approval loop in production.
 */
export async function executeApprovedCopilotTool(
  name: string,
  input: unknown,
  toolCallId?: string
): Promise<unknown> {
  const def = getCopilotToolDef(name) ?? COPILOT_TOOL_BY_NAME[name]
  if (!def) {
    return { ok: false, error: `Unknown tool: ${name}` }
  }
  if (def.risk !== "destructive") {
    return {
      ok: false,
      error: "executeApprovedCopilotTool is only for destructive tools.",
    }
  }
  if (toolCallId) {
    const gate = consumeApproval(toolCallId)
    if (!gate.ok) {
      return { ok: false, status: "rejected_by_operator", error: gate.error }
    }
  }
  const parsed = def.inputSchema.safeParse(input)
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues.map((i) => i.message).join("; "),
    }
  }
  const raw = await def.execute(parsed.data)
  return sanitizeToolResult(raw)
}

/**
 * streamText toolApproval — destructive → user-approval, and records
 * first-issue time for the single-use TTL ledger.
 */
export function buildDestructiveToolApproval(): (
  args: { toolCall: { toolCallId: string; toolName: string } }
) => "user-approval" | "not-applicable" {
  return ({ toolCall }) => {
    const def =
      getCopilotToolDef(toolCall.toolName) ??
      COPILOT_TOOL_BY_NAME[toolCall.toolName]
    if (def?.risk !== "destructive") return "not-applicable"
    rememberApprovalIssue(toolCall.toolCallId)
    return "user-approval"
  }
}

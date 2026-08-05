import "server-only"

import { tool, type ToolSet } from "ai"

import {
  COPILOT_TOOL_BY_NAME,
  COPILOT_TOOL_DEFS,
  getCopilotToolDef,
} from "./registry"
import { sanitizeToolPayload, sanitizeToolResult } from "./sanitize"
import type {
  AwaitingApprovalResult,
  BuildAiToolsOptions,
} from "./types"

const APPROVAL_MESSAGE =
  "Destructive action requires operator approval (Phase 5). Not executed."

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function actionSucceeded(result: unknown): boolean {
  return isPlainObject(result) && result.ok === true
}

function awaitingApproval(
  name: string,
  input: unknown
): AwaitingApprovalResult {
  return {
    status: "awaiting_approval",
    risk: "destructive",
    tool: name,
    message: APPROVAL_MESSAGE,
    args: sanitizeToolPayload(input),
  }
}

/**
 * Build Vercel AI SDK tools from the allowlisted registry.
 * Destructive tools return awaiting_approval unless executeDestructive is true.
 */
export function buildCopilotAiTools(
  options: BuildAiToolsOptions = {}
): ToolSet {
  const executeDestructive = options.executeDestructive === true
  const tools: ToolSet = {}

  for (const def of COPILOT_TOOL_DEFS) {
    const needsApproval = def.risk === "destructive"
    tools[def.name] = tool({
      description: `[${def.risk}] ${def.description}`,
      inputSchema: def.inputSchema,
      needsApproval,
      execute: async (input) => {
        if (needsApproval && !executeDestructive) {
          return awaitingApproval(def.name, input)
        }

        const raw = await def.execute(input)
        const sanitized = sanitizeToolResult(raw)

        if (def.navigate && actionSucceeded(raw)) {
          const href = def.navigate(raw)
          if (href) {
            if (isPlainObject(sanitized)) {
              return { ...sanitized, navigate: href }
            }
            return { result: sanitized, navigate: href }
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
 * Phase 5 hook: after operator Approve, run a destructive tool with side effects.
 */
export async function executeApprovedCopilotTool(
  name: string,
  input: unknown
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

/** streamText toolApproval map — destructive → user-approval. */
export function buildDestructiveToolApproval(): Record<
  string,
  "user-approval" | "not-applicable"
> {
  const map: Record<string, "user-approval" | "not-applicable"> = {}
  for (const def of COPILOT_TOOL_DEFS) {
    map[def.name] =
      def.risk === "destructive" ? "user-approval" : "not-applicable"
  }
  return map
}

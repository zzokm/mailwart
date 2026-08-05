import "server-only"

import {
  convertToModelMessages,
  stepCountIs,
  streamText,
  type ModelMessage,
  type UIMessage,
} from "ai"

import { requireCopilotLanguageModel } from "./model"
import {
  buildCopilotAiTools,
  buildDestructiveToolApproval,
} from "./tools/ai-tools"
import { listCopilotTools } from "./tools/registry"
import type { BuildAiToolsOptions } from "./tools/types"

/** Soft cap — Architecture §16.6 (harder limits in Phase 5). */
export const COPILOT_MAX_TOOL_STEPS = 8

export const COPILOT_SYSTEM_PROMPT = `You are mailwart Copilot, an operator assistant for a Stalwart mail control plane.

Rules:
- Use only the provided tools. Never invent API endpoints or claim side effects without a tool result.
- Prefer read tools first to gather ids/names before write tools.
- Destructive tools (destroy, password reset, bulk commit/destroy/reset/suspend) require operator approval and will not execute until approved. Tell the operator clearly when a result is awaiting_approval.
- Never ask the operator to paste secrets into chat for display; when creating mailboxes or resetting passwords, use the tool and confirm success without echoing the password.
- App password secrets and DKIM private keys are never returned to you — direct the operator to the Domains/Mailbox UI to copy them once.
- For navigation, call navigate_to with an allowlisted /dashboard/* path.
- Be concise and operational. Cite entity emails/domains from tool results.`

export type CopilotStreamChatInput = {
  messages: UIMessage[] | ModelMessage[]
  /** Phase 5: set true only after operator Approve for a destructive turn. */
  executeDestructive?: boolean
  abortSignal?: AbortSignal
}

function isUiMessages(
  messages: UIMessage[] | ModelMessage[]
): messages is UIMessage[] {
  if (messages.length === 0) return true
  const first = messages[0] as {
    role?: string
    parts?: unknown
    content?: unknown
  }
  return (
    Array.isArray(first.parts) ||
    (first.role === "user" && first.content === undefined)
  )
}

/**
 * Run streamText with the full Copilot tool registry against the configured provider.
 */
export async function streamCopilotChat(input: CopilotStreamChatInput) {
  const { model } = await requireCopilotLanguageModel()
  const toolOpts: BuildAiToolsOptions = {
    executeDestructive: input.executeDestructive === true,
  }
  const tools = buildCopilotAiTools(toolOpts)

  const modelMessages = isUiMessages(input.messages)
    ? await convertToModelMessages(input.messages, { tools })
    : input.messages

  return streamText({
    model,
    system: COPILOT_SYSTEM_PROMPT,
    messages: modelMessages,
    tools,
    stopWhen: stepCountIs(COPILOT_MAX_TOOL_STEPS),
    toolApproval: buildDestructiveToolApproval(),
    abortSignal: input.abortSignal,
  })
}

export function getCopilotToolCatalog() {
  return listCopilotTools()
}

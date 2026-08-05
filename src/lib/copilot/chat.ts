import "server-only"

import {
  convertToModelMessages,
  stepCountIs,
  streamText,
  type ModelMessage,
  type UIMessage,
} from "ai"

import { getCopilotApprovalSecret } from "./approvals"
import { requireCopilotLanguageModel } from "./model"
import {
  buildCopilotAiTools,
  buildDestructiveToolApproval,
} from "./tools/ai-tools"
import { listCopilotTools } from "./tools/registry"
import type { BuildAiToolsOptions } from "./tools/types"

/** Hard cap on tool rounds per user turn — Architecture §16.6. */
export const COPILOT_MAX_TOOL_STEPS = 8

/** Soft output token cap per model step — Architecture §16.6. */
export const COPILOT_MAX_OUTPUT_TOKENS = 4096

export const COPILOT_SYSTEM_PROMPT = `You are mailwart Copilot, an operator assistant for a Stalwart mail control plane.

Rules:
- Use only the provided tools. Never invent API endpoints or claim side effects without a tool result.
- Prefer read tools first to gather ids/names before write tools.
- Destructive tools (destroy, password reset, bulk commit/destroy/reset/suspend) pause for operator Approve/Reject in the panel. Never claim they completed until a successful tool result arrives after approval.
- Never ask the operator to paste secrets into chat for display; when creating mailboxes or resetting passwords, use the tool and confirm success without echoing the password.
- App password secrets and DKIM private keys are never returned to you — direct the operator to the Domains/Mailbox UI to copy them once.
- When a request is ambiguous or you would otherwise guess an id, domain, or destructive target, call ask_operator with a short question and concrete choices, then stop your turn and wait. Never call ask_operator twice in one turn.
- If the same tool and arguments fail twice, stop and ask the operator — do not retry a third time.
- For navigation, call navigate_to with an allowlisted /dashboard/* path. It only offers the operator a button; never claim the workspace moved until the operator clicks it.
- Be concise and operational. Cite entity emails/domains from tool results.`

export type CopilotStreamChatInput = {
  messages: UIMessage[] | ModelMessage[]
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
  const toolOpts: BuildAiToolsOptions = {}
  const tools = buildCopilotAiTools(toolOpts)

  const modelMessages = isUiMessages(input.messages)
    ? await convertToModelMessages(input.messages, { tools })
    : input.messages

  return streamText({
    model,
    system: COPILOT_SYSTEM_PROMPT,
    messages: modelMessages,
    tools,
    maxOutputTokens: COPILOT_MAX_OUTPUT_TOKENS,
    stopWhen: stepCountIs(COPILOT_MAX_TOOL_STEPS),
    toolApproval: buildDestructiveToolApproval(),
    experimental_toolApprovalSecret: getCopilotApprovalSecret(),
    abortSignal: input.abortSignal,
  })
}

export function getCopilotToolCatalog() {
  return listCopilotTools()
}

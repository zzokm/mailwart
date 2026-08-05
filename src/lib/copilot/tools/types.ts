import type { z } from "zod"

/** Phase 5 approval gating — destructive never auto-runs without operator OK. */
export type CopilotToolRisk = "read" | "write" | "destructive"

export type CopilotToolCategory =
  | "overview"
  | "domains"
  | "mailboxes"
  | "routing"
  | "filters"
  | "bulk"
  | "logs"
  | "navigation"
  | "assist"

export type CopilotToolDef<TSchema extends z.ZodTypeAny = z.ZodTypeAny> = {
  name: string
  category: CopilotToolCategory
  description: string
  inputSchema: TSchema
  risk: CopilotToolRisk
  /**
   * Wraps an existing Server Action. Must not open a second JMAP client.
   * Return value is sanitized before it reaches the model stream.
   */
  execute: (input: z.infer<TSchema>) => Promise<unknown>
  /** Optional left-panel route after a successful mutation (Phase 4). */
  navigate?: (result: unknown) => string | null
}

/** Result when a destructive tool is blocked pending Phase 5 approval. */
export type AwaitingApprovalResult = {
  status: "awaiting_approval"
  risk: "destructive"
  tool: string
  message: string
  /** Sanitized args (secrets redacted). */
  args: unknown
}

export type BuildAiToolsOptions = {
  /**
   * When false (default), destructive tools return awaiting_approval
   * and do not invoke Server Actions. Phase 5 sets true after operator Approve.
   */
  executeDestructive?: boolean
}

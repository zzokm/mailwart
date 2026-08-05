import type { z } from "zod"

/** Risk tags — destructive never auto-runs without operator Approve (§16.7). */
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
  /** Optional left-panel route after a successful mutation. */
  navigate?: (result: unknown) => string | null
}

/** @deprecated Stub shape from C3; approval now uses AI SDK toolApproval UI. */
export type AwaitingApprovalResult = {
  status: "awaiting_approval"
  risk: "destructive"
  tool: string
  message: string
  /** Sanitized args (secrets redacted). */
  args: unknown
}

export type BuildAiToolsOptions = {
  /** Reserved for tests; production gates via toolApproval + ledger. */
  unused?: never
}

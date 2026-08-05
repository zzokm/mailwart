import "server-only"

import { getSessionPassword } from "@/lib/auth/session-options"

/** Architecture §16.7 — single-use approvals expire after ~5 minutes. */
export const COPILOT_APPROVAL_TTL_MS = 5 * 60 * 1000

type ApprovalEntry = {
  issuedAt: number
  consumed: boolean
}

const ledger = new Map<string, ApprovalEntry>()

function prune(now: number) {
  if (ledger.size < 200) return
  for (const [id, entry] of ledger) {
    if (entry.consumed || now - entry.issuedAt > COPILOT_APPROVAL_TTL_MS) {
      ledger.delete(id)
    }
  }
}

/** Record first sight of a destructive toolCallId (idempotent). */
export function rememberApprovalIssue(toolCallId: string): void {
  const now = Date.now()
  prune(now)
  if (!ledger.has(toolCallId)) {
    ledger.set(toolCallId, { issuedAt: now, consumed: false })
  }
}

export type ConsumeApprovalResult =
  | { ok: true }
  | { ok: false; error: string }

/**
 * Mark an approval single-use. Call from destructive tool execute after the
 * AI SDK has validated the operator response (+ HMAC when configured).
 */
export function consumeApproval(toolCallId: string): ConsumeApprovalResult {
  const now = Date.now()
  prune(now)
  const entry = ledger.get(toolCallId)
  if (!entry) {
    return {
      ok: false,
      error: "Unknown approval — request the action again.",
    }
  }
  if (entry.consumed) {
    return { ok: false, error: "Approval already used." }
  }
  if (now - entry.issuedAt > COPILOT_APPROVAL_TTL_MS) {
    ledger.delete(toolCallId)
    return {
      ok: false,
      error: "Approval expired (~5 min). Ask Copilot to retry the action.",
    }
  }
  entry.consumed = true
  return { ok: true }
}

/** HMAC secret for AI SDK approval replay binding (Architecture §16.7). */
export function getCopilotApprovalSecret(): string {
  return getSessionPassword()
}

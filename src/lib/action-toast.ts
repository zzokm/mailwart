"use client"

import { toast } from "sonner"

type ActionLike =
  | { ok: true; data?: unknown; source?: string }
  | { ok: false; error: string; code?: string; source?: string }

/**
 * Toast success or the exact server-parsed error from an ActionResult.
 * Returns whether the action succeeded.
 */
export function toastActionResult(
  result: ActionLike,
  opts: {
    success: string
    /** Optional Sonner toast id (e.g. from toast.loading). */
    id?: string | number
    /** Optional note toast after success. */
    note?: string
    /** When true and note is set, skip the success toast (note-only). */
    noteOnly?: boolean
  }
): result is Extract<ActionLike, { ok: true }> {
  if (!result.ok) {
    toast.error(result.error, opts.id != null ? { id: opts.id } : undefined)
    return false
  }
  if (opts.note && opts.noteOnly) {
    toast.message(opts.note, opts.id != null ? { id: opts.id } : undefined)
    return true
  }
  if (opts.success) {
    toast.success(opts.success, opts.id != null ? { id: opts.id } : undefined)
  }
  if (opts.note) toast.message(opts.note)
  return true
}

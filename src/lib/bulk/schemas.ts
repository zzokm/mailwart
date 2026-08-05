import { z } from "zod"

import { parseQuotaCell } from "./quota"

const boolish = z
  .string()
  .optional()
  .transform((v, ctx) => {
    if (v == null || v.trim() === "") return true
    const s = v.trim().toLowerCase()
    if (["1", "true", "yes", "y", "on"].includes(s)) return true
    if (["0", "false", "no", "n", "off"].includes(s)) return false
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: `Expected true/false, got "${v}".`,
    })
    return z.NEVER
  })

export const mailboxCsvRowSchema = z.object({
  email: z
    .string()
    .trim()
    .min(1, "Email is required.")
    .email("Invalid email address."),
  password: z
    .string()
    .min(6, "Password must be at least 6 characters."),
  description: z.string().optional().default(""),
  quota: z
    .string()
    .optional()
    .default("")
    .superRefine((val, ctx) => {
      const parsed = parseQuotaCell(val)
      if (!parsed.ok) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: parsed.error })
      }
    })
    .transform((val) => {
      const parsed = parseQuotaCell(val)
      return parsed.ok ? parsed.bytes : null
    }),
})

export type MailboxCsvRow = z.infer<typeof mailboxCsvRowSchema>

export const forwardingCsvRowSchema = z.object({
  source: z
    .string()
    .trim()
    .min(1, "Source is required.")
    .refine(
      (v) => v.startsWith("*@") || v.includes("@"),
      "Source must be an email or *@domain catch-all."
    ),
  targets: z
    .string()
    .trim()
    .min(1, "At least one target is required.")
    .transform((v) =>
      v
        .split(/[;|]/)
        .map((t) => t.trim().toLowerCase())
        .filter(Boolean)
    )
    .refine((arr) => arr.length > 0, "At least one target is required.")
    .refine(
      (arr) => arr.every((t) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(t)),
      "Each target must be a valid email."
    ),
  keep_local: boolish,
  enabled: boolish,
})

export type ForwardingCsvRow = z.infer<typeof forwardingCsvRowSchema>

export function zodIssuesMessage(err: z.ZodError): string {
  return err.issues.map((i) => i.message).join("; ")
}

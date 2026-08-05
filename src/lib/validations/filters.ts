import { z } from "zod"

import { emailSchema, entityIdSchema, nonEmptyString } from "./common"

export const upsertAutoresponderSchema = z.object({
  id: z.string().trim().optional(),
  accountId: entityIdSchema,
  enabled: z.boolean().optional(),
  subject: nonEmptyString("Subject"),
  body: nonEmptyString("Body"),
  startAt: z.string().nullable().optional(),
  endAt: z.string().nullable().optional(),
  daysBetween: z.number().int().min(0).max(365).optional(),
})

export const destroyByIdSchema = z.object({
  id: entityIdSchema,
})

const filterConditionSchema = z
  .object({
    field: z.enum(["subject", "from", "to", "header"]),
    op: z.enum(["contains", "is", "matches"]),
    value: nonEmptyString("Condition value"),
    headerName: z.string().trim().optional(),
  })
  .superRefine((c, ctx) => {
    if (c.field === "header" && !c.headerName?.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Header name is required for header conditions.",
        path: ["headerName"],
      })
    }
  })

const filterActionSchema = z
  .object({
    type: z.enum(["fileinto", "discard", "redirect", "keep", "stop"]),
    folder: z.string().trim().optional(),
    redirectTo: z.string().trim().optional(),
  })
  .superRefine((a, ctx) => {
    if (a.type === "fileinto" && !a.folder?.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Folder is required for fileinto.",
        path: ["folder"],
      })
    }
    if (a.type === "redirect") {
      const addr = a.redirectTo?.trim() ?? ""
      if (!addr) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Redirect address is required.",
          path: ["redirectTo"],
        })
      } else {
        const parsed = emailSchema.safeParse(addr)
        if (!parsed.success) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "Redirect address must be a valid email.",
            path: ["redirectTo"],
          })
        }
      }
    }
  })

export const upsertFilterRuleSchema = z.object({
  id: z.string().trim().optional(),
  scope: z.enum(["global", "user"]),
  accountId: z.string().nullable().optional(),
  name: nonEmptyString("Rule name"),
  enabled: z.boolean().optional(),
  condition: filterConditionSchema,
  action: filterActionSchema,
  priority: z.number().int().optional(),
})

export const updateSpamSettingsSchema = z
  .object({
    rejectThreshold: z.number().finite().nonnegative(),
    markAsSpamThreshold: z.number().finite().nonnegative(),
    denylist: z.array(z.string()),
    allowlist: z.array(z.string()),
  })
  .superRefine((v, ctx) => {
    if (v.markAsSpamThreshold > v.rejectThreshold) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Mark-as-spam threshold must be ≤ reject threshold.",
        path: ["markAsSpamThreshold"],
      })
    }
  })

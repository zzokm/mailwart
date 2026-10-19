import { z } from "zod"

import { emailSchema, entityIdSchema } from "./common"

export const upsertForwardingSchema = z
  .object({
    id: z.string().trim().optional(),
    scope: z.enum(["user", "domain", "wildcard", "regex"]).optional().default("user"),
    sourceType: z.enum(["exact", "wildcard", "regex", "domain"]).optional().default("exact"),
    domainId: entityIdSchema,
    source: z.string().trim().default(""),
    sourceAccountId: z.string().nullable().optional(),
    targets: z
      .array(z.string().trim().toLowerCase())
      .min(1, "At least one target is required.")
      .superRefine((targets, ctx) => {
        for (const t of targets) {
          if (!t) continue
          const parsed = emailSchema.safeParse(t)
          if (!parsed.success) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              message: `Invalid target: ${t}`,
            })
          }
        }
      }),
    keepLocalCopy: z.boolean().optional().default(true),
    enabled: z.boolean().optional().default(true),
    description: z.string().optional(),
  })
  .superRefine((data, ctx) => {
    if (data.sourceType === "domain" || data.scope === "domain") {
      return
    }
    if (!data.source) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["source"],
        message: "Source pattern or address is required.",
      })
      return
    }
    if (data.sourceType === "regex" || data.scope === "regex") {
      try {
        new RegExp(data.source)
      } catch (e) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["source"],
          message: `Invalid regex pattern: ${(e as Error).message}`,
        })
      }
    }
  })

export const destroyForwardingSchema = z.object({
  id: entityIdSchema,
})

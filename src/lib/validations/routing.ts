import { z } from "zod"

import { emailSchema, entityIdSchema, nonEmptyString } from "./common"

export const upsertForwardingSchema = z.object({
  id: z.string().trim().optional(),
  scope: z.enum(["user", "domain"]),
  domainId: entityIdSchema,
  source: nonEmptyString("Source"),
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
  keepLocalCopy: z.boolean().optional(),
  enabled: z.boolean().optional(),
})

export const destroyForwardingSchema = z.object({
  id: entityIdSchema,
})

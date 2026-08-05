import { z } from "zod"

import {
  entityIdSchema,
  localPartSchema,
  nonEmptyString,
  passwordSchema,
} from "./common"

/** Second confirm phrase required to destroy an admin mailbox. */
export const ADMIN_DESTROY_CONFIRM = "DESTROY ADMIN"

export const createMailboxSchema = z.object({
  domainId: entityIdSchema,
  local: localPartSchema,
  password: passwordSchema,
  description: z.string().trim().optional(),
  diskQuotaBytes: z.number().int().nonnegative().nullable().optional(),
})

export const updateMailboxSchema = z.object({
  id: entityIdSchema,
  description: z.string().optional(),
  diskQuotaBytes: z.number().int().nonnegative().nullable().optional(),
  isEnabled: z.boolean().optional(),
})

export const resetMailboxPasswordSchema = z.object({
  id: entityIdSchema,
  password: passwordSchema,
})

export const destroyMailboxSchema = z
  .object({
    id: entityIdSchema,
    typedEmail: nonEmptyString("Email"),
    /** Required when the mailbox is marked admin. */
    adminConfirm: z.string().trim().optional(),
  })
  .passthrough()

export const createAppPasswordSchema = z.object({
  accountId: entityIdSchema,
  description: nonEmptyString("Description"),
})

export const revokeAppPasswordSchema = z.object({
  accountId: entityIdSchema,
  appPasswordId: entityIdSchema,
})

export const mailboxIdsSchema = z
  .array(entityIdSchema)
  .min(1, "Select at least one mailbox.")

export const bulkResetPasswordsSchema = z.object({
  ids: mailboxIdsSchema,
  password: passwordSchema,
})

export const bulkSuspendSchema = z.object({
  ids: mailboxIdsSchema,
  suspend: z.boolean(),
})

export const aliasEntrySchema = z.object({
  name: localPartSchema,
  domainId: entityIdSchema,
  enabled: z.boolean().optional(),
  description: z.string().optional(),
  key: z.string().optional(),
})

export const updateAliasesSchema = z.object({
  accountId: entityIdSchema,
  aliases: z.array(aliasEntrySchema),
})

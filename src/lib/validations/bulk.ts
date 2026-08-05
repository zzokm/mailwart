import { z } from "zod"

import { entityIdSchema } from "./common"

/** Re-export CSV row schemas from bulk module (already Zod-backed). */
export {
  mailboxCsvRowSchema,
  forwardingCsvRowSchema,
  type MailboxCsvRow,
  type ForwardingCsvRow,
} from "@/lib/bulk/schemas"

export const prepareBulkMailboxSchema = z.object({
  csvText: z.string().min(1, "CSV content is required."),
  overwritePasswords: z.boolean().optional(),
})

export const prepareBulkForwardingSchema = z.object({
  csvText: z.string().min(1, "CSV content is required."),
})

export const bulkJobIdSchema = z.object({
  jobId: entityIdSchema,
})

export const commitBulkChunkSchema = z.object({
  jobId: entityIdSchema,
  chunkIndex: z.number().int().nonnegative(),
})

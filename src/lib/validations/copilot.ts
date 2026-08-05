import { z } from "zod"

import { COPILOT_PROVIDER_IDS } from "@/lib/copilot/providers"

export const copilotProviderIdSchema = z.enum(COPILOT_PROVIDER_IDS)

export const saveCopilotSettingsSchema = z.object({
  provider: copilotProviderIdSchema,
  model: z.string().trim().min(1).max(200).optional(),
  /** New key; omit to leave unchanged. Empty string ignored. */
  apiKey: z.string().max(500).optional(),
  baseUrl: z.string().trim().max(500).optional(),
  clearKey: z.boolean().optional(),
  clearBaseUrl: z.boolean().optional(),
})

export const fetchCopilotModelsSchema = z.object({
  provider: copilotProviderIdSchema,
})

export type SaveCopilotSettingsInput = z.infer<typeof saveCopilotSettingsSchema>

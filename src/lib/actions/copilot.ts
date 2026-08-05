"use server"

import { revalidatePath } from "next/cache"

import {
  failResult as fail,
  okResult as ok,
  validateInput,
} from "@/lib/actions/result"
import { AuthError, requireSession, sessionActor } from "@/lib/auth/session"
import { recordAudit } from "@/lib/audit"
import { fetchCopilotModels } from "@/lib/copilot/models"
import { getCopilotPublicStatus } from "@/lib/copilot/resolve"
import {
  readCopilotSettings,
  writeCopilotSettings,
} from "@/lib/copilot/settings-store"
import type { CopilotPublicStatus } from "@/lib/copilot/types"
import { StalwartError } from "@/lib/stalwart/errors"
import type { ActionResult } from "@/lib/stalwart/types"
import {
  fetchCopilotModelsSchema,
  saveCopilotSettingsSchema,
} from "@/lib/validations/copilot"

async function guard(): Promise<ActionResult<never> | null> {
  try {
    await requireSession()
    return null
  } catch (err) {
    if (err instanceof AuthError) {
      return fail(new StalwartError("Unauthorized.", "auth"))
    }
    throw err
  }
}

export async function getCopilotSettingsAction(): Promise<
  ActionResult<CopilotPublicStatus>
> {
  const denied = await guard()
  if (denied) return denied
  try {
    const status = await getCopilotPublicStatus()
    return ok(status)
  } catch (err) {
    return fail(err)
  }
}

export async function fetchCopilotModelsAction(input: {
  provider: string
}): Promise<
  ActionResult<{ models: Array<{ id: string; label: string }>; error?: string }>
> {
  const denied = await guard()
  if (denied) return denied

  const validated = validateInput(fetchCopilotModelsSchema, input)
  if (!validated.ok) return validated.result

  try {
    const result = await fetchCopilotModels(validated.data.provider)
    return ok(result)
  } catch (err) {
    return fail(err)
  }
}

export async function saveCopilotSettingsAction(input: unknown): Promise<
  ActionResult<CopilotPublicStatus>
> {
  const denied = await guard()
  if (denied) return denied

  const validated = validateInput(saveCopilotSettingsSchema, input)
  if (!validated.ok) return validated.result

  const {
    provider,
    model,
    apiKey,
    baseUrl,
    clearKey,
    clearBaseUrl,
  } = validated.data

  try {
    const settings = await readCopilotSettings()
    settings.activeProvider = provider

    if (model) {
      settings.models[provider] = model
    }

    if (clearKey) {
      delete settings.apiKeys[provider]
    } else if (typeof apiKey === "string" && apiKey.trim()) {
      settings.apiKeys[provider] = apiKey.trim()
    }

    if (clearBaseUrl) {
      delete settings.baseUrls[provider]
    } else if (typeof baseUrl === "string") {
      const trimmed = baseUrl.trim()
      if (trimmed) settings.baseUrls[provider] = trimmed.replace(/\/$/, "")
      else delete settings.baseUrls[provider]
    }

    await writeCopilotSettings(settings)

    const actor = await sessionActor()
    await recordAudit({
      actor,
      action: "copilot.settings_update",
      target: provider,
      detail: `Copilot provider set to ${provider}${model ? ` / ${model}` : ""}`,
      meta: {
        provider,
        model: model ?? null,
        keyUpdated: Boolean(clearKey || (apiKey && apiKey.trim())),
      },
    })

    revalidatePath("/dashboard/settings")
    const status = await getCopilotPublicStatus()
    return ok(status)
  } catch (err) {
    return fail(err)
  }
}

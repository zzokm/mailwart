import "server-only"

import { createAnthropic } from "@ai-sdk/anthropic"
import { createGoogleGenerativeAI } from "@ai-sdk/google"
import { createOpenAI } from "@ai-sdk/openai"
import type { LanguageModel } from "ai"

import {
  requireCopilotLanguageModelConfig,
  type CopilotLanguageModelConfig,
} from "./runtime"

function openaiCompatibleBaseUrl(
  baseURL: string,
  sdkKind: CopilotLanguageModelConfig["sdkKind"]
): string | undefined {
  const trimmed = baseURL.replace(/\/$/, "")
  if (!trimmed) return undefined
  if (sdkKind === "ollama" && !trimmed.endsWith("/v1")) {
    return `${trimmed}/v1`
  }
  return trimmed
}

/**
 * Construct a Vercel AI SDK language model from Phase 2 runtime config.
 */
export function createCopilotLanguageModel(
  cfg: CopilotLanguageModelConfig
): LanguageModel {
  switch (cfg.sdkKind) {
    case "anthropic": {
      const anthropic = createAnthropic({
        apiKey: cfg.apiKey,
        baseURL: cfg.baseURL || undefined,
      })
      return anthropic(cfg.model)
    }
    case "google": {
      const google = createGoogleGenerativeAI({
        apiKey: cfg.apiKey,
        baseURL: cfg.baseURL || undefined,
      })
      return google(cfg.model)
    }
    case "openai-compatible":
    case "ollama": {
      const openai = createOpenAI({
        apiKey: cfg.apiKey ?? (cfg.sdkKind === "ollama" ? "ollama" : undefined),
        baseURL: openaiCompatibleBaseUrl(cfg.baseURL, cfg.sdkKind),
        name: cfg.providerId,
      })
      return openai.chat(cfg.model)
    }
    default: {
      const _exhaustive: never = cfg.sdkKind
      throw new Error(`Unsupported Copilot sdkKind: ${String(_exhaustive)}`)
    }
  }
}

/** Resolve configured provider and return a ready LanguageModel. */
export async function requireCopilotLanguageModel(): Promise<{
  model: LanguageModel
  config: CopilotLanguageModelConfig
}> {
  const config = await requireCopilotLanguageModelConfig()
  return { model: createCopilotLanguageModel(config), config }
}

import "server-only"

import type { CopilotProviderId, CopilotSdkKind } from "./providers"
import {
  getActiveProviderId,
  resolveProviderCreds,
  type ResolvedProviderCreds,
} from "./resolve"

/**
 * Thin runtime config for Vercel AI SDK (Phase 3–4).
 * Callers construct `createOpenAI` / `createAnthropic` / etc. from this —
 * no second DI framework.
 */
export type CopilotLanguageModelConfig = {
  providerId: CopilotProviderId
  model: string
  sdkKind: CopilotSdkKind
  apiKey?: string
  baseURL: string
}

export class CopilotNotConfiguredError extends Error {
  constructor(message = "Copilot provider is not configured") {
    super(message)
    this.name = "CopilotNotConfiguredError"
  }
}

function toLanguageModelConfig(
  creds: ResolvedProviderCreds
): CopilotLanguageModelConfig {
  return {
    providerId: creds.providerId,
    model: creds.model,
    sdkKind: creds.sdkKind,
    apiKey: creds.apiKey,
    baseURL: creds.baseUrl,
  }
}

/** Resolved active provider+model for streamText / generateText. */
export async function getCopilotLanguageModelConfig(): Promise<CopilotLanguageModelConfig | null> {
  const providerId = await getActiveProviderId()
  const creds = await resolveProviderCreds(providerId)
  if (!creds.configured || !creds.model) return null
  if (!creds.apiKey && creds.sdkKind !== "ollama") return null
  return toLanguageModelConfig(creds)
}

/** Same as getCopilotLanguageModelConfig but throws when missing. */
export async function requireCopilotLanguageModelConfig(): Promise<CopilotLanguageModelConfig> {
  const cfg = await getCopilotLanguageModelConfig()
  if (!cfg) {
    throw new CopilotNotConfiguredError(
      "Configure a Copilot provider and model in Settings or via COPILOT_* env."
    )
  }
  return cfg
}

/**
 * Hint map for Phase 3 wiring — which `@ai-sdk/*` package matches sdkKind.
 * Not imported here to keep Phase 2 dependency-free.
 */
export const COPILOT_SDK_PACKAGE: Record<CopilotSdkKind, string> = {
  "openai-compatible": "@ai-sdk/openai",
  anthropic: "@ai-sdk/anthropic",
  google: "@ai-sdk/google",
  ollama: "@ai-sdk/openai", // OpenAI-compatible against Ollama /v1
}

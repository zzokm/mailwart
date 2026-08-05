import "server-only"

import {
  COPILOT_PROVIDERS,
  type CopilotProviderId,
  type CopilotSdkKind,
} from "./providers"
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

function configFromCreds(
  creds: ResolvedProviderCreds
): CopilotLanguageModelConfig | null {
  if (!creds.configured || !creds.model) return null
  if (!creds.apiKey && creds.sdkKind !== "ollama") return null
  return toLanguageModelConfig(creds)
}

/** Names the active provider and each missing piece so the fix is obvious. */
function describeMissingConfig(creds: ResolvedProviderCreds): string {
  const def = COPILOT_PROVIDERS[creds.providerId]
  const missing: string[] = []
  if (!creds.apiKey && !def.keyOptional) {
    missing.push(
      `an API key (set COPILOT_${def.envKey}_API_KEY, or save one in Settings)`
    )
  }
  if (!creds.model) {
    missing.push("a model (set COPILOT_MODEL, or pick one in Settings)")
  }
  const detail =
    missing.length > 0 ? missing.join(" and ") : "a usable configuration"
  return (
    `Copilot provider "${def.label}" is active but missing ${detail}. ` +
    "To use a different provider, set COPILOT_PROVIDER or change it in Settings."
  )
}

/** Resolved active provider+model for streamText / generateText. */
export async function getCopilotLanguageModelConfig(): Promise<CopilotLanguageModelConfig | null> {
  const providerId = await getActiveProviderId()
  return configFromCreds(await resolveProviderCreds(providerId))
}

/** Same as getCopilotLanguageModelConfig but throws when missing. */
export async function requireCopilotLanguageModelConfig(): Promise<CopilotLanguageModelConfig> {
  const providerId = await getActiveProviderId()
  const creds = await resolveProviderCreds(providerId)
  const cfg = configFromCreds(creds)
  if (!cfg) throw new CopilotNotConfiguredError(describeMissingConfig(creds))
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

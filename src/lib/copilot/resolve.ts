import "server-only"

import {
  COPILOT_PROVIDERS,
  COPILOT_PROVIDER_LIST,
  isCopilotProviderId,
  maskKeyLast4,
  type CopilotProviderId,
  type CopilotSdkKind,
} from "./providers"
import {
  readCopilotSettings,
  type CopilotStoredSettings,
} from "./settings-store"
import type {
  CopilotPublicProviderStatus,
  CopilotPublicStatus,
  KeySource,
} from "./types"

export type {
  CopilotPublicProviderStatus,
  CopilotPublicStatus,
  KeySource,
} from "./types"

function unset(value: string | undefined): string | undefined {
  const trimmed = value?.trim()
  return trimmed ? trimmed : undefined
}

export type ResolvedProviderCreds = {
  providerId: CopilotProviderId
  apiKey: string | undefined
  keySource: KeySource
  baseUrl: string
  baseUrlSource: "env" | "settings" | "default"
  model: string
  modelSource: "env" | "settings" | "default"
  sdkKind: CopilotSdkKind
  configured: boolean
}

function envProviderKey(providerId: CopilotProviderId): string | undefined {
  const def = COPILOT_PROVIDERS[providerId]
  return unset(process.env[`COPILOT_${def.envKey}_API_KEY`])
}

function envProviderBaseUrl(providerId: CopilotProviderId): string | undefined {
  const def = COPILOT_PROVIDERS[providerId]
  return unset(process.env[`COPILOT_${def.envKey}_BASE_URL`])
}

function envActiveProvider(): CopilotProviderId | undefined {
  const raw = unset(process.env.COPILOT_PROVIDER)
  if (raw && isCopilotProviderId(raw)) return raw
  return undefined
}

export async function getActiveProviderId(
  stored?: CopilotStoredSettings
): Promise<CopilotProviderId> {
  const fromEnv = envActiveProvider()
  if (fromEnv) return fromEnv
  const settings = stored ?? (await readCopilotSettings())
  return settings.activeProvider
}

export async function resolveProviderCreds(
  providerId: CopilotProviderId,
  stored?: CopilotStoredSettings
): Promise<ResolvedProviderCreds> {
  const settings = stored ?? (await readCopilotSettings())
  const def = COPILOT_PROVIDERS[providerId]
  const active = await getActiveProviderId(settings)

  const specificEnvKey = envProviderKey(providerId)
  const genericEnvKey =
    active === providerId ? unset(process.env.COPILOT_API_KEY) : undefined
  const settingsKey = unset(settings.apiKeys[providerId])

  let apiKey: string | undefined
  let keySource: KeySource = "none"
  if (specificEnvKey) {
    apiKey = specificEnvKey
    keySource = "env"
  } else if (genericEnvKey) {
    apiKey = genericEnvKey
    keySource = "env"
  } else if (settingsKey) {
    apiKey = settingsKey
    keySource = "settings"
  }

  const specificEnvBase = envProviderBaseUrl(providerId)
  const genericEnvBase =
    active === providerId ? unset(process.env.COPILOT_BASE_URL) : undefined
  const settingsBase = unset(settings.baseUrls[providerId])

  let baseUrl: string
  let baseUrlSource: ResolvedProviderCreds["baseUrlSource"]
  if (specificEnvBase) {
    baseUrl = specificEnvBase.replace(/\/$/, "")
    baseUrlSource = "env"
  } else if (genericEnvBase) {
    baseUrl = genericEnvBase.replace(/\/$/, "")
    baseUrlSource = "env"
  } else if (settingsBase) {
    baseUrl = settingsBase.replace(/\/$/, "")
    baseUrlSource = "settings"
  } else {
    baseUrl = (def.defaultBaseUrl ?? "").replace(/\/$/, "")
    baseUrlSource = "default"
  }

  const envModel =
    active === providerId ? unset(process.env.COPILOT_MODEL) : undefined
  const settingsModel = unset(settings.models[providerId])

  let model: string
  let modelSource: ResolvedProviderCreds["modelSource"]
  if (envModel) {
    model = envModel
    modelSource = "env"
  } else if (settingsModel) {
    model = settingsModel
    modelSource = "settings"
  } else {
    model = def.defaultModel ?? ""
    modelSource = "default"
  }

  const configured = Boolean(apiKey) || Boolean(def.keyOptional)

  return {
    providerId,
    apiKey,
    keySource,
    baseUrl,
    baseUrlSource,
    model,
    modelSource,
    sdkKind: def.sdkKind,
    configured,
  }
}

export async function getCopilotPublicStatus(): Promise<CopilotPublicStatus> {
  const settings = await readCopilotSettings()
  const activeProvider = await getActiveProviderId(settings)

  const providers: CopilotPublicProviderStatus[] = []
  for (const def of COPILOT_PROVIDER_LIST) {
    const creds = await resolveProviderCreds(def.id, settings)
    providers.push({
      id: def.id,
      label: def.label,
      configured: creds.configured,
      keyOptional: Boolean(def.keyOptional),
      keySource: creds.keySource,
      keyLast4: creds.apiKey ? maskKeyLast4(creds.apiKey) : null,
      baseUrl: creds.baseUrl,
      model: creds.model,
      sdkKind: creds.sdkKind,
    })
  }

  const active = providers.find((p) => p.id === activeProvider)
  const ready = Boolean(active?.configured && active.model)

  return { activeProvider, providers, ready }
}

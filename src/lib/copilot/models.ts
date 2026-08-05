import "server-only"

import { COPILOT_PROVIDERS, type CopilotProviderId } from "./providers"
import { resolveProviderCreds } from "./resolve"

export type CopilotModelOption = {
  id: string
  label: string
}

function uniqModels(ids: string[]): CopilotModelOption[] {
  const seen = new Set<string>()
  const out: CopilotModelOption[] = []
  for (const id of ids) {
    const trimmed = id.trim()
    if (!trimmed || seen.has(trimmed)) continue
    seen.add(trimmed)
    out.push({ id: trimmed, label: trimmed })
  }
  return out.sort((a, b) => a.id.localeCompare(b.id))
}

async function fetchJson(
  url: string,
  init?: RequestInit
): Promise<unknown> {
  const res = await fetch(url, {
    ...init,
    signal: AbortSignal.timeout(15_000),
    cache: "no-store",
  })
  if (!res.ok) {
    const body = await res.text().catch(() => "")
    throw new Error(
      `Model list failed (${res.status}): ${body.slice(0, 200) || res.statusText}`
    )
  }
  return res.json() as Promise<unknown>
}

async function listOpenAiCompatible(
  baseUrl: string,
  apiKey: string | undefined,
  modelsPath: string
): Promise<string[]> {
  const url = `${baseUrl.replace(/\/$/, "")}${modelsPath}`
  const headers: HeadersInit = { Accept: "application/json" }
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`

  const json = (await fetchJson(url, { headers })) as {
    data?: Array<{ id?: string }>
  }
  if (!Array.isArray(json.data)) return []
  return json.data
    .map((m) => (typeof m.id === "string" ? m.id : ""))
    .filter(Boolean)
}

async function listAnthropic(apiKey: string, baseUrl: string): Promise<string[]> {
  const url = `${baseUrl.replace(/\/$/, "")}/v1/models`
  const json = (await fetchJson(url, {
    headers: {
      Accept: "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
  })) as { data?: Array<{ id?: string }> }
  if (!Array.isArray(json.data)) return []
  return json.data
    .map((m) => (typeof m.id === "string" ? m.id : ""))
    .filter(Boolean)
}

async function listGoogle(apiKey: string, baseUrl: string): Promise<string[]> {
  const root = baseUrl.replace(/\/$/, "")
  const url = `${root}/models?key=${encodeURIComponent(apiKey)}`
  const json = (await fetchJson(url)) as {
    models?: Array<{ name?: string; supportedGenerationMethods?: string[] }>
  }
  if (!Array.isArray(json.models)) return []
  return json.models
    .filter((m) =>
      (m.supportedGenerationMethods ?? []).includes("generateContent")
    )
    .map((m) => {
      const name = typeof m.name === "string" ? m.name : ""
      return name.startsWith("models/") ? name.slice("models/".length) : name
    })
    .filter(Boolean)
}

async function listOllama(baseUrl: string): Promise<string[]> {
  const url = `${baseUrl.replace(/\/$/, "")}/api/tags`
  const json = (await fetchJson(url)) as {
    models?: Array<{ name?: string; model?: string }>
  }
  if (!Array.isArray(json.models)) return []
  return json.models
    .map((m) => m.name || m.model || "")
    .filter(Boolean)
}

/**
 * Fetch available models for a provider using resolved credentials.
 * Returns [] with a soft error message for the UI when listing fails.
 */
export async function fetchCopilotModels(
  providerId: CopilotProviderId
): Promise<{ models: CopilotModelOption[]; error?: string }> {
  const def = COPILOT_PROVIDERS[providerId]
  const creds = await resolveProviderCreds(providerId)

  if (!creds.configured) {
    return {
      models: [],
      error: def.keyOptional
        ? "Provider is not reachable yet."
        : "Add an API key (env or Settings) before listing models.",
    }
  }

  if (!def.keyOptional && !creds.apiKey) {
    return { models: [], error: "API key required to list models." }
  }

  try {
    let ids: string[] = []
    switch (def.sdkKind) {
      case "openai-compatible":
        ids = await listOpenAiCompatible(
          creds.baseUrl,
          creds.apiKey,
          def.modelsPath ?? "/models"
        )
        break
      case "anthropic":
        if (!creds.apiKey) {
          return { models: [], error: "API key required." }
        }
        ids = await listAnthropic(creds.apiKey, creds.baseUrl)
        break
      case "google":
        if (!creds.apiKey) {
          return { models: [], error: "API key required." }
        }
        ids = await listGoogle(creds.apiKey, creds.baseUrl)
        break
      case "ollama":
        ids = await listOllama(creds.baseUrl)
        break
      default:
        ids = []
    }

    const models = uniqModels(ids)
    if (models.length === 0 && creds.model) {
      return {
        models: [{ id: creds.model, label: creds.model }],
        error: "Provider returned no models; showing current selection.",
      }
    }
    return { models }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to list models"
    const fallback = creds.model
      ? [{ id: creds.model, label: creds.model }]
      : def.defaultModel
        ? [{ id: def.defaultModel, label: def.defaultModel }]
        : []
    return { models: fallback, error: message }
  }
}

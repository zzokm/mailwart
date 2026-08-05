/** Copilot LLM provider catalog — Architecture §16.5 */

export const COPILOT_PROVIDER_IDS = [
  "openai",
  "anthropic",
  "google",
  "cerebras",
  "groq",
  "mistral",
  "deepseek",
  "moonshot",
  "ollama",
  "openrouter",
] as const

export type CopilotProviderId = (typeof COPILOT_PROVIDER_IDS)[number]

/** How Phase 3–4 should construct a Vercel AI SDK model. */
export type CopilotSdkKind =
  | "openai-compatible"
  | "anthropic"
  | "google"
  | "ollama"

export type CopilotProviderDef = {
  id: CopilotProviderId
  label: string
  /** Env suffix: COPILOT_{ENV_KEY}_API_KEY / _BASE_URL */
  envKey: string
  sdkKind: CopilotSdkKind
  defaultBaseUrl?: string
  defaultModel?: string
  /** Ollama (and similar) can list models without a key. */
  keyOptional?: boolean
  /** Models list path relative to base URL (OpenAI-compatible). */
  modelsPath?: string
}

export const COPILOT_PROVIDERS: Record<CopilotProviderId, CopilotProviderDef> = {
  openai: {
    id: "openai",
    label: "OpenAI",
    envKey: "OPENAI",
    sdkKind: "openai-compatible",
    defaultBaseUrl: "https://api.openai.com/v1",
    defaultModel: "gpt-4o",
    modelsPath: "/models",
  },
  anthropic: {
    id: "anthropic",
    label: "Claude (Anthropic)",
    envKey: "ANTHROPIC",
    sdkKind: "anthropic",
    defaultBaseUrl: "https://api.anthropic.com",
    defaultModel: "claude-sonnet-4-20250514",
  },
  google: {
    id: "google",
    label: "Google",
    envKey: "GOOGLE",
    sdkKind: "google",
    defaultBaseUrl: "https://generativelanguage.googleapis.com/v1beta",
    defaultModel: "gemini-2.0-flash",
  },
  cerebras: {
    id: "cerebras",
    label: "Cerebras",
    envKey: "CEREBRAS",
    sdkKind: "openai-compatible",
    defaultBaseUrl: "https://api.cerebras.ai/v1",
    defaultModel: "llama-3.3-70b",
    modelsPath: "/models",
  },
  groq: {
    id: "groq",
    label: "Groq",
    envKey: "GROQ",
    sdkKind: "openai-compatible",
    defaultBaseUrl: "https://api.groq.com/openai/v1",
    defaultModel: "llama-3.3-70b-versatile",
    modelsPath: "/models",
  },
  mistral: {
    id: "mistral",
    label: "Mistral",
    envKey: "MISTRAL",
    sdkKind: "openai-compatible",
    defaultBaseUrl: "https://api.mistral.ai/v1",
    defaultModel: "mistral-large-latest",
    modelsPath: "/models",
  },
  deepseek: {
    id: "deepseek",
    label: "DeepSeek",
    envKey: "DEEPSEEK",
    sdkKind: "openai-compatible",
    defaultBaseUrl: "https://api.deepseek.com/v1",
    defaultModel: "deepseek-chat",
    modelsPath: "/models",
  },
  moonshot: {
    id: "moonshot",
    label: "Moonshot",
    envKey: "MOONSHOT",
    sdkKind: "openai-compatible",
    defaultBaseUrl: "https://api.moonshot.ai/v1",
    defaultModel: "moonshot-v1-8k",
    modelsPath: "/models",
  },
  ollama: {
    id: "ollama",
    label: "Ollama",
    envKey: "OLLAMA",
    sdkKind: "ollama",
    defaultBaseUrl: "http://127.0.0.1:11434",
    defaultModel: "llama3.2",
    keyOptional: true,
  },
  openrouter: {
    id: "openrouter",
    label: "OpenRouter",
    envKey: "OPENROUTER",
    sdkKind: "openai-compatible",
    defaultBaseUrl: "https://openrouter.ai/api/v1",
    defaultModel: "openai/gpt-4o",
    modelsPath: "/models",
  },
}

export const COPILOT_PROVIDER_LIST: CopilotProviderDef[] =
  COPILOT_PROVIDER_IDS.map((id) => COPILOT_PROVIDERS[id])

export function isCopilotProviderId(value: string): value is CopilotProviderId {
  return (COPILOT_PROVIDER_IDS as readonly string[]).includes(value)
}

export function maskKeyLast4(key: string): string {
  const trimmed = key.trim()
  if (trimmed.length <= 4) return "••••"
  return `••••${trimmed.slice(-4)}`
}

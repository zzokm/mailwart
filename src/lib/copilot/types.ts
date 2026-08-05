import type { CopilotProviderId, CopilotSdkKind } from "./providers"

export type KeySource = "env" | "settings" | "none"

export type CopilotPublicProviderStatus = {
  id: CopilotProviderId
  label: string
  configured: boolean
  keyOptional: boolean
  keySource: KeySource
  keyLast4: string | null
  baseUrl: string
  model: string
  sdkKind: CopilotSdkKind
}

export type CopilotPublicStatus = {
  activeProvider: CopilotProviderId
  providers: CopilotPublicProviderStatus[]
  ready: boolean
}

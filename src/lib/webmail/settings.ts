import {
  DEFAULT_RAV_FEATURES,
  DEFAULT_ROUNDCUBE_FEATURES,
  DEFAULT_WEBMAIL_SETTINGS,
  WebmailClientType,
  WebmailSettings,
} from "./types"

export function sanitizeWebmailSettings(
  input?: Partial<WebmailSettings> | null
): WebmailSettings {
  if (!input) return DEFAULT_WEBMAIL_SETTINGS

  const client: WebmailClientType =
    input.client === "roundcube" ? "roundcube" : "rav"

  const openInNewTab =
    typeof input.openInNewTab === "boolean" ? input.openInNewTab : true

  const ravFeatures = {
    ...DEFAULT_RAV_FEATURES,
    ...(input.ravFeatures || {}),
  }

  const roundcubeFeatures = {
    ...DEFAULT_ROUNDCUBE_FEATURES,
    ...(input.roundcubeFeatures || {}),
  }

  return {
    client,
    openInNewTab,
    ravFeatures,
    roundcubeFeatures,
    updatedAt: input.updatedAt,
  }
}

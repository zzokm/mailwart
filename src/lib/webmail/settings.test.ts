import { describe, expect, it } from "vitest"
import { sanitizeWebmailSettings } from "./settings"
import { DEFAULT_WEBMAIL_SETTINGS } from "./types"

describe("sanitizeWebmailSettings", () => {
  it("returns default settings if input is null or undefined", () => {
    expect(sanitizeWebmailSettings(null)).toEqual(DEFAULT_WEBMAIL_SETTINGS)
    expect(sanitizeWebmailSettings(undefined)).toEqual(DEFAULT_WEBMAIL_SETTINGS)
  })

  it("preserves partial settings and fills in missing defaults", () => {
    const customized = sanitizeWebmailSettings({
      client: "roundcube",
      openInNewTab: false,
      roundcubeFeatures: {
        manageSieveSync: false,
        vacationResponder: true,
        zipDownload: true,
        elasticSkin: true,
        previewPane: false,
      },
    })

    expect(customized.client).toBe("roundcube")
    expect(customized.openInNewTab).toBe(false)
    expect(customized.roundcubeFeatures.manageSieveSync).toBe(false)
    expect(customized.roundcubeFeatures.previewPane).toBe(false)
    expect(customized.ravFeatures.tantivySearch).toBe(true)
  })

  it("falls back to rav when invalid client string is passed", () => {
    // @ts-expect-error Testing invalid runtime string
    const result = sanitizeWebmailSettings({ client: "invalid_client" })
    expect(result.client).toBe("rav")
  })
})

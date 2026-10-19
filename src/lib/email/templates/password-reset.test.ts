import { describe, expect, it } from "vitest"
import {
  EMAIL_TEMPLATES,
  renderPasswordResetEmailHtml,
  renderPasswordResetEmailText,
} from "./password-reset"

describe("Password Reset Email Templates", () => {
  it("provides exactly two curated template options", () => {
    expect(EMAIL_TEMPLATES).toHaveLength(2)
    const ids = EMAIL_TEMPLATES.map((t) => t.id)
    expect(ids).toContain("macos_dark")
    expect(ids).toContain("nordic_dark")
  })

  it("renders macOS Dark Window template with proper brand styling and white canvas", () => {
    const html = renderPasswordResetEmailHtml("654321", "macos_dark")

    // Blends with white email apps
    expect(html).toContain("background-color: #ffffff")

    // Uses app fonts
    expect(html).toContain("Bricolage+Grotesque")
    expect(html).toContain("Plus+Jakarta+Sans")
    expect(html).toContain("Geist+Mono")

    // Formatted OTP code with non-breaking space & nowrap to prevent phone email app 2-row wrapping
    expect(html).toContain("654&nbsp;321")
    expect(html).toContain("white-space: nowrap")

    // Window controls
    expect(html).toContain("#ff5f56")
    expect(html).toContain("#ffbd2e")
    expect(html).toContain("#27c93f")

    // Removed elements as requested by user
    expect(html).not.toContain("mailwart console &bull; automated security transmission")
    expect(html).not.toContain("&bull; security")
    expect(html).not.toContain("#10b981") // green pulse dot removed
  })

  it("renders Nordic Minimal Dark template with proper brand styling and white canvas", () => {
    const html = renderPasswordResetEmailHtml("654321", "nordic_dark")

    // Blends with white email apps
    expect(html).toContain("background-color: #ffffff")

    // Uses app fonts
    expect(html).toContain("Bricolage+Grotesque")
    expect(html).toContain("Plus+Jakarta+Sans")
    expect(html).toContain("Geist+Mono")

    // Formatted OTP code with non-breaking space & nowrap to prevent phone email app 2-row wrapping
    expect(html).toContain("654&nbsp;321")
    expect(html).toContain("white-space: nowrap")

    // Removed elements as requested by user
    expect(html).not.toContain("mailwart console &bull; automated security transmission")
  })

  it("renders plain-text fallback with OTP code", () => {
    const text = renderPasswordResetEmailText("987654")
    expect(text).toContain("987 654")
    expect(text).toContain("10 minutes")
  })
})

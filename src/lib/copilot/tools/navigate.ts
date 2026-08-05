import { z } from "zod"

/** Allowlisted dashboard hrefs for navigate_to (Architecture §16.8). */
const DASHBOARD_HREF =
  /^\/dashboard(?:\/(?:domains|mailboxes|routing|filters|logs|import|settings)(?:\/[A-Za-z0-9._@%+-]+)?)?\/?$/

export const navigateToSchema = z.object({
  href: z
    .string()
    .trim()
    .min(1)
    .describe(
      "Dashboard path only, e.g. /dashboard/domains or /dashboard/mailboxes/{id}"
    ),
  reason: z
    .string()
    .trim()
    .max(200)
    .optional()
    .describe("Short reason shown to the operator"),
})

export type NavigateToInput = z.infer<typeof navigateToSchema>

export function isAllowedDashboardHref(href: string): boolean {
  const path = href.split("?")[0]?.split("#")[0] ?? ""
  if (path === "/dashboard" || path === "/dashboard/") return true
  return DASHBOARD_HREF.test(path)
}

/** Phase 4 stub — validates and returns nav intent; client applies router.push. */
export function resolveNavigateTo(input: NavigateToInput): {
  ok: boolean
  href?: string
  reason?: string
  error?: string
  status: "nav_intent"
} {
  const href = input.href.trim()
  if (!isAllowedDashboardHref(href)) {
    return {
      ok: false,
      status: "nav_intent",
      error:
        "Href not allowlisted. Use /dashboard/* routes only (no external or /api paths).",
    }
  }
  const normalized = href.replace(/\/$/, "") || "/dashboard"
  return {
    ok: true,
    status: "nav_intent",
    href: normalized,
    reason: input.reason,
  }
}

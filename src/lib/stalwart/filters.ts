import "server-only"

import { jmapCall, responseById } from "./client"
import { StalwartError } from "./errors"
import type { SpamSettings } from "./types"

export {
  buildFilterSieve,
  buildVacationSieve,
  summarizeFilter,
  normalizeAddressList,
  parseAddressListText,
  sieveQuote,
} from "./filters-utils"

/**
 * Probe whether Stalwart exposes a Sieve / script management JMAP method.
 * Returns true only when a probe call succeeds; otherwise Prefer ManageSieve.
 */
export async function probeSieveJmapSupport(): Promise<{
  available: boolean
  note: string
}> {
  try {
    // Speculative probe — Stalwart may reject unknown methods cleanly.
    const r = await jmapCall(
      [["SieveScript/query", { filter: null, limit: 1 }, "sv0"]],
      { timeoutMs: 8_000, retry: false }
    )
    const body = responseById(r, "sv0")
    // If we got ids back (even empty), treat as available.
    if (Array.isArray(body.ids) || "ids" in body) {
      return {
        available: true,
        note: "SieveScript JMAP methods responded — full script sync pending.",
      }
    }
    return {
      available: false,
      note: "Unexpected SieveScript response shape.",
    }
  } catch (err) {
    const message =
      err instanceof StalwartError
        ? err.message
        : err instanceof Error
          ? err.message
          : "Sieve probe failed."
    return {
      available: false,
      note: `ManageSieve / Roundcube recommended. (${message})`,
    }
  }
}

/**
 * Load spam posture from Stalwart when a settings object exists.
 * Falls back to unavailable — never invent Bayesian knobs.
 */
export async function loadLiveSpamSettings(): Promise<SpamSettings> {
  const now = new Date().toISOString()
  try {
    // Speculative: some Stalwart builds expose principal / settings via JMAP.
    const r = await jmapCall(
      [
        [
          "x:Principal/get",
          { ids: null, properties: ["name", "emails", "description"] },
          "sp0",
        ],
      ],
      { timeoutMs: 8_000, retry: false }
    )
    responseById(r, "sp0")
    return {
      rejectThreshold: 10,
      markAsSpamThreshold: 5,
      denylist: [],
      allowlist: [],
      backend: "unavailable",
      note: "Live spam thresholds are not exposed on this JMAP surface. Configure reject/mark scores and lists in Stalwart Admin.",
      updatedAt: now,
    }
  } catch {
    return {
      rejectThreshold: 10,
      markAsSpamThreshold: 5,
      denylist: [],
      allowlist: [],
      backend: "unavailable",
      note: "Spam policy not readable via JMAP. Use Stalwart Admin for thresholds, denylist, and safelist.",
      updatedAt: now,
    }
  }
}

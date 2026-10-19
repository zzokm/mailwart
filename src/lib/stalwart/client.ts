import "server-only"

import { getStalwartConfig } from "@/lib/env"
import { mapHttpError, StalwartError } from "./errors"
import type { JmapMethodCall, JmapResponse } from "./types"

const DEFAULT_TIMEOUT_MS = 15_000
const BULK_TIMEOUT_MS = 30_000

export type JmapClientOptions = {
  timeoutMs?: number
  /** Idempotent query/get only — mutations must not auto-retry. */
  retry?: boolean
  using?: string[]
}

function basicAuthHeader(user: string, password: string): string {
  const token = Buffer.from(`${user}:${password}`, "utf8").toString("base64")
  return `Basic ${token}`
}

export async function jmapCall(
  methodCalls: JmapMethodCall[],
  options: JmapClientOptions = {}
): Promise<JmapResponse> {
  const config = getStalwartConfig()
  if (!config) {
    throw new StalwartError(
      "Stalwart credentials not configured. Set STALWART_JMAP_URL, STALWART_ADMIN_USER, STALWART_ADMIN_PASSWORD.",
      "config"
    )
  }

  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS
  const attempt = async (): Promise<JmapResponse> => {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    try {
      const res = await fetch(config.jmapUrl, {
        method: "POST",
        headers: {
          Authorization: basicAuthHeader(config.adminUser, config.adminPassword),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          using: options.using ?? [
            "urn:ietf:params:jmap:core",
            "urn:stalwart:jmap",
          ],
          methodCalls,
        }),
        signal: controller.signal,
        cache: "no-store",
      })

      const text = await res.text()
      if (!res.ok) {
        throw mapHttpError(res.status, text)
      }

      let json: JmapResponse
      try {
        json = JSON.parse(text) as JmapResponse
      } catch {
        throw new StalwartError("Stalwart returned invalid JSON.", "jmap", {
          body: text.slice(0, 300),
        })
      }

      if (!json.methodResponses?.length) {
        throw new StalwartError("Empty JMAP methodResponses.", "jmap", json)
      }

      return json
    } catch (err) {
      if (err instanceof StalwartError) throw err
      if (err instanceof Error && err.name === "AbortError") {
        throw new StalwartError(
          `Stalwart did not respond within ${timeoutMs / 1000}s. Retry.`,
          "timeout"
        )
      }
      const message =
        err instanceof Error ? err.message : "Network error talking to Stalwart."
      throw new StalwartError(message, "transport", err)
    } finally {
      clearTimeout(timer)
    }
  }

  try {
    return await attempt()
  } catch (err) {
    if (
      options.retry &&
      err instanceof StalwartError &&
      (err.code === "timeout" || err.code === "transport")
    ) {
      await new Promise((r) => setTimeout(r, 500))
      return attempt()
    }
    throw err
  }
}

export function responseById(
  response: JmapResponse,
  callId: string
): Record<string, unknown> {
  const entry = response.methodResponses.find((r) => r[2] === callId)
  if (!entry) {
    throw new StalwartError(`Missing JMAP response for ${callId}.`, "jmap")
  }
  if (entry[0] === "error") {
    const type = String(entry[1].type ?? "error")
    const description = String(entry[1].description ?? "")
    throw new StalwartError(
      [type, description].filter(Boolean).join(": ") || "JMAP method error",
      "jmap",
      entry[1]
    )
  }
  return entry[1]
}

export { BULK_TIMEOUT_MS, DEFAULT_TIMEOUT_MS }

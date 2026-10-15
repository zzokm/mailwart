"use server"

import { revalidatePath } from "next/cache"
import { getSession } from "@/lib/auth/session"
import {
  getUserWebmailSettings,
  saveUserWebmailSettings,
} from "@/lib/db/webmail-settings"
import { getRavUrl, getRoundcubeUrl } from "@/lib/env"
import { recordAudit } from "@/lib/audit"
import {
  WebmailSettings,
} from "@/lib/webmail/types"

export type WebmailActionResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; error: string }

function hostFromUrl(urlStr: string): string {
  try {
    return new URL(urlStr).host
  } catch {
    return urlStr
  }
}

export async function getWebmailSettingsAction(): Promise<
  WebmailActionResult<WebmailSettings>
> {
  try {
    const session = await getSession().catch(() => null)
    const settings = await getUserWebmailSettings(session?.userId)
    return { ok: true, data: settings }
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Failed to load webmail settings.",
    }
  }
}

export async function saveWebmailSettingsAction(
  newSettings: WebmailSettings
): Promise<WebmailActionResult<WebmailSettings>> {
  try {
    const session = await getSession()
    if (!session || !session.userId) {
      return { ok: false, error: "Authentication required to update webmail settings." }
    }

    const saved = await saveUserWebmailSettings(session.userId, newSettings)

    await recordAudit({
      actor: session.username || "user",
      action: "webmail.settings_update",
      target: "webmail",
      detail: `Updated webmail preference to ${saved.client} (Rav: ${saved.ravFeatures.tantivySearch ? "Tantivy ON" : "OFF"}, Roundcube: ${saved.roundcubeFeatures.manageSieveSync ? "ManageSieve ON" : "OFF"})`,
    })

    revalidatePath("/dashboard/settings")
    revalidatePath("/dashboard/mailboxes")

    return { ok: true, data: saved }
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Failed to save webmail settings.",
    }
  }
}

export async function testWebmailEndpointsAction(): Promise<
  WebmailActionResult<{
    rav: { ok: boolean; url: string; host: string; error?: string }
    roundcube: { ok: boolean; url: string; host: string; error?: string }
  }>
> {
  const ravUrl = getRavUrl()
  const roundcubeUrl = getRoundcubeUrl()

  let ravOk = false
  let ravError: string | undefined
  try {
    const healthUrl = ravUrl.endsWith("/") ? `${ravUrl}api/health` : `${ravUrl}/api/health`
    const res = await fetch(healthUrl, {
      signal: AbortSignal.timeout(4000),
      cache: "no-store",
    })
    ravOk = res.ok
    if (!res.ok) ravError = `HTTP ${res.status}`
  } catch (err) {
    ravOk = false
    ravError = err instanceof Error ? err.message : "Endpoint unreachable"
  }

  let roundcubeOk = false
  let roundcubeError: string | undefined
  try {
    const res = await fetch(roundcubeUrl, {
      signal: AbortSignal.timeout(4000),
      cache: "no-store",
    })
    roundcubeOk = res.ok
    if (!res.ok) roundcubeError = `HTTP ${res.status}`
  } catch (err) {
    roundcubeOk = false
    roundcubeError = err instanceof Error ? err.message : "Endpoint unreachable"
  }

  return {
    ok: true,
    data: {
      rav: {
        ok: ravOk,
        url: ravUrl,
        host: hostFromUrl(ravUrl),
        error: ravError,
      },
      roundcube: {
        ok: roundcubeOk,
        url: roundcubeUrl,
        host: hostFromUrl(roundcubeUrl),
        error: roundcubeError,
      },
    },
  }
}

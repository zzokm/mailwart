"use server"

import { revalidatePath } from "next/cache"

import {
  dataSource as source,
  failResult as fail,
  okResult as ok,
} from "@/lib/actions/result"
import { AuthError, requireSession, sessionActor } from "@/lib/auth/session"
import { recordAudit } from "@/lib/audit"
import {
  clearCloudflareSettings,
  getCloudflareStatus,
  listCloudflareZones,
  provisionDomainDns,
  verifyCloudflareToken,
  writeCloudflareSettings,
  type CloudflareProvisionResult,
  type CloudflareStatus,
  type CloudflareZone,
} from "@/lib/cloudflare"
import { checkDomainDns, clearDnsCache } from "@/lib/dns"
import { queryDomains, StalwartError } from "@/lib/stalwart"
import type { ActionResult } from "@/lib/stalwart/types"
import {
  provisionCloudflareDnsSchema,
  saveCloudflareSettingsSchema,
} from "@/lib/validations/domain"

async function denyUnlessAuthed<T>(): Promise<ActionResult<T> | null> {
  const src = source()
  try {
    await requireSession()
    return null
  } catch (err) {
    if (err instanceof AuthError) {
      return fail(new StalwartError("Unauthorized.", "auth"), src)
    }
    throw err
  }
}

export async function getCloudflareStatusAction(): Promise<ActionResult<CloudflareStatus>> {
  const denied = await denyUnlessAuthed<CloudflareStatus>()
  if (denied) return denied
  const src = source()

  try {
    const status = await getCloudflareStatus()
    return ok(status, src)
  } catch (err) {
    return fail(err, src)
  }
}

export async function testCloudflareTokenAction(input?: {
  token?: string
}): Promise<
  ActionResult<{
    ok: boolean
    status: string
    accountName?: string
    accessibleZonesCount: number
    error?: string
  }>
> {
  const denied = await denyUnlessAuthed<{
    ok: boolean
    status: string
    accountName?: string
    accessibleZonesCount: number
  }>()
  if (denied) return denied
  const src = source()

  try {
    const result = await verifyCloudflareToken(input?.token)
    if (!result.ok) {
      return fail(new Error(result.error || "Token verification failed."), src)
    }
    return ok(result, src)
  } catch (err) {
    return fail(err, src)
  }
}

export async function saveCloudflareSettingsAction(input: {
  apiToken: string
  defaultMailHost?: string
}): Promise<ActionResult<CloudflareStatus>> {
  const denied = await denyUnlessAuthed<CloudflareStatus>()
  if (denied) return denied
  const src = source()

  const parsed = saveCloudflareSettingsSchema.safeParse(input)
  if (!parsed.success) {
    return fail(new Error(parsed.error.issues[0]?.message || "Invalid input"), src)
  }

  try {
    const test = await verifyCloudflareToken(parsed.data.apiToken)
    if (!test.ok) {
      return fail(
        new Error(`Could not verify token with Cloudflare: ${test.error || "Invalid token"}`),
        src
      )
    }

    await writeCloudflareSettings({
      apiToken: parsed.data.apiToken,
      accountName: test.accountName,
      lastVerifiedAt: new Date().toISOString(),
      defaultMailHost: parsed.data.defaultMailHost?.trim() || undefined,
    })

    const actor = await sessionActor()
    await recordAudit({
      actor,
      action: "cloudflare.settings_update",
      detail: `Configured Cloudflare token for account: ${test.accountName || "verified"}`,
    })

    revalidatePath("/dashboard/settings")
    revalidatePath("/dashboard/domains")

    const status = await getCloudflareStatus()
    return ok(status, src)
  } catch (err) {
    return fail(err, src)
  }
}

export async function clearCloudflareSettingsAction(): Promise<
  ActionResult<{ cleared: true }>
> {
  const denied = await denyUnlessAuthed<{ cleared: true }>()
  if (denied) return denied
  const src = source()

  try {
    await clearCloudflareSettings()
    const actor = await sessionActor()
    await recordAudit({
      actor,
      action: "cloudflare.settings_update",
      detail: "Removed Cloudflare API token",
    })

    revalidatePath("/dashboard/settings")
    revalidatePath("/dashboard/domains")

    return ok({ cleared: true }, src)
  } catch (err) {
    return fail(err, src)
  }
}

export async function getAvailableCloudflareDomainsAction(): Promise<
  ActionResult<{
    configured: boolean
    zones: CloudflareZone[]
    alreadyAddedDomains: string[]
  }>
> {
  const denied = await denyUnlessAuthed<{
    configured: boolean
    zones: CloudflareZone[]
    alreadyAddedDomains: string[]
  }>()
  if (denied) return denied
  const src = source()

  try {
    const status = await getCloudflareStatus()
    if (!status.configured) {
      return ok(
        {
          configured: false,
          zones: [],
          alreadyAddedDomains: [],
        },
        src
      )
    }

    const [zones, stalwartDomains] = await Promise.all([
      listCloudflareZones(),
      queryDomains().catch(() => []),
    ])

    const alreadyAdded = (stalwartDomains || []).map((d) => d.name.toLowerCase())

    return ok(
      {
        configured: true,
        zones,
        alreadyAddedDomains: alreadyAdded,
      },
      src
    )
  } catch (err) {
    return fail(err, src)
  }
}

export async function provisionCloudflareDnsAction(input: {
  domain: string
  selector?: string
  forceOverwrite?: boolean
}): Promise<ActionResult<CloudflareProvisionResult>> {
  const denied = await denyUnlessAuthed<CloudflareProvisionResult>()
  if (denied) return denied
  const src = source()

  const parsed = provisionCloudflareDnsSchema.safeParse(input)
  if (!parsed.success) {
    return fail(new Error(parsed.error.issues[0]?.message || "Invalid domain name"), src)
  }

  const domain = parsed.data.domain.toLowerCase()

  try {
    const result = await provisionDomainDns({
      domain,
      selector: parsed.data.selector,
      forceOverwrite: parsed.data.forceOverwrite,
    })

    // Invalidate cached DNS so the health matrix refreshes with latest live records
    clearDnsCache(domain)
    await checkDomainDns(domain, true)

    const actor = await sessionActor()
    const summary = result.records
      .map((r) => `${r.type}: ${r.action}`)
      .join(", ")

    await recordAudit({
      actor,
      action: "domain.dns_provision",
      target: domain,
      detail: `Cloudflare DNS auto-provisioned: ${summary}`,
    })

    revalidatePath(`/dashboard/domains`)
    revalidatePath(`/dashboard/domains/${domain}`)

    return ok(result, src)
  } catch (err) {
    return fail(err, src)
  }
}

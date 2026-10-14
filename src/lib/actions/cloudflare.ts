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
  auditTokenZonesForMail,
  clearCloudflareSettings,
  findZoneForDomain,
  getCloudflareStatus,
  listCloudflareZones,
  listZoneDnsRecords,
  propagateAllWebmailDns,
  provisionDomainDns,
  removeCloudflareAccount,
  resolveAllCloudflareAccounts,
  saveCloudflareAccount,
  verifyCloudflareToken,
  type CloudflareProvisionResult,
  type CloudflareStatus,
  type CloudflareZone,
  type WebmailPropagationSummary,
  type ZoneMailAudit,
} from "@/lib/cloudflare"
import { detectOlderMailRecords } from "@/lib/cloudflare/detect"
import { checkDomainDns, clearDnsCache } from "@/lib/dns"
import { queryDomains, StalwartError } from "@/lib/stalwart"
import type { ActionResult } from "@/lib/stalwart/types"
import {
  addCloudflareAccountSchema,
  auditCloudflareTokenSchema,
  provisionCloudflareDnsSchema,
  removeCloudflareAccountSchema,
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

/**
 * Onboarding step 1: Test token & inspect all accessible zones for existing/older mail service records.
 */
export async function auditNewCloudflareTokenAction(input: {
  apiToken: string
}): Promise<
  ActionResult<{
    ok: boolean
    accountName: string
    accountId?: string
    totalZonesCount: number
    zonesAudits: ZoneMailAudit[]
    conflictsCount: number
    error?: string
  }>
> {
  const denied = await denyUnlessAuthed<{
    ok: boolean
    accountName: string
    accountId?: string
    totalZonesCount: number
    zonesAudits: ZoneMailAudit[]
    conflictsCount: number
  }>()
  if (denied) return denied
  const src = source()

  const parsed = auditCloudflareTokenSchema.safeParse(input)
  if (!parsed.success) {
    return fail(new Error(parsed.error.issues[0]?.message || "Invalid API token"), src)
  }

  try {
    const audit = await auditTokenZonesForMail(parsed.data.apiToken.trim())
    if (!audit.ok) {
      return fail(new Error(audit.error || "Could not verify token with Cloudflare."), src)
    }
    return ok(audit, src)
  } catch (err) {
    return fail(err, src)
  }
}

/**
 * Onboarding step 2: Save the Cloudflare account, optionally replacing older mail records if user permitted.
 */
export async function addCloudflareAccountAction(input: {
  apiToken: string
  accountName?: string
  overwriteConflicts?: boolean
}): Promise<
  ActionResult<{
    status: CloudflareStatus
    overwrittenDomains: string[]
  }>
> {
  const denied = await denyUnlessAuthed<{
    status: CloudflareStatus
    overwrittenDomains: string[]
  }>()
  if (denied) return denied
  const src = source()

  const parsed = addCloudflareAccountSchema.safeParse(input)
  if (!parsed.success) {
    return fail(new Error(parsed.error.issues[0]?.message || "Invalid input"), src)
  }

  const token = parsed.data.apiToken.trim()
  const overwriteConflicts = parsed.data.overwriteConflicts ?? false

  try {
    // 1. Audit & verify
    const audit = await auditTokenZonesForMail(token)
    if (!audit.ok) {
      return fail(new Error(audit.error || "Token verification failed."), src)
    }

    const resolvedName = parsed.data.accountName?.trim() || audit.accountName || "Cloudflare Account"

    // 2. Persist account
    await saveCloudflareAccount({
      accountName: resolvedName,
      accountId: audit.accountId,
      apiToken: token,
      lastVerifiedAt: new Date().toISOString(),
      zonesCount: audit.totalZonesCount,
      status: "active",
    })

    const overwrittenDomains: string[] = []

    // 3. If user permitted overwrite of older mail records during onboarding:
    if (overwriteConflicts && audit.zonesAudits.length > 0) {
      for (const za of audit.zonesAudits) {
        if (za.hasConflicts) {
          try {
            await provisionDomainDns({
              domain: za.zoneName,
              forceOverwrite: true,
            })
            overwrittenDomains.push(za.zoneName)
            clearDnsCache(za.zoneName)
          } catch (provErr) {
            console.error(`Failed to provision zone ${za.zoneName} during onboarding:`, provErr)
          }
        }
      }
    }

    const actor = await sessionActor()
    await recordAudit({
      actor,
      action: "cloudflare.settings_update",
      detail: `Connected Cloudflare account "${resolvedName}" (${audit.totalZonesCount} zones pooled${
        overwrittenDomains.length > 0 ? `, replaced older mail records on: ${overwrittenDomains.join(", ")}` : ""
      })`,
    })

    revalidatePath("/dashboard/settings")
    revalidatePath("/dashboard/domains")

    const updatedStatus = await getCloudflareStatus()
    return ok(
      {
        status: updatedStatus,
        overwrittenDomains,
      },
      src
    )
  } catch (err) {
    return fail(err, src)
  }
}

/**
 * Removes a Cloudflare account.
 */
export async function removeCloudflareAccountAction(input: {
  accountId: string
}): Promise<ActionResult<CloudflareStatus>> {
  const denied = await denyUnlessAuthed<CloudflareStatus>()
  if (denied) return denied
  const src = source()

  const parsed = removeCloudflareAccountSchema.safeParse(input)
  if (!parsed.success) {
    return fail(new Error(parsed.error.issues[0]?.message || "Invalid account ID"), src)
  }

  try {
    const removed = await removeCloudflareAccount(parsed.data.accountId)
    if (!removed) {
      return fail(new Error("Account not found"), src)
    }

    const actor = await sessionActor()
    await recordAudit({
      actor,
      action: "cloudflare.settings_update",
      detail: `Removed Cloudflare account (${parsed.data.accountId})`,
    })

    revalidatePath("/dashboard/settings")
    revalidatePath("/dashboard/domains")

    const updatedStatus = await getCloudflareStatus()
    return ok(updatedStatus, src)
  } catch (err) {
    return fail(err, src)
  }
}

/**
 * Re-verifies and synchronizes a specific Cloudflare account.
 */
export async function testCloudflareAccountAction(input: {
  accountId: string
}): Promise<
  ActionResult<{
    ok: boolean
    status?: CloudflareStatus
    accountName: string
    zonesCount: number
    error?: string
  }>
> {
  const denied = await denyUnlessAuthed<{
    ok: boolean
    status?: CloudflareStatus
    accountName: string
    zonesCount: number
  }>()
  if (denied) return denied
  const src = source()

  try {
    const accounts = await resolveAllCloudflareAccounts()
    const target = accounts.find((a) => a.id === input.accountId)
    if (!target) {
      return fail(new Error("Account not found"), src)
    }

    const verified = await verifyCloudflareToken(target.apiToken)
    if (!verified.ok) {
      target.status = "error"
      target.errorMessage = verified.error
      await saveCloudflareAccount(target)
      return fail(new Error(verified.error || "Token verification failed"), src)
    }

    target.status = "active"
    target.accountName = verified.accountName || target.accountName
    target.accountId = verified.accountId || target.accountId
    target.zonesCount = verified.accessibleZonesCount
    target.lastVerifiedAt = new Date().toISOString()
    target.errorMessage = undefined

    await saveCloudflareAccount(target)
    revalidatePath("/dashboard/settings")

    const updatedStatus = await getCloudflareStatus()
    return ok(
      {
        ok: true,
        status: updatedStatus,
        accountName: target.accountName,
        zonesCount: verified.accessibleZonesCount,
      },
      src
    )
  } catch (err) {
    return fail(err, src)
  }
}

/**
 * Audits a single domain's zone for older mail service records before provisioning.
 */
export async function auditDomainDnsConflictsAction(input: {
  domain: string
}): Promise<ActionResult<ZoneMailAudit>> {
  const denied = await denyUnlessAuthed<ZoneMailAudit>()
  if (denied) return denied
  const src = source()

  try {
    const domain = input.domain.toLowerCase().trim()
    const found = await findZoneForDomain(domain)
    if (!found) {
      return fail(new Error(`No active Cloudflare zone found for ${domain}`), src)
    }

    const records = await listZoneDnsRecords(found.zone.id, found.account.apiToken)
    const audit = detectOlderMailRecords(domain, found.zone.id, found.zone.name, records)
    return ok(audit, src)
  } catch (err) {
    return fail(err, src)
  }
}

/**
 * Legacy single-account save (for backward compatibility).
 */
export async function saveCloudflareSettingsAction(input: {
  apiToken: string
  defaultMailHost?: string
}): Promise<ActionResult<CloudflareStatus>> {
  return (
    await addCloudflareAccountAction({
      apiToken: input.apiToken,
      overwriteConflicts: false,
    })
  ).ok
    ? await getCloudflareStatusAction()
    : fail(new Error("Failed to save settings"), source())
}

/**
 * Legacy single-account clear (for backward compatibility).
 */
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
      detail: "Cleared all Cloudflare settings",
    })

    revalidatePath("/dashboard/settings")
    revalidatePath("/dashboard/domains")

    return ok({ cleared: true }, src)
  } catch (err) {
    return fail(err, src)
  }
}

/**
 * Legacy test action (for backward compatibility).
 */
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

/**
 * Returns all pooled domains across all connected Cloudflare accounts.
 */
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

/**
 * Auto-provisions DNS in Cloudflare for a domain.
 * Dedicated mail target is ALWAYS mail.<domain>.
 * If forceOverwrite is true, replaces older conflicting records once permitted.
 */
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

    if (!result.success) {
      return fail(new Error(result.error || "Provisioning stopped due to existing records"), src)
    }

    // Invalidate cached DNS so the health matrix refreshes with latest live records
    clearDnsCache(domain)
    await checkDomainDns(domain, { bustCache: true })

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

/**
 * Auto-propagates webmail.<domain> CNAME records across all existing domains (both Cloudflare zones & Stalwart domains).
 */
export async function propagateAllWebmailDnsAction(): Promise<
  ActionResult<WebmailPropagationSummary>
> {
  const denied = await denyUnlessAuthed<WebmailPropagationSummary>()
  if (denied) return denied
  const src = source()

  try {
    // Collect any domains registered in Stalwart as well
    const stalwartDomains = await queryDomains().catch(() => [])
    const stalwartDomainNames = stalwartDomains
      .map((d) => (typeof d === "string" ? d : d.name || ""))
      .filter(Boolean)

    const result = await propagateAllWebmailDns(stalwartDomainNames)

    const actor = await sessionActor()
    await recordAudit({
      actor,
      action: "domain.dns_provision",
      target: "all_domains:webmail",
      detail: `Webmail DNS auto-propagated: ${result.successCount} succeeded, ${result.failureCount} failed out of ${result.total} domains.`,
    })

    revalidatePath("/dashboard/domains")
    revalidatePath("/dashboard/settings/cloudflare")
    revalidatePath("/dashboard/tools")

    return ok(result, src)
  } catch (err) {
    return fail(err, src)
  }
}


"use server"

import {
  recordAudit,
  readAuditEvents,
  type AuditAction,
  type AuditEvent,
} from "@/lib/audit"
import {
  queryDeliveryLogs,
  syncDomainsToDb,
  syncMailboxesToDb,
  assignDomainOwner,
  removeDomainRecord,
  assignMailboxOwner,
  getUserOwnedDomainNames,
  getUserOwnedDomainIds,
  isDomainOwnedByUser,
} from "@/lib/db"
import {
  dataSource as source,
  failResult as fail,
  okResult as ok,
  validateInput,
} from "@/lib/actions/result"
import {
  AuthError,
  getSession,
  requireSession,
  sessionActor,
} from "@/lib/auth/session"
import {
  getStalwartAdminUiUrl,
  getStalwartConfig,
  getRoundcubeUrl,
  hasStalwartConfig,
} from "@/lib/env"
import {
  ADMIN_DESTROY_CONFIRM,
  bulkResetPasswordsSchema,
  bulkSuspendSchema,
  bulkJobIdSchema,
  commitBulkChunkSchema,
  createAppPasswordSchema,
  createDomainSchema,
  createMailboxSchema,
  destroyByIdSchema,
  destroyDomainSchema,
  destroyForwardingSchema,
  destroyMailboxSchema,
  generateDkimSchema,
  generateDmarcSchema,
  mailboxIdsSchema,
  prepareBulkForwardingSchema,
  prepareBulkMailboxSchema,
  refreshDnsSchema,
  resetMailboxPasswordSchema,
  revokeAppPasswordSchema,
  updateAliasesSchema,
  updateCatchAllSchema,
  updateDomainSchema,
  updateMailboxSchema,
  updateMailExchangerSchema,
  updateSpamSettingsSchema,
  upsertAutoresponderSchema,
  upsertFilterRuleSchema,
  upsertForwardingSchema,
} from "@/lib/validations"
import { hostFromUrl, quotaSummary } from "@/lib/format"
import {
  abortJob,
  createForwardingJob,
  createMailboxJob,
  getJob,
  pauseJob,
  resumeJob,
  toReport,
  type BulkForwardJobRow,
  type BulkJobReport,
  type BulkMailboxJobRow,
} from "@/lib/bulk/job-store"
import {
  parseForwardingCsvText,
  parseMailboxCsvText,
} from "@/lib/bulk/prepare"
import { buildRoundcubeUrl } from "@/lib/roundcube"
import {
  clearDnsCache,
  generateDkimRecord,
  generateDmarcRecord,
  generateSpfRecord,
} from "@/lib/dns"
import { provisionDomainDns } from "@/lib/cloudflare"
import { ensureCatchAllMailbox } from "@/lib/stalwart/catchall"
import {
  bulkCreateAccounts,
  createAccount,
  createAppPasswordLive,
  createDomain,
  deriveMailExchanger,
  destroyAccount,
  destroyAppPasswordLive,
  destroyDomain,
  getAccount,
  getDomain,
  getDomainByName,
  getDomainDnsHealth,
  getMockStore,
  isExternalEmail,
  loadLiveSpamSettings,
  mailExchangerToAllowRelaying,
  mockHealth,
  normalizeAddressList,
  parseEmailAddress,
  parseEmailAliases,
  probeSieveJmapSupport,
  queryAccounts,
  queryAppPasswordsLive,
  queryDeliveryTracesLive,
  queryDomains,
  serializeEmailAliases,
  StalwartError,
  updateAccount,
  updateAccountAliases,
  updateAccountPassword,
  updateDomain,
  validateForwardTargets,
  type ActionResult,
  type AppPassword,
  type Autoresponder,
  type CatchAllMode,
  type DataSource,
  type DeliveryEvent,
  type DkimGeneratedRecord,
  type DmarcGeneratedRecord,
  type DnsHealthSummary,
  type DomainListItem,
  type EmailAliasEntry,
  type FilterAction,
  type FilterCondition,
  type FilterRule,
  type FilterScope,
  type ForwardingRule,
  type HealthStatus,
  type MailExchangerMode,
  type OverviewStats,
  type SpamSettings,
  type StalwartAccount,
  type StalwartDomain,
  type TwoFactorStatus,
} from "@/lib/stalwart"
import { jmapCall } from "@/lib/stalwart/client"

/** Deny unauthenticated mutations. Returns an ActionResult on failure, null when ok. */
async function denyUnlessAuthed<T>(): Promise<ActionResult<T> | null> {
  try {
    await requireSession()
    return null
  } catch (err) {
    if (err instanceof AuthError) {
      return fail(new StalwartError("Unauthorized.", "auth"), source())
    }
    throw err
  }
}

async function audit(
  action: AuditAction,
  opts: { target?: string; detail?: string; meta?: AuditEvent["meta"] } = {}
): Promise<void> {
  const actor = await sessionActor()
  await recordAudit({ actor, action, ...opts })
}

async function loadLiveDirectory(): Promise<{
  domains: StalwartDomain[]
  accounts: StalwartAccount[]
}> {
  const domains = await queryDomains()
  const accounts = await queryAccounts(domains)
  syncDomainsToDb(domains).catch(() => {})
  syncMailboxesToDb(
    accounts.map((a) => ({
      id: a.id,
      email: a.email,
      name: a.name,
      domainId: a.domainId,
      quotaBytes: 0,
      usedBytes: a.usedDiskQuota || 0,
      status: a.isEnabled === false ? "suspended" : "active",
    }))
  ).catch(() => {})
  return { domains, accounts }
}

function loadMockDirectory(): {
  domains: StalwartDomain[]
  accounts: StalwartAccount[]
} {
  const store = getMockStore()
  return { domains: store.domains, accounts: store.accounts }
}

async function loadScopedDirectory(): Promise<{
  domains: StalwartDomain[]
  accounts: StalwartAccount[]
}> {
  const session = await getSession().catch(() => null)
  const { domains: allDomains, accounts: allAccounts } =
    source() === "live" ? await loadLiveDirectory() : loadMockDirectory()

  if (!session || session.role === "admin") {
    return { domains: allDomains, accounts: allAccounts }
  }

  const userId = session.userId || ""
  const ownedNames = await getUserOwnedDomainNames(userId)
  const ownedIds = await getUserOwnedDomainIds(userId)
  const ownedNamesSet = new Set(ownedNames.map((n) => n.toLowerCase()))
  const ownedIdsSet = new Set(ownedIds)

  const filteredDomains = allDomains.filter(
    (d) => ownedNamesSet.has(d.name.toLowerCase()) || ownedIdsSet.has(d.id)
  )
  const filteredDomainIds = new Set(filteredDomains.map((d) => d.id))
  const filteredAccounts = allAccounts.filter((a) =>
    Boolean(a.domainId && filteredDomainIds.has(a.domainId))
  )

  return { domains: filteredDomains, accounts: filteredAccounts }
}

async function probeRoundcube(): Promise<HealthStatus["roundcube"]> {
  try {
    const res = await fetch(getRoundcubeUrl(), {
      method: "GET",
      signal: AbortSignal.timeout(5000),
      cache: "no-store",
    })
    return { ok: res.ok }
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Roundcube unreachable",
    }
  }
}

export async function getHealth(): Promise<HealthStatus> {
  if (!hasStalwartConfig()) {
    return mockHealth()
  }

  const started = Date.now()
  const roundcubePromise = probeRoundcube()
  try {
    await jmapCall([["x:Domain/query", { filter: null, limit: 1 }, "h0"]], {
      retry: true,
      timeoutMs: 10_000,
    })
    return {
      jmap: { ok: true, latencyMs: Date.now() - started },
      roundcube: await roundcubePromise,
      source: "live",
    }
  } catch (err) {
    return {
      jmap: {
        ok: false,
        latencyMs: Date.now() - started,
        error: err instanceof Error ? err.message : "JMAP health failed",
      },
      roundcube: await roundcubePromise,
      source: "live",
    }
  }
}

export async function getOverview(): Promise<
  ActionResult<{
    stats: OverviewStats
    health: HealthStatus
    domains: DomainListItem[]
    adminUiUrl: string
    roundcubeUrl: string
  }>
> {
  const src = source()
  const health = await getHealth()
  const session = await getSession().catch(() => null)
  const isAdmin = session?.role === "admin"
  try {
    const { domains, accounts } = await loadScopedDirectory()

    const list: DomainListItem[] = domains.map((d) => ({
      ...d,
      mailboxCount: accounts.filter((a) => a.domainId === d.id).length,
    }))

    let storageQuotaBytes: number | null = 0
    let storageUsedBytes: number | null = 0
    let hasQuota = false
    let hasUsed = false
    let mailboxesWithQuota = 0
    for (const a of accounts) {
      const q = quotaSummary(a.quotas)
      if (q.bytes != null) {
        hasQuota = true
        mailboxesWithQuota++
        storageQuotaBytes! += q.bytes
      }
      if (q.used != null) {
        hasUsed = true
        storageUsedBytes! += q.used
      }
    }
    if (!hasQuota) storageQuotaBytes = null
    if (!hasUsed) storageUsedBytes = null

    return ok(
      {
        stats: {
          domainCount: domains.length,
          mailboxCount: accounts.length,
          enabledDomainCount: domains.filter((d) => d.isEnabled !== false)
            .length,
          catchAllCount: domains.filter((d) => !!d.catchAllAddress).length,
          mailboxesWithQuota,
          storageQuotaBytes,
          storageUsedBytes,
          activeSessions: null,
        },
        health,
        domains: list,
        adminUiUrl: isAdmin ? getStalwartAdminUiUrl() : "",
        roundcubeUrl: buildRoundcubeUrl(),
      },
      src
    )
  } catch (err) {
    return fail(err, src)
  }
}

export async function listDomainsAction(): Promise<
  ActionResult<DomainListItem[]>
> {
  const src = source()
  const mailHost = configuredMailHost()
  try {
    const { domains, accounts } = await loadScopedDirectory()

    const list = await Promise.all(
      domains.map(async (d) => {
        const dns = await getDomainDnsHealth(d.name, {
          mailHostHint: mailHost,
          mock: src === "mock",
        })
        return {
          ...d,
          mailboxCount: accounts.filter((a) => a.domainId === d.id).length,
          dnsSummary: {
            worst: dns.worst,
            checks: dns.checks,
            checkedAt: dns.checkedAt,
            fromCache: dns.fromCache,
          },
        } satisfies DomainListItem
      })
    )

    return ok(list, src)
  } catch (err) {
    return fail(err, src)
  }
}

/** Mail host for DNS guidance, taken from deployment config rather than brand copy. */
function configuredMailHost(): string | undefined {
  const config = getStalwartConfig()
  if (!config) return undefined
  try {
    return new URL(config.jmapUrl).hostname
  } catch {
    return undefined
  }
}

export async function getDomainDetailAction(id: string): Promise<
  ActionResult<{
    domain: StalwartDomain
    mailboxes: StalwartAccount[]
    dns: DnsHealthSummary
  }>
> {
  const src = source()
  const mailHost = configuredMailHost()
  const session = await getSession().catch(() => null)
  const isAdmin = session?.role === "admin"
  try {
    if (session && !isAdmin) {
      const isOwned = await isDomainOwnedByUser(id, session.userId || "")
      if (!isOwned) {
        return fail(new StalwartError("Domain not found.", "not_found"), src)
      }
    }

    if (src === "mock") {
      const store = getMockStore()
      const domain = store.domains.find((d) => d.id === id)
      if (!domain) {
        return fail(new StalwartError("Domain not found.", "not_found"), src)
      }
      const dns = await getDomainDnsHealth(domain.name, {
        mailHostHint: mailHost,
        mock: true,
      })
      return ok(
        {
          domain,
          mailboxes: store.accounts.filter((a) => a.domainId === id),
          dns,
        },
        src
      )
    }

    const domain = await getDomain(id)
    if (!domain) {
      return fail(new StalwartError("Domain not found.", "not_found"), src)
    }
    const accounts = await queryAccounts([domain])
    const dns = await getDomainDnsHealth(domain.name, {
      mailHostHint: mailHost,
    })
    return ok(
      {
        domain,
        mailboxes: accounts.filter((a) => a.domainId === id),
        dns,
      },
      src
    )
  } catch (err) {
    return fail(err, src)
  }
}

export async function refreshDomainDnsAction(
  domainName: string
): Promise<ActionResult<DnsHealthSummary>> {
  const denied = await denyUnlessAuthed<DnsHealthSummary>()
  if (denied) return denied

  const src = source()
  const parsed = validateInput(refreshDnsSchema, { domainName }, src)
  if (!parsed.ok) return parsed.result
  const name = parsed.data.domainName

  try {
    const dns = await getDomainDnsHealth(name, {
      bustCache: true,
      mailHostHint: configuredMailHost(),
      mock: src === "mock",
    })

    if (dns.worst === "pass") {
      const session = await getSession().catch(() => null)
      await ensureCatchAllMailbox(name, session?.userId).catch(() => {})
    }

    return ok(dns, src)
  } catch (err) {
    return fail(err, src)
  }
}

export async function pollDomainsDnsAction(
  domainNames: string[]
): Promise<ActionResult<Record<string, DnsHealthSummary>>> {
  const denied = await denyUnlessAuthed<Record<string, DnsHealthSummary>>()
  if (denied) return denied

  const src = source()
  const session = await getSession().catch(() => null)
  const results: Record<string, DnsHealthSummary> = {}

  await Promise.all(
    domainNames.map(async (name) => {
      try {
        const dns = await getDomainDnsHealth(name, {
          bustCache: true,
          mailHostHint: configuredMailHost(),
          mock: src === "mock",
        })
        results[name] = dns
        if (dns.worst === "pass") {
          await ensureCatchAllMailbox(name, session?.userId).catch(() => {})
        }
      } catch {
        // Skip failed individual check
      }
    })
  )

  return ok(results, src)
}

export async function generateDkimAction(input: {
  domain: string
  selector?: string
}): Promise<ActionResult<DkimGeneratedRecord>> {
  const denied = await denyUnlessAuthed<DkimGeneratedRecord>()
  if (denied) return denied

  const src = source()
  const parsed = validateInput(generateDkimSchema, input, src)
  if (!parsed.ok) return parsed.result

  try {
    return ok(
      generateDkimRecord({
        domain: parsed.data.domain,
        selector: parsed.data.selector,
      }),
      src
    )
  } catch (err) {
    return fail(err, src)
  }
}

export async function generateDmarcAction(input: {
  domain: string
  policy?: "none" | "quarantine" | "reject"
  rua?: string
}): Promise<
  ActionResult<{
    dmarc: DmarcGeneratedRecord
    spf: { dnsName: string; dnsValue: string; zoneLine: string }
  }>
> {
  const denied = await denyUnlessAuthed<{
    dmarc: DmarcGeneratedRecord
    spf: { dnsName: string; dnsValue: string; zoneLine: string }
  }>()
  if (denied) return denied

  const src = source()
  const parsed = validateInput(generateDmarcSchema, input, src)
  if (!parsed.ok) return parsed.result

  try {
    return ok(
      {
        dmarc: generateDmarcRecord({
          domain: parsed.data.domain,
          policy: parsed.data.policy,
          rua: parsed.data.rua,
        }),
        spf: generateSpfRecord({
          domain: parsed.data.domain,
          mailHost: configuredMailHost(),
        }),
      },
      src
    )
  } catch (err) {
    return fail(err, src)
  }
}

export async function createDomainAction(input: {
  name: string
  description?: string
  autoProvisionDns?: boolean
}): Promise<ActionResult<StalwartDomain>> {
  const denied = await denyUnlessAuthed<StalwartDomain>()
  if (denied) return denied

  const src = source()
  const parsed = validateInput(createDomainSchema, input, src)
  if (!parsed.ok) return parsed.result
  const name = parsed.data.name.trim().toLowerCase()

  try {
    if (src === "mock") {
      const store = getMockStore()
      const existing = store.domains.find(
        (d) => d.name.toLowerCase() === name
      )
      if (existing) {
        const session = await getSession().catch(() => null)
        if (session?.userId) {
          await assignDomainOwner(existing.id, existing.name, session.userId)
        }
        await audit("domain.update", {
          target: existing.name,
          detail: "Linked existing domain",
        })
        await ensureCatchAllMailbox(name, session?.userId).catch(() => {})
        return ok(
          existing,
          src,
          parsed.data.autoProvisionDns
            ? "Cloudflare DNS auto-provisioned (mock)."
            : "Domain already registered in Stalwart; linked to your account."
        )
      }
      const domain: StalwartDomain = {
        id: `dom-${crypto.randomUUID().slice(0, 8)}`,
        name,
        description: parsed.data.description?.trim() || name,
        isEnabled: true,
        catchAllAddress: null,
        catchAllMode: "bounce",
        allowRelaying: false,
        mailExchanger: "local",
        domainAliases: [],
      }
      store.setDomains([...store.domains, domain])
      const session = await getSession().catch(() => null)
      if (session?.userId) {
        await assignDomainOwner(domain.id, domain.name, session.userId)
      }
      await audit("domain.create", {
        target: domain.name,
        detail: "Created domain",
      })
      await ensureCatchAllMailbox(name, session?.userId).catch(() => {})
      return ok(domain, src)
    }

    // Live Stalwart flow: check if domain already exists to handle idempotency cleanly
    const existing = await getDomainByName(name).catch(() => null)
    let domain: StalwartDomain
    let isExisting = false

    if (existing) {
      domain = existing
      isExisting = true
      // Enforce manual DNS & certificate management on existing domain
      await updateDomain(existing.id, {
        dnsManagement: "Manual",
        certificateManagement: "Manual",
      }).catch(() => {})
    } else {
      domain = await createDomain({
        name,
        description: parsed.data.description,
      })
    }

    const session = await getSession().catch(() => null)
    if (session?.userId) {
      await assignDomainOwner(domain.id, domain.name, session.userId)
    }
    await audit(isExisting ? "domain.update" : "domain.create", {
      target: domain.name,
      detail: isExisting ? "Linked existing domain" : "Created domain",
    })

    let note: string | undefined
    if (parsed.data.autoProvisionDns) {
      try {
        const cfResult = await provisionDomainDns({ domain: name })
        clearDnsCache(name)
        if (cfResult.success) {
          note = `Cloudflare DNS auto-provisioned (${cfResult.records.length} records: ${cfResult.records.map((r) => `${r.type}:${r.action}`).join(", ")}).`
        } else {
          note = `Domain ${isExisting ? "linked" : "created"} in Stalwart, but Cloudflare DNS was paused: ${cfResult.error}`
        }
      } catch (cfErr) {
        note = `Domain ${isExisting ? "linked" : "created"} in Stalwart, but Cloudflare DNS provisioning failed: ${cfErr instanceof Error ? cfErr.message : String(cfErr)}`
      }
    }

    // Immediately trigger initial DNS validation and catch-all creation if already propagated
    getDomainDnsHealth(name, {
      bustCache: true,
      mailHostHint: configuredMailHost(),
      mock: false,
    })
      .then(async (dns) => {
        if (dns.worst === "pass") {
          await ensureCatchAllMailbox(name, session?.userId).catch(() => {})
        }
      })
      .catch(() => {})

    return ok(
      domain,
      src,
      note ||
        (isExisting
          ? `Domain ${domain.name} already exists in Stalwart; linked to your account.`
          : undefined)
    )
  } catch (err) {
    return fail(err, src)
  }
}

export async function updateDomainAction(
  id: string,
  patch: Partial<{
    description: string
    isEnabled: boolean
    catchAllAddress: string | null
    catchAllMode: CatchAllMode
    allowRelaying: boolean
    mailExchanger: MailExchangerMode
  }>
): Promise<ActionResult<void>> {
  const denied = await denyUnlessAuthed<void>()
  if (denied) return denied

  const src = source()
  const parsed = validateInput(updateDomainSchema, { id, ...patch }, src)
  if (!parsed.ok) return parsed.result

  try {
    const session = await getSession().catch(() => null)
    const isAdmin = session?.role === "admin"
    if (session && !isAdmin) {
      const isOwned = await isDomainOwnedByUser(id, session.userId || "")
      if (!isOwned) {
        return fail(new StalwartError("Domain not found.", "not_found"), src)
      }
    }

    const mode = patch.catchAllMode
    let catchAllAddress = patch.catchAllAddress
    if (mode === "bounce" || mode === "blackhole") {
      catchAllAddress = null
    }
    if (mode === "address" && catchAllAddress === undefined) {
      // keep existing address from caller
    }

    if (src === "mock") {
      const store = getMockStore()
      const existing = store.domains.find((d) => d.id === id)
      if (!existing) {
        return fail(new StalwartError("Domain not found.", "not_found"), src)
      }
      const nextAddress =
        catchAllAddress !== undefined
          ? catchAllAddress
          : mode
            ? mode === "address"
              ? existing.catchAllAddress ?? null
              : null
            : existing.catchAllAddress

      if (mode === "address" || (nextAddress && mode !== "bounce" && mode !== "blackhole")) {
        const target = (nextAddress ?? "").toLowerCase()
        if (!target) {
          return fail(
            new StalwartError(
              "Select a catch-all mailbox on this domain.",
              "validation"
            ),
            src
          )
        }
        const exists = store.accounts.some(
          (a) => a.email.toLowerCase() === target && a.domainId === id
        )
        if (!exists) {
          return fail(
            new StalwartError(
              "Catch-all target mailbox must exist on this domain.",
              "validation"
            ),
            src
          )
        }
      }

      const mailExchanger =
        patch.mailExchanger ??
        (patch.allowRelaying !== undefined
          ? patch.allowRelaying
            ? "backup"
            : "local"
          : existing.mailExchanger)
      const allowRelaying =
        patch.allowRelaying ??
        (patch.mailExchanger
          ? mailExchangerToAllowRelaying(patch.mailExchanger)
          : existing.allowRelaying)

      const next = store.domains.map((d) =>
        d.id === id
          ? {
              ...d,
              ...patch,
              catchAllAddress: nextAddress,
              catchAllMode:
                mode ??
                (nextAddress
                  ? "address"
                  : (d.catchAllMode === "blackhole" ? "blackhole" : "bounce")),
              allowRelaying,
              mailExchanger,
            }
          : d
      )
      store.setDomains(next)
      await audit("domain.update", {
        target: existing.name,
        detail: "Updated domain settings",
      })
      return ok(undefined, src)
    }

    if (
      (mode === "address" || catchAllAddress) &&
      mode !== "bounce" &&
      mode !== "blackhole"
    ) {
      const domain = await getDomain(id)
      if (!domain) {
        return fail(new StalwartError("Domain not found.", "not_found"), src)
      }
      const accounts = await queryAccounts([domain])
      const target = (catchAllAddress ?? domain.catchAllAddress ?? "").toLowerCase()
      if (!target) {
        return fail(
          new StalwartError(
            "Select a catch-all mailbox on this domain.",
            "validation"
          ),
          src
        )
      }
      if (!accounts.some((a) => a.email.toLowerCase() === target)) {
        return fail(
          new StalwartError(
            "Catch-all target mailbox must exist on this domain.",
            "validation"
          ),
          src
        )
      }
      catchAllAddress = target
    }

    const livePatch: Partial<{
      description: string
      isEnabled: boolean
      catchAllAddress: string | null
      allowRelaying: boolean
    }> = {}
    if (patch.description !== undefined) livePatch.description = patch.description
    if (patch.isEnabled !== undefined) livePatch.isEnabled = patch.isEnabled
    if (mode === "bounce" || mode === "blackhole") {
      livePatch.catchAllAddress = null
    } else if (catchAllAddress !== undefined) {
      livePatch.catchAllAddress = catchAllAddress
    }
    if (patch.mailExchanger) {
      livePatch.allowRelaying = mailExchangerToAllowRelaying(patch.mailExchanger)
    } else if (patch.allowRelaying !== undefined) {
      livePatch.allowRelaying = patch.allowRelaying
    }

    const domain = await getDomain(id).catch(() => null)
    await updateDomain(id, livePatch)
    await audit("domain.update", {
      target: domain?.name ?? id,
      detail: "Updated domain settings",
    })
    return ok(undefined, src)
  } catch (err) {
    return fail(err, src)
  }
}

export async function destroyDomainAction(
  id: string,
  typedName: string,
  force = false
): Promise<ActionResult<void>> {
  const denied = await denyUnlessAuthed<void>()
  if (denied) return denied

  const src = source()
  const parsed = validateInput(destroyDomainSchema, { id, typedName, force }, src)
  if (!parsed.ok) return parsed.result

  try {
    const session = await getSession().catch(() => null)
    const isAdmin = session?.role === "admin"
    if (session && !isAdmin) {
      const isOwned = await isDomainOwnedByUser(id, session.userId || "")
      if (!isOwned) {
        return fail(new StalwartError("Domain not found.", "not_found"), src)
      }
    }

    if (src === "mock") {
      const store = getMockStore()
      const domain = store.domains.find((d) => d.id === id)
      if (!domain) {
        return fail(new StalwartError("Domain not found.", "not_found"), src)
      }
      if (parsed.data.typedName.toLowerCase() !== domain.name.toLowerCase()) {
        return fail(
          new StalwartError("Typed name does not match the domain.", "validation"),
          src
        )
      }
      const count = store.accounts.filter((a) => a.domainId === id).length
      if (count > 0 && !force) {
        return fail(
          new StalwartError(
            `${count} mailboxes remain. Clear them or force destroy.`,
            "validation"
          ),
          src
        )
      }
      store.setDomains(store.domains.filter((d) => d.id !== id))
      if (force) {
        store.setAccounts(store.accounts.filter((a) => a.domainId !== id))
      }
      await removeDomainRecord(id)
      await audit("domain.destroy", {
        target: domain.name,
        detail: force ? "Force-destroyed domain" : "Destroyed domain",
      })
      return ok(undefined, src)
    }

    const domain = await getDomain(id)
    if (!domain) {
      return fail(new StalwartError("Domain not found.", "not_found"), src)
    }
    if (parsed.data.typedName.toLowerCase() !== domain.name.toLowerCase()) {
      return fail(
        new StalwartError("Typed name does not match the domain.", "validation"),
        src
      )
    }
    // Match accounts belonging to this domain by ID, domain name, or email domain
    const allAccounts = await queryAccounts()
    const domainAccounts = allAccounts.filter((a) => {
      const matchesId = a.domainId === id || a.domainId === domain.id
      const matchesName =
        a.domainName?.toLowerCase() === domain.name.toLowerCase() ||
        a.domainId?.toLowerCase() === domain.name.toLowerCase()
      const matchesEmail = a.email
        .toLowerCase()
        .endsWith(`@${domain.name.toLowerCase()}`)
      return Boolean(matchesId || matchesName || matchesEmail)
    })

    if (domainAccounts.length > 0 && !force) {
      return fail(
        new StalwartError(
          `${domainAccounts.length} mailbox(es) remain for this domain (${domainAccounts
            .map((a) => a.email)
            .slice(0, 3)
            .join(", ")}...). Enable "Force destroy" to clear them automatically or delete them under Mailboxes first.`,
          "validation"
        ),
        src
      )
    }

    if (domainAccounts.length > 0 && force) {
      for (const acc of domainAccounts) {
        try {
          await destroyAccount(acc.id)
        } catch (accErr) {
          console.warn(`Failed destroying account ${acc.id} (${acc.email}):`, accErr)
        }
      }
    }

    await destroyDomain(id, domain.name)
    await removeDomainRecord(id)
    await audit("domain.destroy", {
      target: domain.name,
      detail: force ? "Force-destroyed domain" : "Destroyed domain",
    })
    return ok(undefined, src)
  } catch (err) {
    return fail(err, src)
  }
}

export async function listMailboxesAction(domainId?: string): Promise<
  ActionResult<{
    accounts: StalwartAccount[]
    domains: StalwartDomain[]
  }>
> {
  const src = source()
  try {
    const { domains, accounts } = await loadScopedDirectory()
    return ok(
      {
        domains,
        accounts: domainId
          ? accounts.filter((a) => a.domainId === domainId)
          : accounts,
      },
      src
    )
  } catch (err) {
    return fail(err, src)
  }
}

export async function getMailboxDetailAction(id: string): Promise<
  ActionResult<{
    account: StalwartAccount
    domains: StalwartDomain[]
    forwards: ForwardingRule[]
    roundcubeUrl: string
    aliasesEditable: boolean
    appPasswords: AppPassword[]
    appPasswordsMutable: boolean
    twoFactor: TwoFactorStatus
    adminUiUrl: string
  }>
> {
  const src = source()
  const session = await getSession().catch(() => null)
  const isAdmin = session?.role === "admin"
  const adminUiUrl = isAdmin ? getStalwartAdminUiUrl() : ""
  try {
    if (src === "mock") {
      const store = getMockStore()
      const account = store.accounts.find((a) => a.id === id)
      if (!account) {
        return fail(new StalwartError("Mailbox not found.", "not_found"), src)
      }
      if (session && !isAdmin) {
        const isOwned = account.domainId
          ? await isDomainOwnedByUser(account.domainId, session.userId || "")
          : false
        if (!isOwned) {
          return fail(new StalwartError("Mailbox not found.", "not_found"), src)
        }
      }
      return ok(
        {
          account,
          domains: store.domains,
          forwards: store.forwards.filter(
            (f) =>
              f.sourceAccountId === id ||
              f.source.toLowerCase() === account.email.toLowerCase()
          ),
          roundcubeUrl: buildRoundcubeUrl(account.email),
          aliasesEditable: true,
          appPasswords: account.appPasswords ?? [],
          appPasswordsMutable: true,
          twoFactor: account.twoFactor ?? { state: "disabled" },
          adminUiUrl,
        },
        src
      )
    }

    const { domains, accounts } = await loadScopedDirectory()
    const account = await getAccount(id, domains)
    if (!account) {
      return fail(new StalwartError("Mailbox not found.", "not_found"), src)
    }
    if (session && !isAdmin) {
      const isOwned = account.domainId
        ? await isDomainOwnedByUser(account.domainId, session.userId || "")
        : false
      if (!isOwned) {
        return fail(new StalwartError("Mailbox not found.", "not_found"), src)
      }
    }

    const liveList = await queryAppPasswordsLive(id)
    const appPasswords = liveList ?? account.appPasswords ?? []
    const appPasswordsMutable = liveList != null
    const twoFactor: TwoFactorStatus =
      account.twoFactor ??
      ({
        state: "unknown",
        note: "TODO: Confirm OtpAuth / Password.otpAuth shape on live Account/get.",
      } satisfies TwoFactorStatus)

    // EmailAlias map shape is documented; editor always available.
    const forwards = buildLiveForwardHints(domains, accounts).filter(
      (f) =>
        f.sourceAccountId === id ||
        f.source.toLowerCase() === account.email.toLowerCase() ||
        f.targets.some((t) => t.toLowerCase() === account.email.toLowerCase())
    )
    return ok(
      {
        account,
        domains,
        forwards,
        roundcubeUrl: buildRoundcubeUrl(account.email),
        aliasesEditable: true,
        appPasswords,
        appPasswordsMutable,
        twoFactor,
        adminUiUrl,
      },
      src
    )
  } catch (err) {
    return fail(err, src)
  }
}

export async function createMailboxAction(input: {
  domainId: string
  local: string
  password: string
  description?: string
  diskQuotaBytes?: number | null
}): Promise<ActionResult<StalwartAccount>> {
  const denied = await denyUnlessAuthed<StalwartAccount>()
  if (denied) return denied

  const src = source()
  const parsed = validateInput(createMailboxSchema, input, src)
  if (!parsed.ok) return parsed.result
  const local = parsed.data.local

  try {
    const session = await getSession().catch(() => null)
    const isAdmin = session?.role === "admin"
    if (session && !isAdmin) {
      const isOwned = await isDomainOwnedByUser(parsed.data.domainId, session.userId || "")
      if (!isOwned) {
        return fail(new StalwartError("Unauthorized to create mailboxes on this domain.", "auth"), src)
      }
    }

    if (src === "mock") {
      const store = getMockStore()
      const domain = store.domains.find((d) => d.id === parsed.data.domainId)
      if (!domain) {
        return fail(new StalwartError("Domain not found.", "not_found"), src)
      }
      const email = `${local}@${domain.name}`
      if (store.accounts.some((a) => a.email.toLowerCase() === email)) {
        return fail(
          new StalwartError(`${email} already exists.`, "validation"),
          src
        )
      }
      const account: StalwartAccount = {
        id: `acc-${crypto.randomUUID().slice(0, 8)}`,
        name: local,
        description: parsed.data.description?.trim() || email,
        domainId: domain.id,
        email,
        domainName: domain.name,
        isEnabled: true,
        quotas:
          parsed.data.diskQuotaBytes != null
            ? { diskQuota: parsed.data.diskQuotaBytes }
            : {},
        aliases: {},
        appPasswords: [],
        twoFactor: { state: "disabled" },
      }
      store.setAccounts([...store.accounts, account])
      if (session?.userId) {
        await assignMailboxOwner(account.id, account.email, session.userId)
      }
      await audit("mailbox.create", {
        target: email,
        detail: "Created mailbox",
      })
      return ok(account, src)
    }

    const domain = await getDomain(parsed.data.domainId)
    if (!domain) {
      return fail(new StalwartError("Domain not found.", "not_found"), src)
    }
    const email = `${local}@${domain.name}`
    const account = await createAccount({
      local,
      email,
      domainId: domain.id,
      password: parsed.data.password,
      description: parsed.data.description?.trim() || email,
      quotas:
        parsed.data.diskQuotaBytes != null
          ? { diskQuota: parsed.data.diskQuotaBytes }
          : {},
    })
    if (session?.userId) {
      await assignMailboxOwner(account.id, account.email, session.userId)
    }
    await audit("mailbox.create", {
      target: email,
      detail: "Created mailbox",
    })
    return ok(account, src)
  } catch (err) {
    return fail(err, src)
  }
}

export async function updateMailboxAction(
  id: string,
  patch: {
    description?: string
    diskQuotaBytes?: number | null
    isEnabled?: boolean
  }
): Promise<ActionResult<void>> {
  const denied = await denyUnlessAuthed<void>()
  if (denied) return denied

  const src = source()
  const parsed = validateInput(updateMailboxSchema, { id, ...patch }, src)
  if (!parsed.ok) return parsed.result

  try {
    const session = await getSession().catch(() => null)
    const isAdmin = session?.role === "admin"
    if (session && !isAdmin) {
      const targetAcc =
        src === "mock"
          ? getMockStore().accounts.find((a) => a.id === id)
          : await getAccount(id)
      if (
        !targetAcc ||
        !targetAcc.domainId ||
        !(await isDomainOwnedByUser(targetAcc.domainId, session.userId || ""))
      ) {
        return fail(new StalwartError("Unauthorized to modify this mailbox.", "auth"), src)
      }
    }

    const quotas =
      patch.diskQuotaBytes === undefined
        ? undefined
        : patch.diskQuotaBytes == null
          ? {}
          : { diskQuota: patch.diskQuotaBytes }

    if (src === "mock") {
      const store = getMockStore()
      const next = store.accounts.map((a) => {
        if (a.id !== id) return a
        return {
          ...a,
          description: patch.description ?? a.description,
          quotas: quotas ?? a.quotas,
          isEnabled:
            patch.isEnabled === undefined ? a.isEnabled : patch.isEnabled,
        }
      })
      const account = next.find((a) => a.id === id)
      if (!account) {
        return fail(new StalwartError("Mailbox not found.", "not_found"), src)
      }
      store.setAccounts(next)
      if (patch.isEnabled === false) {
        await audit("mailbox.suspend", {
          target: account.email,
          detail: "Suspended mailbox",
        })
      } else {
        await audit("mailbox.update", {
          target: account.email,
          detail: "Updated mailbox",
        })
      }
      return ok(undefined, src)
    }

    await updateAccount(id, {
      ...(patch.description != null ? { description: patch.description } : {}),
      ...(quotas != null ? { quotas } : {}),
      ...(patch.isEnabled !== undefined ? { isEnabled: patch.isEnabled } : {}),
    })
    const account = await getAccount(id).catch(() => null)
    if (patch.isEnabled === false) {
      await audit("mailbox.suspend", {
        target: account?.email,
        detail: "Suspended mailbox",
      })
    } else {
      await audit("mailbox.update", {
        target: account?.email ?? id,
        detail: "Updated mailbox",
      })
    }
    return ok(undefined, src)
  } catch (err) {
    return fail(err, src)
  }
}

export async function createAppPasswordAction(
  accountId: string,
  description: string
): Promise<ActionResult<{ password: AppPassword; secret: string }>> {
  const denied = await denyUnlessAuthed<{
    password: AppPassword
    secret: string
  }>()
  if (denied) return denied

  const src = source()
  const parsed = validateInput(
    createAppPasswordSchema,
    { accountId, description },
    src
  )
  if (!parsed.ok) return parsed.result
  const label = parsed.data.description

  try {
    const session = await getSession().catch(() => null)
    const isAdmin = session?.role === "admin"
    if (session && !isAdmin) {
      const targetAcc =
        src === "mock"
          ? getMockStore().accounts.find((a) => a.id === accountId)
          : await getAccount(accountId)
      if (
        !targetAcc ||
        !targetAcc.domainId ||
        !(await isDomainOwnedByUser(targetAcc.domainId, session.userId || ""))
      ) {
        return fail(new StalwartError("Unauthorized to modify this mailbox.", "auth"), src)
      }
    }

    if (src === "mock") {
      const store = getMockStore()
      const account = store.accounts.find((a) => a.id === accountId)
      if (!account) {
        return fail(new StalwartError("Mailbox not found.", "not_found"), src)
      }
      const secret = `mw-${crypto.randomUUID().replace(/-/g, "").slice(0, 24)}`
      const password: AppPassword = {
        id: `ap-${crypto.randomUUID().slice(0, 8)}`,
        description: label,
        createdAt: new Date().toISOString(),
        expiresAt: null,
      }
      store.setAccounts(
        store.accounts.map((a) =>
          a.id === accountId
            ? { ...a, appPasswords: [...(a.appPasswords ?? []), password] }
            : a
        )
      )
      await audit("app_password.create", {
        target: account.email,
        detail: `Created app password “${label}”`,
      })
      return ok({ password, secret }, src)
    }

    const created = await createAppPasswordLive({
      accountId,
      description: label,
    })
    if (!created.secret) {
      return fail(
        new StalwartError(
          "App password created but secret was not returned. Copy it from Stalwart Admin if shown there.",
          "jmap"
        ),
        src
      )
    }
    const liveAccount = await getAccount(accountId).catch(() => null)
    await audit("app_password.create", {
      target: liveAccount?.email ?? accountId,
      detail: `Created app password “${label}”`,
    })
    return ok({ password: created.password, secret: created.secret }, src)
  } catch (err) {
    return fail(err, src)
  }
}

export async function revokeAppPasswordAction(
  accountId: string,
  appPasswordId: string
): Promise<ActionResult<void>> {
  const denied = await denyUnlessAuthed<void>()
  if (denied) return denied

  const src = source()
  const parsed = validateInput(
    revokeAppPasswordSchema,
    { accountId, appPasswordId },
    src
  )
  if (!parsed.ok) return parsed.result

  try {
    const session = await getSession().catch(() => null)
    const isAdmin = session?.role === "admin"
    if (session && !isAdmin) {
      const targetAcc =
        src === "mock"
          ? getMockStore().accounts.find((a) => a.id === accountId)
          : await getAccount(accountId)
      if (
        !targetAcc ||
        !targetAcc.domainId ||
        !(await isDomainOwnedByUser(targetAcc.domainId, session.userId || ""))
      ) {
        return fail(new StalwartError("Unauthorized to modify this mailbox.", "auth"), src)
      }
    }

    if (src === "mock") {
      const store = getMockStore()
      const account = store.accounts.find((a) => a.id === accountId)
      if (!account) {
        return fail(new StalwartError("Mailbox not found.", "not_found"), src)
      }
      store.setAccounts(
        store.accounts.map((a) =>
          a.id === accountId
            ? {
                ...a,
                appPasswords: (a.appPasswords ?? []).filter(
                  (p) => p.id !== appPasswordId
                ),
              }
            : a
        )
      )
      await audit("app_password.revoke", {
        target: account.email,
        detail: "Revoked app password",
      })
      return ok(undefined, src)
    }

    const liveAccount = await getAccount(accountId).catch(() => null)
    await destroyAppPasswordLive(appPasswordId)
    await audit("app_password.revoke", {
      target: liveAccount?.email ?? accountId,
      detail: "Revoked app password",
    })
    return ok(undefined, src)
  } catch (err) {
    return fail(err, src)
  }
}

export async function resetMailboxPasswordAction(
  id: string,
  password: string
): Promise<ActionResult<{ email: string }>> {
  const denied = await denyUnlessAuthed<{ email: string }>()
  if (denied) return denied

  const src = source()
  const parsed = validateInput(resetMailboxPasswordSchema, { id, password }, src)
  if (!parsed.ok) return parsed.result

  try {
    const session = await getSession().catch(() => null)
    const isAdmin = session?.role === "admin"
    if (session && !isAdmin) {
      const targetAcc =
        src === "mock"
          ? getMockStore().accounts.find((a) => a.id === id)
          : await getAccount(id)
      if (
        !targetAcc ||
        !targetAcc.domainId ||
        !(await isDomainOwnedByUser(targetAcc.domainId, session.userId || ""))
      ) {
        return fail(new StalwartError("Unauthorized to modify this mailbox.", "auth"), src)
      }
    }

    if (src === "mock") {
      const store = getMockStore()
      const account = store.accounts.find((a) => a.id === id)
      if (!account) {
        return fail(new StalwartError("Mailbox not found.", "not_found"), src)
      }
      await audit("mailbox.password_reset", {
        target: account.email,
        detail: "Password reset",
      })
      return ok({ email: account.email }, src)
    }
    const account = await getAccount(id)
    if (!account) {
      return fail(new StalwartError("Mailbox not found.", "not_found"), src)
    }
    await updateAccountPassword(id, parsed.data.password)
    await audit("mailbox.password_reset", {
      target: account.email,
      detail: "Password reset",
    })
    return ok({ email: account.email }, src)
  } catch (err) {
    return fail(err, src)
  }
}

export async function destroyMailboxAction(
  id: string,
  typedEmail: string,
  opts?: { adminConfirm?: string }
): Promise<ActionResult<void>> {
  const denied = await denyUnlessAuthed<void>()
  if (denied) return denied

  const src = source()
  const parsed = validateInput(
    destroyMailboxSchema,
    { id, typedEmail, adminConfirm: opts?.adminConfirm },
    src
  )
  if (!parsed.ok) return parsed.result

  try {
    const session = await getSession().catch(() => null)
    const isAdmin = session?.role === "admin"
    if (session && !isAdmin) {
      const targetAcc =
        src === "mock"
          ? getMockStore().accounts.find((a) => a.id === id)
          : await getAccount(id)
      if (
        !targetAcc ||
        !targetAcc.domainId ||
        !(await isDomainOwnedByUser(targetAcc.domainId, session.userId || ""))
      ) {
        return fail(new StalwartError("Unauthorized to delete this mailbox.", "auth"), src)
      }
    }

    if (src === "mock") {
      const store = getMockStore()
      const account = store.accounts.find((a) => a.id === id)
      if (!account) {
        return fail(new StalwartError("Mailbox not found.", "not_found"), src)
      }
      if (parsed.data.typedEmail.toLowerCase() !== account.email.toLowerCase()) {
        return fail(
          new StalwartError("Typed address does not match.", "validation"),
          src
        )
      }
      if (account.isAdmin) {
        if (
          (parsed.data.adminConfirm ?? "").toUpperCase() !== ADMIN_DESTROY_CONFIRM
        ) {
          return fail(
            new StalwartError(
              `Admin mailbox requires dual-confirm: type ${ADMIN_DESTROY_CONFIRM}.`,
              "validation"
            ),
            src
          )
        }
      }
      const domain = store.domains.find((d) => d.id === account.domainId)
      if (
        domain?.catchAllAddress &&
        domain.catchAllAddress.toLowerCase() === account.email.toLowerCase()
      ) {
        return fail(
          new StalwartError(
            "Clear or retarget the domain catch-all before deleting this mailbox.",
            "validation"
          ),
          src
        )
      }
      store.setAccounts(store.accounts.filter((a) => a.id !== id))
      await audit("mailbox.destroy", {
        target: account.email,
        detail: account.isAdmin
          ? "Destroyed admin mailbox (dual-confirm)"
          : "Destroyed mailbox",
      })
      return ok(undefined, src)
    }

    const account = await getAccount(id)
    if (!account) {
      return fail(new StalwartError("Mailbox not found.", "not_found"), src)
    }
    if (parsed.data.typedEmail.toLowerCase() !== account.email.toLowerCase()) {
      return fail(
        new StalwartError("Typed address does not match.", "validation"),
        src
      )
    }
    if (account.isAdmin) {
      if (
        (parsed.data.adminConfirm ?? "").toUpperCase() !== ADMIN_DESTROY_CONFIRM
      ) {
        return fail(
          new StalwartError(
            `Admin mailbox requires dual-confirm: type ${ADMIN_DESTROY_CONFIRM}.`,
            "validation"
          ),
          src
        )
      }
    }
    if (account.domainId) {
      const domain = await getDomain(account.domainId)
      if (
        domain?.catchAllAddress &&
        domain.catchAllAddress.toLowerCase() === account.email.toLowerCase()
      ) {
        return fail(
          new StalwartError(
            "Clear or retarget the domain catch-all before deleting this mailbox.",
            "validation"
          ),
          src
        )
      }
    }
    await destroyAccount(id)
    await audit("mailbox.destroy", {
      target: account.email,
      detail: account.isAdmin
        ? "Destroyed admin mailbox (dual-confirm)"
        : "Destroyed mailbox",
    })
    return ok(undefined, src)
  } catch (err) {
    return fail(err, src)
  }
}

export async function bulkDestroyMailboxesAction(
  ids: string[]
): Promise<ActionResult<{ destroyed: number; failed: string[] }>> {
  const denied = await denyUnlessAuthed<{ destroyed: number; failed: string[] }>()
  if (denied) return denied

  const src = source()
  const parsed = validateInput(mailboxIdsSchema, ids, src)
  if (!parsed.ok) return parsed.result

  const failed: string[] = []
  let destroyed = 0
  for (const id of parsed.data) {
    const detail =
      src === "mock"
        ? getMockStore().accounts.find((a) => a.id === id)
        : await getAccount(id).catch(() => null)
    if (!detail) {
      failed.push(id)
      continue
    }
    // Already authenticated above; destroyMailboxAction re-checks session.
    // Admin mailboxes are skipped unless dual-confirm (not available in bulk).
    const result = await destroyMailboxAction(id, detail.email)
    if (result.ok) destroyed++
    else failed.push(detail.email)
  }
  return ok({ destroyed, failed }, src)
}

export async function bulkResetPasswordsAction(
  ids: string[],
  password: string
): Promise<ActionResult<{ reset: number; failed: string[] }>> {
  const denied = await denyUnlessAuthed<{ reset: number; failed: string[] }>()
  if (denied) return denied

  const src = source()
  const parsed = validateInput(bulkResetPasswordsSchema, { ids, password }, src)
  if (!parsed.ok) return parsed.result

  const failed: string[] = []
  let reset = 0
  for (const id of parsed.data.ids) {
    const result = await resetMailboxPasswordAction(id, parsed.data.password)
    if (result.ok) reset++
    else failed.push(id)
  }
  return ok({ reset, failed }, src)
}

export async function bulkSuspendMailboxesAction(
  ids: string[],
  suspend: boolean
): Promise<ActionResult<{ updated: number; failed: string[] }>> {
  const denied = await denyUnlessAuthed<{ updated: number; failed: string[] }>()
  if (denied) return denied

  const src = source()
  const parsed = validateInput(bulkSuspendSchema, { ids, suspend }, src)
  if (!parsed.ok) return parsed.result

  const failed: string[] = []
  let updated = 0
  for (const id of parsed.data.ids) {
    const result = await updateMailboxAction(id, {
      isEnabled: !parsed.data.suspend,
    })
    if (result.ok) updated++
    else failed.push(id)
  }
  return ok({ updated, failed }, src)
}

export async function prepareBulkMailboxJobAction(input: {
  csvText: string
  overwritePasswords?: boolean
}): Promise<ActionResult<{ job: BulkJobReport }>> {
  const denied = await denyUnlessAuthed<{ job: BulkJobReport }>()
  if (denied) return denied

  const src = source()
  const parsed = validateInput(prepareBulkMailboxSchema, input, src)
  if (!parsed.ok) return parsed.result

  try {
    const { valid, failed } = parseMailboxCsvText(parsed.data.csvText)
    const { domains, accounts } =
      src === "live" ? await loadLiveDirectory() : loadMockDirectory()
    const domainByName = new Map(domains.map((d) => [d.name.toLowerCase(), d]))
    const accountByEmail = new Map(
      accounts.map((a) => [a.email.toLowerCase(), a])
    )

    const rows: BulkMailboxJobRow[] = failed.map((f) => ({
      email: f.email,
      password: f.password,
      description: f.description,
      quotaBytes: null,
      local: "",
      domainId: "",
      domainName: "",
      status: "failed" as const,
      reason: f.reason,
    }))

    for (const row of valid) {
      const parsed = parseEmailAddress(row.email)
      if (!parsed) {
        rows.push({
          email: row.email,
          password: row.password,
          description: row.description,
          quotaBytes: row.quotaBytes,
          local: "",
          domainId: "",
          domainName: "",
          status: "failed",
          reason: "Invalid email.",
        })
        continue
      }
      const domain = domainByName.get(parsed.domain)
      if (!domain) {
        rows.push({
          email: row.email,
          password: row.password,
          description: row.description,
          quotaBytes: row.quotaBytes,
          local: parsed.local,
          domainId: "",
          domainName: parsed.domain,
          status: "failed",
          reason: `Unknown domain ${parsed.domain}.`,
        })
        continue
      }
      const email = `${parsed.local}@${domain.name}`
      const existing = accountByEmail.get(email.toLowerCase())
      rows.push({
        email,
        password: row.password,
        description: row.description || email,
        quotaBytes: row.quotaBytes,
        local: parsed.local,
        domainId: domain.id,
        domainName: domain.name,
        existingAccountId: existing?.id,
        status: "pending",
      })
    }

    const job = createMailboxJob({
      rows,
      overwritePasswords: !!parsed.data.overwritePasswords,
    })
    return ok({ job: toReport(job) }, src)
  } catch (err) {
    return fail(err, src)
  }
}

export async function prepareBulkForwardingJobAction(input: {
  csvText: string
}): Promise<ActionResult<{ job: BulkJobReport }>> {
  const denied = await denyUnlessAuthed<{ job: BulkJobReport }>()
  if (denied) return denied

  const src = source()
  const parsed = validateInput(prepareBulkForwardingSchema, input, src)
  if (!parsed.ok) return parsed.result

  try {
    const { valid, failed } = parseForwardingCsvText(parsed.data.csvText)
    const { domains, accounts } =
      src === "live" ? await loadLiveDirectory() : loadMockDirectory()
    const domainByName = new Map(domains.map((d) => [d.name.toLowerCase(), d]))
    const knownEmails = new Set(accounts.map((a) => a.email.toLowerCase()))
    const knownDomains = new Set(domains.map((d) => d.name.toLowerCase()))

    const rows: BulkForwardJobRow[] = failed.map((f) => ({
      source: f.source,
      targets: [],
      keepLocalCopy: false,
      enabled: true,
      domainId: "",
      domainName: "",
      scope: "user" as const,
      status: "failed" as const,
      reason: f.reason,
    }))

    for (const row of valid) {
      const isCatchAll = row.source.startsWith("*@")
      const domainPart = isCatchAll
        ? row.source.slice(2)
        : parseEmailAddress(row.source)?.domain
      if (!domainPart) {
        rows.push({
          source: row.source,
          targets: row.targets,
          keepLocalCopy: row.keepLocalCopy,
          enabled: row.enabled,
          domainId: "",
          domainName: "",
          scope: "user",
          status: "failed",
          reason: "Invalid source address.",
        })
        continue
      }
      const domain = domainByName.get(domainPart.toLowerCase())
      if (!domain) {
        rows.push({
          source: row.source,
          targets: row.targets,
          keepLocalCopy: row.keepLocalCopy,
          enabled: row.enabled,
          domainId: "",
          domainName: domainPart,
          scope: isCatchAll ? "domain" : "user",
          status: "failed",
          reason: `Unknown domain ${domainPart}.`,
        })
        continue
      }
      const targetCheck = validateForwardTargets(
        row.targets,
        knownEmails,
        knownDomains
      )
      if (!targetCheck.ok) {
        rows.push({
          source: row.source,
          targets: row.targets,
          keepLocalCopy: row.keepLocalCopy,
          enabled: row.enabled,
          domainId: domain.id,
          domainName: domain.name,
          scope: isCatchAll ? "domain" : "user",
          status: "failed",
          reason: targetCheck.error,
        })
        continue
      }
      rows.push({
        source: isCatchAll
          ? `*@${domain.name}`
          : `${parseEmailAddress(row.source)!.local}@${domain.name}`,
        targets: row.targets,
        keepLocalCopy: row.keepLocalCopy,
        enabled: row.enabled,
        domainId: domain.id,
        domainName: domain.name,
        scope: isCatchAll ? "domain" : "user",
        status: "pending",
      })
    }

    const job = createForwardingJob({ rows })
    return ok({ job: toReport(job) }, src)
  } catch (err) {
    return fail(err, src)
  }
}

export async function getBulkJobAction(
  jobId: string
): Promise<ActionResult<{ job: BulkJobReport }>> {
  const denied = await denyUnlessAuthed<{ job: BulkJobReport }>()
  if (denied) return denied

  const src = source()
  const parsed = validateInput(bulkJobIdSchema, { jobId }, src)
  if (!parsed.ok) return parsed.result

  const job = getJob(parsed.data.jobId)
  if (!job) {
    return fail(
      new StalwartError("Bulk job not found or expired.", "not_found"),
      src
    )
  }
  return ok({ job: toReport(job) }, src)
}

export async function abortBulkJobAction(
  jobId: string
): Promise<ActionResult<{ job: BulkJobReport }>> {
  const denied = await denyUnlessAuthed<{ job: BulkJobReport }>()
  if (denied) return denied

  const src = source()
  const parsed = validateInput(bulkJobIdSchema, { jobId }, src)
  if (!parsed.ok) return parsed.result

  const job = abortJob(parsed.data.jobId)
  if (!job) {
    return fail(
      new StalwartError("Bulk job not found or expired.", "not_found"),
      src
    )
  }
  await audit("bulk.abort", {
    target: job.id,
    detail: `Aborted bulk ${job.kind}`,
  })
  return ok({ job: toReport(job) }, src)
}

export async function pauseBulkJobAction(
  jobId: string
): Promise<ActionResult<{ job: BulkJobReport }>> {
  const denied = await denyUnlessAuthed<{ job: BulkJobReport }>()
  if (denied) return denied

  const src = source()
  const parsed = validateInput(bulkJobIdSchema, { jobId }, src)
  if (!parsed.ok) return parsed.result

  const job = pauseJob(parsed.data.jobId)
  if (!job) {
    return fail(
      new StalwartError("Bulk job not found or expired.", "not_found"),
      src
    )
  }
  return ok({ job: toReport(job) }, src)
}

export async function resumeBulkJobAction(
  jobId: string
): Promise<ActionResult<{ job: BulkJobReport }>> {
  const denied = await denyUnlessAuthed<{ job: BulkJobReport }>()
  if (denied) return denied

  const src = source()
  const parsed = validateInput(bulkJobIdSchema, { jobId }, src)
  if (!parsed.ok) return parsed.result

  const job = resumeJob(parsed.data.jobId)
  if (!job) {
    return fail(
      new StalwartError("Bulk job not found or expired.", "not_found"),
      src
    )
  }
  return ok({ job: toReport(job) }, src)
}

export async function commitBulkJobChunkAction(input: {
  jobId: string
  chunkIndex: number
}): Promise<ActionResult<{ job: BulkJobReport; chunkIndex: number }>> {
  const denied = await denyUnlessAuthed<{
    job: BulkJobReport
    chunkIndex: number
  }>()
  if (denied) return denied

  const src = source()
  const parsed = validateInput(commitBulkChunkSchema, input, src)
  if (!parsed.ok) return parsed.result

  try {
    const job = getJob(parsed.data.jobId)
    if (!job) {
      return fail(
        new StalwartError("Bulk job not found or expired.", "not_found"),
        src
      )
    }
    if (job.status === "aborted") {
      return ok({ job: toReport(job), chunkIndex: parsed.data.chunkIndex }, src)
    }
    if (job.status === "paused") {
      return fail(
        new StalwartError("Bulk job is paused.", "validation"),
        src
      )
    }

    // Idempotent: ignore replay of completed chunks.
    if (job.completedChunks.has(parsed.data.chunkIndex)) {
      return ok({ job: toReport(job), chunkIndex: parsed.data.chunkIndex }, src)
    }

    job.status = "running"
    const start = parsed.data.chunkIndex * job.chunkSize
    const end = start + job.chunkSize

    if (job.kind === "mailboxes" && job.mailboxRows) {
      await commitMailboxChunk(job.mailboxRows, start, end, {
        overwritePasswords: job.overwritePasswords,
        src,
      })
    } else if (job.kind === "forwarding" && job.forwardRows) {
      await commitForwardChunk(job.forwardRows, start, end)
    }

    job.completedChunks.add(parsed.data.chunkIndex)
    const report = toReport(job)
    if (report.status === "completed") {
      await audit("bulk.complete", {
        target: job.id,
        detail: `Bulk ${job.kind}: ${report.created} created, ${report.skipped} skipped, ${report.failed} failed${report.updated ? `, ${report.updated} updated` : ""}`,
        meta: {
          kind: job.kind,
          created: report.created,
          skipped: report.skipped,
          failed: report.failed,
          updated: report.updated,
        },
      })
    }
    return ok({ job: report, chunkIndex: parsed.data.chunkIndex }, src)
  } catch (err) {
    return fail(err, src)
  }
}

async function commitMailboxChunk(
  rows: BulkMailboxJobRow[],
  start: number,
  end: number,
  opts: { overwritePasswords: boolean; src: DataSource }
): Promise<void> {
  const slice = rows.slice(start, end)
  const toCreate: BulkMailboxJobRow[] = []

  for (const row of slice) {
    if (row.status !== "pending") continue

    if (row.existingAccountId) {
      if (opts.overwritePasswords) {
        const reset = await resetMailboxPasswordAction(
          row.existingAccountId,
          row.password
        )
        if (reset.ok && row.quotaBytes != null) {
          await updateMailboxAction(row.existingAccountId, {
            diskQuotaBytes: row.quotaBytes,
          })
        }
        row.status = reset.ok ? "updated" : "failed"
        row.reason = reset.ok
          ? "Password overwritten on existing mailbox."
          : reset.error
      } else {
        row.status = "skipped"
        row.reason = "Already exists."
      }
      continue
    }

    toCreate.push(row)
  }

  if (toCreate.length === 0) return

  if (opts.src === "mock") {
    const store = getMockStore()
    const next = [...store.accounts]
    for (const row of toCreate) {
      const account: StalwartAccount = {
        id: `acc-${crypto.randomUUID().slice(0, 8)}`,
        name: row.local,
        description: row.description,
        domainId: row.domainId,
        email: row.email,
        domainName: row.domainName,
        quotas:
          row.quotaBytes != null ? { diskQuota: row.quotaBytes } : {},
        aliases: {},
        isEnabled: true,
      }
      next.push(account)
      row.status = "created"
    }
    store.setAccounts(next)
    return
  }

  const created = await bulkCreateAccounts(
    toCreate.map((row) => ({
      local: row.local,
      email: row.email,
      domainId: row.domainId,
      password: row.password,
      description: row.description,
      quotas:
        row.quotaBytes != null ? { diskQuota: row.quotaBytes } : {},
    })),
    toCreate.length
  )

  for (const c of created) {
    const row = toCreate.find((r) => r.email === c.email)
    if (!row) continue
    row.status = c.status === "created" ? "created" : "failed"
    row.reason = c.reason
  }
}

async function commitForwardChunk(
  rows: BulkForwardJobRow[],
  start: number,
  end: number
): Promise<void> {
  const slice = rows.slice(start, end)
  for (const row of slice) {
    if (row.status !== "pending") continue
    const result = await upsertForwardingRuleAction({
      scope: row.scope,
      domainId: row.domainId,
      source: row.source,
      targets: row.targets,
      keepLocalCopy: row.keepLocalCopy,
      enabled: row.enabled,
    })
    if (result.ok) {
      row.status = "created"
    } else {
      row.status = "failed"
      row.reason = result.error
    }
  }
}

/** @deprecated Prefer prepareBulkMailboxJobAction + commitBulkJobChunkAction. */
export async function importMailboxesAction(input: {
  csvText: string
  overwritePasswords?: boolean
}): Promise<ActionResult<{ job: BulkJobReport }>> {
  return prepareBulkMailboxJobAction(input)
}

export async function getSettingsAction(): Promise<
  ActionResult<{
    roundcubeUrl: string
    roundcubeHost: string
    jmapConfigured: boolean
    jmapHost: string | null
    adminUiUrl: string
    stalwartUser: string | null
  }>
> {
  const src = source()
  const config = getStalwartConfig()
  const session = await getSession().catch(() => null)
  const isAdmin = session?.role === "admin"
  return ok(
    {
      roundcubeUrl: getRoundcubeUrl(),
      roundcubeHost: hostFromUrl(getRoundcubeUrl()),
      jmapConfigured: !!config,
      jmapHost: config ? hostFromUrl(config.jmapUrl) : null,
      adminUiUrl: isAdmin ? getStalwartAdminUiUrl() : "",
      stalwartUser: isAdmin ? (config?.adminUser ?? null) : null,
    },
    src
  )
}

export async function getRoundcubeLinkAction(email?: string): Promise<string> {
  return buildRoundcubeUrl(email)
}

export async function getRoutingOverviewAction(): Promise<
  ActionResult<{
    domains: StalwartDomain[]
    accounts: StalwartAccount[]
    forwards: ForwardingRule[]
    adminUiUrl: string
  }>
> {
  const src = source()
  try {
    const session = await getSession().catch(() => null)
    const isAdmin = session?.role === "admin"
    const { domains, accounts } = await loadScopedDirectory()
    const forwards = buildLiveForwardHints(domains, accounts)
    return ok(
      {
        domains,
        accounts,
        forwards,
        adminUiUrl: isAdmin ? getStalwartAdminUiUrl() : "",
      },
      src
    )
  } catch (err) {
    return fail(err, src)
  }
}

/** Synthesize read-only forward hints from live aliases + catch-alls. */
function buildLiveForwardHints(
  domains: StalwartDomain[],
  accounts: StalwartAccount[]
): ForwardingRule[] {
  const domainsById = new Map(domains.map((d) => [d.id, d]))
  const now = new Date().toISOString()
  const rules: ForwardingRule[] = []

  for (const account of accounts) {
    const aliases = parseEmailAliases(account.aliases, domainsById)
    for (const alias of aliases) {
      const domain = domainsById.get(alias.domainId)
      if (!domain || !alias.email) continue
      rules.push({
        id: `alias-${account.id}-${alias.key}`,
        scope: "user",
        domainId: domain.id,
        domainName: domain.name,
        source: alias.email,
        sourceAccountId: account.id,
        targets: [account.email],
        keepLocalCopy: true,
        enabled: alias.enabled,
        backend: "alias",
        updatedAt: now,
      })
    }
  }

  for (const domain of domains) {
    if (domain.catchAllAddress) {
      rules.push({
        id: `catchall-${domain.id}`,
        scope: "domain",
        domainId: domain.id,
        domainName: domain.name,
        source: `*@${domain.name}`,
        sourceAccountId: null,
        targets: [domain.catchAllAddress],
        keepLocalCopy: false,
        enabled: true,
        backend: "catchall",
        updatedAt: now,
      })
    }
  }

  return rules
}

export async function upsertForwardingRuleAction(input: {
  id?: string
  scope: "user" | "domain"
  domainId: string
  source: string
  sourceAccountId?: string | null
  targets: string[]
  keepLocalCopy?: boolean
  enabled?: boolean
}): Promise<ActionResult<ForwardingRule>> {
  const denied = await denyUnlessAuthed<ForwardingRule>()
  if (denied) return denied

  const src = source()
  const validated = validateInput(upsertForwardingSchema, input, src)
  if (!validated.ok) return validated.result

  try {
    const session = await getSession().catch(() => null)
    const isAdmin = session?.role === "admin"
    if (session && !isAdmin && !(await isDomainOwnedByUser(input.domainId, session.userId || ""))) {
      return fail(new StalwartError("Unauthorized to manage routing for this domain.", "auth"), src)
    }

    const targets = validated.data.targets
      .map((t) => t.trim().toLowerCase())
      .filter(Boolean)
    const enabled = validated.data.enabled !== false
    const keepLocalCopy = validated.data.keepLocalCopy === true
    input = { ...validated.data, targets }

    if (src === "mock") {
      const store = getMockStore()
      const domain = store.domains.find((d) => d.id === input.domainId)
      if (!domain) {
        return fail(new StalwartError("Domain not found.", "not_found"), src)
      }

      const knownEmails = new Set(
        store.accounts.map((a) => a.email.toLowerCase())
      )
      const knownDomains = new Set(
        store.domains.map((d) => d.name.toLowerCase())
      )
      const valid = validateForwardTargets(targets, knownEmails, knownDomains)
      if (!valid.ok) {
        return fail(new StalwartError(valid.error, "validation"), src)
      }

      let source = input.source.trim().toLowerCase()
      let sourceAccountId = input.sourceAccountId ?? null

      if (input.scope === "domain") {
        source = `*@${domain.name}`
        sourceAccountId = null
      } else {
        if (!source.includes("@")) {
          source = `${source}@${domain.name}`
        }
        const account =
          store.accounts.find((a) => a.id === sourceAccountId) ??
          store.accounts.find((a) => a.email.toLowerCase() === source)
        if (account) {
          source = account.email.toLowerCase()
          sourceAccountId = account.id
        }
      }

      const now = new Date().toISOString()
      if (input.id) {
        const existing = store.forwards.find((f) => f.id === input.id)
        if (!existing) {
          return fail(
            new StalwartError("Forwarding rule not found.", "not_found"),
            src
          )
        }
        const updated: ForwardingRule = {
          ...existing,
          scope: input.scope,
          domainId: domain.id,
          domainName: domain.name,
          source,
          sourceAccountId,
          targets,
          keepLocalCopy,
          enabled,
          updatedAt: now,
        }
        store.setForwards(
          store.forwards.map((f) => (f.id === input.id ? updated : f))
        )
        await audit("forwarding.upsert", {
          target: updated.source,
          detail: "Updated forwarding rule",
        })
        return ok(updated, src)
      }

      const created: ForwardingRule = {
        id: `fwd-${crypto.randomUUID().slice(0, 8)}`,
        scope: input.scope,
        domainId: domain.id,
        domainName: domain.name,
        source,
        sourceAccountId,
        targets,
        keepLocalCopy,
        enabled,
        backend: "mock",
        updatedAt: now,
      }
      store.setForwards([...store.forwards, created])
      await audit("forwarding.upsert", {
        target: created.source,
        detail: "Created forwarding rule",
      })
      return ok(created, src)
    }

    // Live: domain forward with single internal target → catch-all.
    // User forward to a mailbox via alias local-part → EmailAlias on target.
    // External redirects need Sieve (Phase 4 filters).
    const domains = await queryDomains()
    const domain = domains.find((d) => d.id === input.domainId)
    if (!domain) {
      return fail(new StalwartError("Domain not found.", "not_found"), src)
    }
    const accounts = await queryAccounts(domains)
    const knownEmails = new Set(accounts.map((a) => a.email.toLowerCase()))
    const knownDomains = new Set(domains.map((d) => d.name.toLowerCase()))
    const valid = validateForwardTargets(targets, knownEmails, knownDomains)
    if (!valid.ok) {
      return fail(new StalwartError(valid.error, "validation"), src)
    }

    const now = new Date().toISOString()

    if (input.scope === "domain") {
      if (targets.length !== 1 || isExternalEmail(targets[0], knownDomains)) {
        return fail(
          new StalwartError(
            "Live domain forwards map to catch-all: use one internal mailbox target, or configure Sieve in Filters.",
            "validation"
          ),
          src
        )
      }
      await updateDomain(domain.id, { catchAllAddress: targets[0] })
      const rule: ForwardingRule = {
        id: `catchall-${domain.id}`,
        scope: "domain",
        domainId: domain.id,
        domainName: domain.name,
        source: `*@${domain.name}`,
        sourceAccountId: null,
        targets,
        keepLocalCopy: false,
        enabled: true,
        backend: "catchall",
        updatedAt: now,
      }
      await audit("forwarding.upsert", {
        target: rule.source,
        detail: "Set domain catch-all forward",
      })
      return ok(rule, src)
    }

    // User scope: if source is a new local-part and single internal target → alias on target.
    let source = input.source.trim().toLowerCase()
    if (!source.includes("@")) source = `${source}@${domain.name}`
    const parsed = parseEmailAddress(source)
    if (!parsed || parsed.domain !== domain.name) {
      return fail(
        new StalwartError(
          "Source must be a local address on the selected domain.",
          "validation"
        ),
        src
      )
    }

    const sourceAccount = accounts.find(
      (a) => a.email.toLowerCase() === source
    )
    const allExternal = targets.every((t) => isExternalEmail(t, knownDomains))

    if (sourceAccount && allExternal) {
      return fail(
        new StalwartError(
          "External mailbox redirects need Sieve (Filters / ManageSieve). Aliases only accept alternate local-parts into a mailbox.",
          "validation"
        ),
        src
      )
    }

    if (targets.length === 1 && !isExternalEmail(targets[0], knownDomains)) {
      const targetAccount = accounts.find(
        (a) => a.email.toLowerCase() === targets[0]
      )
      if (!targetAccount) {
        return fail(
          new StalwartError("Target mailbox not found.", "not_found"),
          src
        )
      }
      if (sourceAccount && sourceAccount.id === targetAccount.id) {
        return fail(
          new StalwartError(
            "Source and target are the same mailbox — nothing to forward.",
            "validation"
          ),
          src
        )
      }
      // Alias: deliver source local-part into target mailbox.
      if (sourceAccount) {
        return fail(
          new StalwartError(
            "Cannot alias an existing mailbox onto another. Create a free local-part as the source, or use Sieve for redirects.",
            "validation"
          ),
          src
        )
      }
      const domainsById = new Map(domains.map((d) => [d.id, d]))
      const existing = parseEmailAliases(targetAccount.aliases, domainsById)
      if (
        existing.some(
          (a) =>
            a.name.toLowerCase() === parsed.local && a.domainId === domain.id
        )
      ) {
        return fail(
          new StalwartError(
            `${source} is already an alias on ${targetAccount.email}.`,
            "validation"
          ),
          src
        )
      }
      const next = [
        ...existing,
        {
          key: String(existing.length),
          name: parsed.local,
          domainId: domain.id,
          enabled,
          description: `Forward via alias → ${targetAccount.email}`,
          email: source,
        },
      ]
      await updateAccountAliases(targetAccount.id, serializeEmailAliases(next))
      const rule: ForwardingRule = {
        id: `alias-${targetAccount.id}-${parsed.local}`,
        scope: "user",
        domainId: domain.id,
        domainName: domain.name,
        source,
        sourceAccountId: targetAccount.id,
        targets: [targetAccount.email],
        keepLocalCopy: true,
        enabled,
        backend: "alias",
        updatedAt: now,
      }
      await audit("forwarding.upsert", {
        target: rule.source,
        detail: `Alias → ${targetAccount.email}`,
      })
      return ok(rule, src)
    }

    return fail(
      new StalwartError(
        "This forward shape is not representable on Stalwart Account/Domain fields. Use Filters (Sieve) or Stalwart Admin.",
        "validation"
      ),
      src
    )
  } catch (err) {
    return fail(err, src)
  }
}

export async function destroyForwardingRuleAction(
  id: string
): Promise<ActionResult<void>> {
  const denied = await denyUnlessAuthed<void>()
  if (denied) return denied

  const src = source()
  const parsed = validateInput(destroyForwardingSchema, { id }, src)
  if (!parsed.ok) return parsed.result

  try {
    const session = await getSession().catch(() => null)
    const isAdmin = session?.role === "admin"
    if (session && !isAdmin) {
      if (id.startsWith("catchall-")) {
        const domainId = id.slice("catchall-".length)
        if (!(await isDomainOwnedByUser(domainId, session.userId || ""))) {
          return fail(new StalwartError("Unauthorized to delete this forwarding rule.", "auth"), src)
        }
      } else if (id.startsWith("alias-")) {
        const rest = id.slice("alias-".length)
        const dash = rest.indexOf("-")
        const accountId = dash > 0 ? rest.slice(0, dash) : ""
        const targetAcc =
          src === "mock"
            ? getMockStore().accounts.find((a) => a.id === accountId)
            : await getAccount(accountId)
        if (
          !targetAcc ||
          !targetAcc.domainId ||
          !(await isDomainOwnedByUser(targetAcc.domainId, session.userId || ""))
        ) {
          return fail(new StalwartError("Unauthorized to delete this forwarding rule.", "auth"), src)
        }
      }
    }

    if (src === "mock") {
      const store = getMockStore()
      if (!store.forwards.some((f) => f.id === id)) {
        return fail(
          new StalwartError("Forwarding rule not found.", "not_found"),
          src
        )
      }
      store.setForwards(store.forwards.filter((f) => f.id !== id))
      await audit("forwarding.destroy", {
        target: id,
        detail: "Destroyed forwarding rule",
      })
      return ok(undefined, src)
    }

    if (id.startsWith("catchall-")) {
      const domainId = id.slice("catchall-".length)
      await updateDomain(domainId, { catchAllAddress: null })
      await audit("forwarding.destroy", {
        target: id,
        detail: "Cleared catch-all forward",
      })
      return ok(undefined, src)
    }

    if (id.startsWith("alias-")) {
      // alias-{accountId}-{keyOrLocal}
      const rest = id.slice("alias-".length)
      const dash = rest.indexOf("-")
      if (dash <= 0) {
        return fail(
          new StalwartError("Malformed alias rule id.", "validation"),
          src
        )
      }
      const accountId = rest.slice(0, dash)
      const aliasKey = rest.slice(dash + 1)
      const domains = await queryDomains()
      const account = await getAccount(accountId, domains)
      if (!account) {
        return fail(new StalwartError("Mailbox not found.", "not_found"), src)
      }
      const domainsById = new Map(domains.map((d) => [d.id, d]))
      const existing = parseEmailAliases(account.aliases, domainsById)
      const next = existing.filter(
        (a) => a.key !== aliasKey && a.name !== aliasKey
      )
      await updateAccountAliases(accountId, serializeEmailAliases(next))
      await audit("forwarding.destroy", {
        target: account.email,
        detail: `Removed alias ${aliasKey}`,
      })
      return ok(undefined, src)
    }

    return fail(
      new StalwartError(
        "This forward cannot be deleted via JMAP — manage it in Filters or Stalwart Admin.",
        "validation"
      ),
      src
    )
  } catch (err) {
    return fail(err, src)
  }
}

export async function updateMailExchangerAction(
  domainId: string,
  mode: MailExchangerMode
): Promise<ActionResult<{ mode: MailExchangerMode; note?: string }>> {
  const denied = await denyUnlessAuthed<{
    mode: MailExchangerMode
    note?: string
  }>()
  if (denied) return denied

  const src = source()
  const validated = validateInput(
    updateMailExchangerSchema,
    { domainId, mode },
    src
  )
  if (!validated.ok) return validated.result

  try {
    const session = await getSession().catch(() => null)
    const isAdmin = session?.role === "admin"
    if (session && !isAdmin && !(await isDomainOwnedByUser(domainId, session.userId || ""))) {
      return fail(new StalwartError("Unauthorized to modify MX posture for this domain.", "auth"), src)
    }

    const allowRelaying = mailExchangerToAllowRelaying(mode)
    const note =
      mode === "local"
        ? "Local MX: unknown recipients follow catch-all / bounce."
        : mode === "backup"
          ? "Backup MX: allowRelaying on — unknown local recipients may be accepted and relayed."
          : "Remote MX: domain still registered locally; point public MX elsewhere and keep allowRelaying on for split delivery."

    if (src === "mock") {
      const store = getMockStore()
      if (!store.domains.some((d) => d.id === domainId)) {
        return fail(new StalwartError("Domain not found.", "not_found"), src)
      }
      store.setDomains(
        store.domains.map((d) =>
          d.id === domainId
            ? { ...d, mailExchanger: mode, allowRelaying }
            : d
        )
      )
      const domain = store.domains.find((d) => d.id === domainId)
      await audit("mx.update", {
        target: domain?.name ?? domainId,
        detail: `MX posture → ${mode}`,
      })
      return ok({ mode, note }, src)
    }

    await updateDomain(domainId, { allowRelaying })
    const domain = await getDomain(domainId).catch(() => null)
    await audit("mx.update", {
      target: domain?.name ?? domainId,
      detail: `MX posture → ${mode}`,
    })
    return ok({ mode: deriveMailExchanger({ allowRelaying, mailExchanger: mode }), note }, src)
  } catch (err) {
    return fail(err, src)
  }
}

export async function updateMailboxAliasesAction(
  accountId: string,
  aliases: Array<{
    name: string
    domainId: string
    enabled?: boolean
    description?: string
    key?: string
  }>
): Promise<ActionResult<EmailAliasEntry[]>> {
  const denied = await denyUnlessAuthed<EmailAliasEntry[]>()
  if (denied) return denied

  const src = source()
  const validated = validateInput(
    updateAliasesSchema,
    { accountId, aliases },
    src
  )
  if (!validated.ok) return validated.result

  try {
    const session = await getSession().catch(() => null)
    const isAdmin = session?.role === "admin"
    if (session && !isAdmin) {
      const targetAcc =
        src === "mock"
          ? getMockStore().accounts.find((a) => a.id === accountId)
          : await getAccount(accountId)
      if (
        !targetAcc ||
        !targetAcc.domainId ||
        !(await isDomainOwnedByUser(targetAcc.domainId, session.userId || ""))
      ) {
        return fail(new StalwartError("Unauthorized to modify this mailbox.", "auth"), src)
      }
    }
    const domains =
      src === "mock" ? getMockStore().domains : await queryDomains()
    const domainsById = new Map(domains.map((d) => [d.id, d]))
    const knownEmails = new Set(
      (src === "mock"
        ? getMockStore().accounts
        : await queryAccounts(domains)
      ).map((a) => a.email.toLowerCase())
    )

    const normalized: EmailAliasEntry[] = []
    for (let i = 0; i < validated.data.aliases.length; i++) {
      const raw = validated.data.aliases[i]
      const name = raw.name
      const domain = domainsById.get(raw.domainId)
      if (!domain) {
        return fail(
          new StalwartError("Alias domain not found.", "not_found"),
          src
        )
      }
      const email = `${name}@${domain.name}`.toLowerCase()
      if (knownEmails.has(email)) {
        return fail(
          new StalwartError(
            `${email} is already a mailbox — pick a free local-part.`,
            "validation"
          ),
          src
        )
      }
      if (
        normalized.some(
          (a) => a.name === name && a.domainId === raw.domainId
        )
      ) {
        return fail(
          new StalwartError(`Duplicate alias ${email}.`, "validation"),
          src
        )
      }
      normalized.push({
        key: raw.key && /^\d+$/.test(raw.key) ? raw.key : String(i),
        name,
        domainId: domain.id,
        enabled: raw.enabled !== false,
        description: raw.description?.trim() || undefined,
        email,
      })
    }

    if (src === "mock") {
      const store = getMockStore()
      const account = store.accounts.find((a) => a.id === accountId)
      if (!account) {
        return fail(new StalwartError("Mailbox not found.", "not_found"), src)
      }
      const previous = parseEmailAliases(account.aliases, domainsById)
      const map = serializeEmailAliases(
        normalized,
        previous.map((a) => a.key)
      )
      // Drop nulls for mock storage — keep only live entries.
      const stored: Record<string, Record<string, unknown>> = {}
      for (const [k, v] of Object.entries(map)) {
        if (v) stored[k] = v
      }
      store.setAccounts(
        store.accounts.map((a) =>
          a.id === accountId ? { ...a, aliases: stored } : a
        )
      )
      await audit("mailbox.aliases_update", {
        target: account.email,
        detail: `Updated ${normalized.length} alias(es)`,
      })
      return ok(normalized, src)
    }

    const account = await getAccount(accountId, domains)
    if (!account) {
      return fail(new StalwartError("Mailbox not found.", "not_found"), src)
    }
    const previous = parseEmailAliases(account.aliases, domainsById)
    await updateAccountAliases(
      accountId,
      serializeEmailAliases(
        normalized,
        previous.map((a) => a.key)
      )
    )
    await audit("mailbox.aliases_update", {
      target: account.email,
      detail: `Updated ${normalized.length} alias(es)`,
    })
    return ok(normalized, src)
  } catch (err) {
    return fail(err, src)
  }
}

export async function updateCatchAllAction(
  domainId: string,
  input: {
    mode: CatchAllMode
    address?: string | null
  }
): Promise<ActionResult<{ mode: CatchAllMode; note?: string }>> {
  const denied = await denyUnlessAuthed<{
    mode: CatchAllMode
    note?: string
  }>()
  if (denied) return denied

  const src = source()
  const validated = validateInput(
    updateCatchAllSchema,
    { domainId, mode: input.mode, address: input.address },
    src
  )
  if (!validated.ok) return validated.result

  const result = await updateDomainAction(domainId, {
    catchAllMode: validated.data.mode,
    catchAllAddress:
      validated.data.mode === "address" ? (validated.data.address ?? null) : null,
  })
  if (!result.ok) return result

  await audit("catchall.update", {
    target: domainId,
    detail: `Catch-all → ${validated.data.mode}`,
  })

  const note =
    validated.data.mode === "blackhole" && source() === "live"
      ? "Stalwart has no discard-at-SMTP flag — blackhole clears catch-all (same as bounce). Use a discard mailbox or Sieve for true drop."
      : validated.data.mode === "bounce"
        ? "Unknown recipients are rejected at SMTP."
        : validated.data.mode === "blackhole"
          ? "Unknown recipients are discarded (mock)."
          : undefined

  return ok(
    {
      mode: validated.data.mode,
      note,
    },
    result.source
  )
}

// ─── Filters / autoresponders / spam (Phase 3.5) ─────────────────────────────

export async function getFiltersOverviewAction(): Promise<
  ActionResult<{
    accounts: StalwartAccount[]
    domains: StalwartDomain[]
    autoresponders: Autoresponder[]
    filterRules: FilterRule[]
    spam: SpamSettings
    sieveAvailable: boolean
    sieveNote: string
    adminUiUrl: string
    roundcubeUrl: string
  }>
> {
  const src = source()
  try {
    const session = await getSession().catch(() => null)
    const isAdmin = session?.role === "admin"
    const { domains, accounts } = await loadScopedDirectory()
    const domainIds = new Set(domains.map((d) => d.id))
    const accountIds = new Set(accounts.map((a) => a.id))

    if (src === "mock") {
      const store = getMockStore()
      return ok(
        {
          accounts,
          domains,
          autoresponders: store.autoresponders.filter(
            (a) => domainIds.has(a.domainId) || accountIds.has(a.accountId)
          ),
          filterRules: store.filterRules
            .filter((r) => !r.accountId || accountIds.has(r.accountId))
            .sort((a, b) => a.priority - b.priority),
          spam: store.spamSettings,
          sieveAvailable: true,
          sieveNote: "Mock mode — rules stored in-memory and rendered as Sieve.",
          adminUiUrl: isAdmin ? getStalwartAdminUiUrl() : "",
          roundcubeUrl: getRoundcubeUrl(),
        },
        src
      )
    }

    const sieve = await probeSieveJmapSupport()
    const spam = await loadLiveSpamSettings()
    return ok(
      {
        accounts,
        domains,
        autoresponders: [],
        filterRules: [],
        spam,
        sieveAvailable: sieve.available,
        sieveNote: sieve.note,
        adminUiUrl: isAdmin ? getStalwartAdminUiUrl() : "",
        roundcubeUrl: getRoundcubeUrl(),
      },
      src
    )
  } catch (err) {
    return fail(err, src)
  }
}

export async function upsertAutoresponderAction(input: {
  id?: string
  accountId: string
  enabled?: boolean
  subject: string
  body: string
  startAt?: string | null
  endAt?: string | null
  daysBetween?: number
}): Promise<ActionResult<Autoresponder>> {
  const denied = await denyUnlessAuthed<Autoresponder>()
  if (denied) return denied

  const src = source()
  const validated = validateInput(upsertAutoresponderSchema, input, src)
  if (!validated.ok) return validated.result

  const subject = validated.data.subject
  const body = validated.data.body
  const daysBetween = validated.data.daysBetween ?? 7

  try {
    if (src === "mock") {
      const store = getMockStore()
      const account = store.accounts.find(
        (a) => a.id === validated.data.accountId
      )
      if (!account || !account.domainId) {
        return fail(new StalwartError("Mailbox not found.", "not_found"), src)
      }

      const now = new Date().toISOString()
      if (validated.data.id) {
        const existing = store.autoresponders.find(
          (a) => a.id === validated.data.id
        )
        if (!existing) {
          return fail(
            new StalwartError("Autoresponder not found.", "not_found"),
            src
          )
        }
        const updated: Autoresponder = {
          ...existing,
          accountId: account.id,
          email: account.email,
          domainId: account.domainId,
          enabled: validated.data.enabled !== false,
          subject,
          body,
          startAt: validated.data.startAt || null,
          endAt: validated.data.endAt || null,
          daysBetween,
          updatedAt: now,
        }
        store.setAutoresponders(
          store.autoresponders.map((a) =>
            a.id === validated.data.id ? updated : a
          )
        )
        await audit("autoresponder.upsert", {
          target: account.email,
          detail: "Updated autoresponder",
        })
        return ok(updated, src)
      }

      // One autoresponder per mailbox in mock.
      const without = store.autoresponders.filter(
        (a) => a.accountId !== account.id
      )
      const created: Autoresponder = {
        id: `ar-${crypto.randomUUID().slice(0, 8)}`,
        accountId: account.id,
        email: account.email,
        domainId: account.domainId,
        enabled: validated.data.enabled !== false,
        subject,
        body,
        startAt: validated.data.startAt || null,
        endAt: validated.data.endAt || null,
        daysBetween,
        backend: "mock",
        updatedAt: now,
      }
      store.setAutoresponders([...without, created])
      await audit("autoresponder.upsert", {
        target: account.email,
        detail: "Created autoresponder",
      })
      return ok(created, src)
    }

    const sieve = await probeSieveJmapSupport()
    return fail(
      new StalwartError(
        sieve.available
          ? "SieveScript JMAP is present but vacation sync is not wired yet. Open Roundcube ManageSieve to edit the vacation script."
          : "Live autoresponders require ManageSieve. Open Roundcube (SSO) → Settings → Filters, or configure vacation in Stalwart Admin.",
        "jmap"
      ),
      src
    )
  } catch (err) {
    return fail(err, src)
  }
}

export async function destroyAutoresponderAction(
  id: string
): Promise<ActionResult<{ id: string }>> {
  const denied = await denyUnlessAuthed<{ id: string }>()
  if (denied) return denied

  const src = source()
  const validated = validateInput(destroyByIdSchema, { id }, src)
  if (!validated.ok) return validated.result

  try {
    if (src === "mock") {
      const store = getMockStore()
      if (!store.autoresponders.some((a) => a.id === id)) {
        return fail(
          new StalwartError("Autoresponder not found.", "not_found"),
          src
        )
      }
      store.setAutoresponders(store.autoresponders.filter((a) => a.id !== id))
      await audit("autoresponder.destroy", {
        target: id,
        detail: "Destroyed autoresponder",
      })
      return ok({ id }, src)
    }
    return fail(
      new StalwartError(
        "Live autoresponder delete is not available via JMAP. Remove the vacation script in Roundcube ManageSieve.",
        "jmap"
      ),
      src
    )
  } catch (err) {
    return fail(err, src)
  }
}

export async function upsertFilterRuleAction(input: {
  id?: string
  scope: FilterScope
  accountId?: string | null
  name: string
  enabled?: boolean
  condition: FilterCondition
  action: FilterAction
  priority?: number
}): Promise<ActionResult<FilterRule>> {
  const denied = await denyUnlessAuthed<FilterRule>()
  if (denied) return denied

  const src = source()
  const validated = validateInput(upsertFilterRuleSchema, input, src)
  if (!validated.ok) return validated.result

  const name = validated.data.name
  const condition: FilterCondition = {
    field: validated.data.condition.field,
    op: validated.data.condition.op,
    value: validated.data.condition.value,
    headerName: validated.data.condition.headerName || undefined,
  }
  const action: FilterAction = {
    type: validated.data.action.type,
    folder: validated.data.action.folder || undefined,
    redirectTo: validated.data.action.redirectTo?.toLowerCase() || undefined,
  }

  try {
    if (src === "mock") {
      const store = getMockStore()
      let accountId: string | null = null
      let email: string | null = null

      if (validated.data.scope === "user") {
        const account = store.accounts.find(
          (a) => a.id === validated.data.accountId
        )
        if (!account) {
          return fail(
            new StalwartError("Mailbox required for user filters.", "validation"),
            src
          )
        }
        accountId = account.id
        email = account.email
      }

      const now = new Date().toISOString()
      const priority = validated.data.priority ?? 50

      if (validated.data.id) {
        const existing = store.filterRules.find(
          (r) => r.id === validated.data.id
        )
        if (!existing) {
          return fail(
            new StalwartError("Filter rule not found.", "not_found"),
            src
          )
        }
        const updated: FilterRule = {
          ...existing,
          scope: validated.data.scope,
          accountId,
          email,
          name,
          enabled: validated.data.enabled !== false,
          condition,
          action,
          priority,
          updatedAt: now,
        }
        store.setFilterRules(
          store.filterRules.map((r) =>
            r.id === validated.data.id ? updated : r
          )
        )
        await audit("filter.upsert", {
          target: email ?? "global",
          detail: `Updated filter “${name}”`,
        })
        return ok(updated, src)
      }

      const created: FilterRule = {
        id: `flt-${crypto.randomUUID().slice(0, 8)}`,
        scope: validated.data.scope,
        accountId,
        email,
        name,
        enabled: validated.data.enabled !== false,
        condition,
        action,
        priority,
        backend: "mock",
        updatedAt: now,
      }
      store.setFilterRules([...store.filterRules, created])
      await audit("filter.upsert", {
        target: email ?? "global",
        detail: `Created filter “${name}”`,
      })
      return ok(created, src)
    }

    const sieve = await probeSieveJmapSupport()
    return fail(
      new StalwartError(
        sieve.available
          ? "SieveScript JMAP responded but rule sync is not wired yet. Use Roundcube ManageSieve for now."
          : "Live filter rules require ManageSieve. Open Roundcube (SSO) → Settings → Filters.",
        "jmap"
      ),
      src
    )
  } catch (err) {
    return fail(err, src)
  }
}

export async function destroyFilterRuleAction(
  id: string
): Promise<ActionResult<{ id: string }>> {
  const denied = await denyUnlessAuthed<{ id: string }>()
  if (denied) return denied

  const src = source()
  const validated = validateInput(destroyByIdSchema, { id }, src)
  if (!validated.ok) return validated.result

  try {
    if (src === "mock") {
      const store = getMockStore()
      if (!store.filterRules.some((r) => r.id === id)) {
        return fail(
          new StalwartError("Filter rule not found.", "not_found"),
          src
        )
      }
      store.setFilterRules(store.filterRules.filter((r) => r.id !== id))
      await audit("filter.destroy", {
        target: id,
        detail: "Destroyed filter rule",
      })
      return ok({ id }, src)
    }
    return fail(
      new StalwartError(
        "Live filter delete is not available via JMAP. Remove the script in Roundcube ManageSieve.",
        "jmap"
      ),
      src
    )
  } catch (err) {
    return fail(err, src)
  }
}

export async function updateSpamSettingsAction(input: {
  rejectThreshold: number
  markAsSpamThreshold: number
  denylist: string[]
  allowlist: string[]
}): Promise<ActionResult<SpamSettings>> {
  const denied = await denyUnlessAuthed<SpamSettings>()
  if (denied) return denied

  const src = source()
  const validated = validateInput(updateSpamSettingsSchema, input, src)
  if (!validated.ok) return validated.result

  const { rejectThreshold, markAsSpamThreshold } = validated.data

  try {
    if (src === "mock") {
      const store = getMockStore()
      const next: SpamSettings = {
        rejectThreshold,
        markAsSpamThreshold,
        denylist: normalizeAddressList(validated.data.denylist),
        allowlist: normalizeAddressList(validated.data.allowlist),
        backend: "mock",
        note: "Mock spam posture — not pushed to a real MTA.",
        updatedAt: new Date().toISOString(),
      }
      store.setSpamSettings(next)
      await audit("spam.update", {
        detail: `reject≥${rejectThreshold}, mark≥${markAsSpamThreshold}`,
      })
      return ok(next, src)
    }

    return fail(
      new StalwartError(
        "Live spam thresholds and lists are not writable via this JMAP surface. Configure them in Stalwart Admin.",
        "jmap"
      ),
      src
    )
  } catch (err) {
    return fail(err, src)
  }
}

// ─── Logs / delivery / audit (Phase 3.7) ─────────────────────────────────────

export async function getDeliveryLogsAction(): Promise<
  ActionResult<{
    events: DeliveryEvent[]
    note?: string
    usedFallback: boolean
    adminUiUrl: string
  }>
> {
  const denied = await denyUnlessAuthed<{
    events: DeliveryEvent[]
    note?: string
    usedFallback: boolean
    adminUiUrl: string
  }>()
  if (denied) return denied

  const src = source()
  const session = await getSession().catch(() => null)
  const isAdmin = session?.role === "admin"
  const adminUiUrl = isAdmin ? getStalwartAdminUiUrl() : ""

  const filterForUser = async (rawEvents: DeliveryEvent[]): Promise<DeliveryEvent[]> => {
    if (isAdmin) return rawEvents
    const userDomains = new Set(await getUserOwnedDomainNames(session?.userId || ""))
    return rawEvents.filter((e) => {
      const senderDomain = e.sender.includes("@") ? e.sender.split("@").pop()?.toLowerCase() : ""
      const recipientDomain = e.recipient.includes("@") ? e.recipient.split("@").pop()?.toLowerCase() : ""
      return (senderDomain && userDomains.has(senderDomain)) || (recipientDomain && userDomains.has(recipientDomain))
    })
  }

  if (src === "mock") {
    const dbEvents = await queryDeliveryLogs({ limit: 250 })
    const scopedEvents = await filterForUser(dbEvents)
    return ok(
      {
        events: scopedEvents,
        note:
          scopedEvents.length > 0
            ? "Showing real delivery records from the persistent database."
            : "Delivery events will be recorded here as emails are sent and received.",
        usedFallback: false,
        adminUiUrl,
      },
      src
    )
  }

  try {
    const { events, note } = await queryDeliveryTracesLive(250)
    const scopedEvents = await filterForUser(events)
    return ok(
      {
        events: scopedEvents,
        note,
        usedFallback: false,
        adminUiUrl,
      },
      src
    )
  } catch (err) {
    const message =
      err instanceof StalwartError
        ? err.message
        : err instanceof Error
          ? err.message
          : "Delivery trace query failed."
    const localEvents = await queryDeliveryLogs({ limit: 250 })
    const scopedEvents = await filterForUser(localEvents)
    return ok(
      {
        events: scopedEvents,
        note: `Stalwart Community Edition: ${message}. Showing persistent database logs (${scopedEvents.length} records).`,
        usedFallback: false,
        adminUiUrl,
      },
      src
    )
  }
}

export async function getAuditLogsAction(): Promise<
  ActionResult<{
    events: AuditEvent[]
    fromSample: boolean
    pathHint: string
  }>
> {
  const denied = await denyUnlessAuthed<{
    events: AuditEvent[]
    fromSample: boolean
    pathHint: string
  }>()
  if (denied) return denied

  const src = source()
  try {
    const session = await getSession().catch(() => null)
    const isAdmin = session?.role === "admin"
    const { events, path } = await readAuditEvents({
      limit: 500,
      allowSampleFallback: false,
    })

    if (isAdmin) {
      return ok(
        {
          events,
          fromSample: false,
          pathHint: path,
        },
        src
      )
    }

    const userDomains = new Set(await getUserOwnedDomainNames(session?.userId || ""))
    const username = session?.username?.toLowerCase() || ""
    const scopedEvents = events.filter((e) => {
      if (e.actor && e.actor.toLowerCase() === username) return true
      if (e.target) {
        const targetLower = e.target.toLowerCase()
        if (userDomains.has(targetLower)) return true
        const domain = targetLower.includes("@") ? targetLower.split("@").pop() : ""
        if (domain && userDomains.has(domain)) return true
      }
      return false
    })

    return ok(
      {
        events: scopedEvents,
        fromSample: false,
        pathHint: path,
      },
      src
    )
  } catch (err) {
    return fail(err, src)
  }
}


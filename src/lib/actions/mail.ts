"use server"

import {
  recordAudit,
  readAuditEvents,
  type AuditAction,
  type AuditEvent,
} from "@/lib/audit"
import {
  AuthError,
  requireSession,
  sessionActor,
} from "@/lib/auth/session"
import {
  getStalwartAdminUiUrl,
  getStalwartConfig,
  getRoundcubeUrl,
  hasStalwartConfig,
} from "@/lib/env"
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
  generateDkimRecord,
  generateDmarcRecord,
  generateSpfRecord,
} from "@/lib/dns"
import {
  bulkCreateAccounts,
  createAccount,
  createAppPasswordLive,
  createDomain,
  deliveryUnavailableNote,
  deriveMailExchanger,
  destroyAccount,
  destroyAppPasswordLive,
  destroyDomain,
  getAccount,
  getDomain,
  getDomainDnsHealth,
  getMockStore,
  isExternalEmail,
  loadLiveSpamSettings,
  mailExchangerToAllowRelaying,
  MOCK_DELIVERY_EVENTS,
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

function source(): DataSource {
  return hasStalwartConfig() ? "live" : "mock"
}

function fail<T>(error: unknown, src: DataSource): ActionResult<T> {
  const message =
    error instanceof StalwartError
      ? error.message
      : error instanceof Error
        ? error.message
        : "Unexpected error."
  return { ok: false, error: message, source: src }
}

function ok<T>(data: T, src: DataSource): ActionResult<T> {
  return { ok: true, data, source: src }
}

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
  return { domains, accounts }
}

function loadMockDirectory(): {
  domains: StalwartDomain[]
  accounts: StalwartAccount[]
} {
  const store = getMockStore()
  return { domains: store.domains, accounts: store.accounts }
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
  try {
    const { domains, accounts } =
      src === "live" ? await loadLiveDirectory() : loadMockDirectory()

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
        adminUiUrl: getStalwartAdminUiUrl(),
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
    const { domains, accounts } =
      src === "live" ? await loadLiveDirectory() : loadMockDirectory()

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
  try {
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
  const name = domainName.trim().toLowerCase()
  if (!name) {
    return fail(new StalwartError("Domain name required.", "validation"), src)
  }

  try {
    const dns = await getDomainDnsHealth(name, {
      bustCache: true,
      mailHostHint: configuredMailHost(),
      mock: src === "mock",
    })
    return ok(dns, src)
  } catch (err) {
    return fail(err, src)
  }
}

export async function generateDkimAction(input: {
  domain: string
  selector?: string
}): Promise<ActionResult<DkimGeneratedRecord>> {
  const denied = await denyUnlessAuthed<DkimGeneratedRecord>()
  if (denied) return denied

  const src = source()
  const domain = input.domain.trim().toLowerCase()
  if (!/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(domain)) {
    return fail(
      new StalwartError("Enter a valid domain name.", "validation"),
      src
    )
  }
  try {
    return ok(
      generateDkimRecord({
        domain,
        selector: input.selector,
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
  const domain = input.domain.trim().toLowerCase()
  if (!/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(domain)) {
    return fail(
      new StalwartError("Enter a valid domain name.", "validation"),
      src
    )
  }
  try {
    return ok(
      {
        dmarc: generateDmarcRecord({
          domain,
          policy: input.policy,
          rua: input.rua,
        }),
        spf: generateSpfRecord({
          domain,
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
}): Promise<ActionResult<StalwartDomain>> {
  const denied = await denyUnlessAuthed<StalwartDomain>()
  if (denied) return denied

  const src = source()
  const name = input.name.trim().toLowerCase()
  if (!/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(name)) {
    return fail(
      new StalwartError("Enter a valid domain name.", "validation"),
      src
    )
  }

  try {
    if (src === "mock") {
      const store = getMockStore()
      if (store.domains.some((d) => d.name === name)) {
        return fail(
          new StalwartError("Domain already exists.", "validation"),
          src
        )
      }
      const domain: StalwartDomain = {
        id: `dom-${crypto.randomUUID().slice(0, 8)}`,
        name,
        description: input.description?.trim() || name,
        isEnabled: true,
        catchAllAddress: null,
        catchAllMode: "bounce",
        allowRelaying: false,
        mailExchanger: "local",
        domainAliases: [],
      }
      store.setDomains([...store.domains, domain])
      await audit("domain.create", {
        target: domain.name,
        detail: "Created domain",
      })
      return ok(domain, src)
    }
    const domain = await createDomain(input)
    await audit("domain.create", {
      target: domain.name,
      detail: "Created domain",
    })
    return ok(domain, src)
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
  try {
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

    await updateDomain(id, livePatch)
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
  try {
    if (src === "mock") {
      const store = getMockStore()
      const domain = store.domains.find((d) => d.id === id)
      if (!domain) {
        return fail(new StalwartError("Domain not found.", "not_found"), src)
      }
      if (typedName.trim().toLowerCase() !== domain.name.toLowerCase()) {
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
    if (typedName.trim().toLowerCase() !== domain.name.toLowerCase()) {
      return fail(
        new StalwartError("Typed name does not match the domain.", "validation"),
        src
      )
    }
    const accounts = (await queryAccounts([domain])).filter(
      (a) => a.domainId === id
    )
    if (accounts.length > 0 && !force) {
      return fail(
        new StalwartError(
          `${accounts.length} mailboxes remain. Clear them or force destroy.`,
          "validation"
        ),
        src
      )
    }
    await destroyDomain(id)
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
    const { domains, accounts } =
      src === "live" ? await loadLiveDirectory() : loadMockDirectory()
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
  const adminUiUrl = getStalwartAdminUiUrl()
  try {
    if (src === "mock") {
      const store = getMockStore()
      const account = store.accounts.find((a) => a.id === id)
      if (!account) {
        return fail(new StalwartError("Mailbox not found.", "not_found"), src)
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

    const domains = await queryDomains()
    const account = await getAccount(id, domains)
    if (!account) {
      return fail(new StalwartError("Mailbox not found.", "not_found"), src)
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
    const accounts = await queryAccounts(domains)
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
  const local = input.local.trim().toLowerCase()
  if (!/^[a-z0-9._+-]+$/i.test(local) || local.includes("@")) {
    return fail(
      new StalwartError("Local-part must not contain @.", "validation"),
      src
    )
  }
  if (!input.password || input.password.length < 6) {
    return fail(
      new StalwartError("Password must be at least 6 characters.", "validation"),
      src
    )
  }

  try {
    if (src === "mock") {
      const store = getMockStore()
      const domain = store.domains.find((d) => d.id === input.domainId)
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
        description: input.description?.trim() || email,
        domainId: domain.id,
        email,
        domainName: domain.name,
        isEnabled: true,
        quotas:
          input.diskQuotaBytes != null
            ? { diskQuota: input.diskQuotaBytes }
            : {},
        aliases: {},
        appPasswords: [],
        twoFactor: { state: "disabled" },
      }
      store.setAccounts([...store.accounts, account])
      await audit("mailbox.create", {
        target: email,
        detail: "Created mailbox",
      })
      return ok(account, src)
    }

    const domain = await getDomain(input.domainId)
    if (!domain) {
      return fail(new StalwartError("Domain not found.", "not_found"), src)
    }
    const email = `${local}@${domain.name}`
    const account = await createAccount({
      local,
      email,
      domainId: domain.id,
      password: input.password,
      description: input.description?.trim() || email,
      quotas:
        input.diskQuotaBytes != null
          ? { diskQuota: input.diskQuotaBytes }
          : {},
    })
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
  try {
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
      if (!next.some((a) => a.id === id)) {
        return fail(new StalwartError("Mailbox not found.", "not_found"), src)
      }
      store.setAccounts(next)
      if (patch.isEnabled === false) {
        const account = next.find((a) => a.id === id)
        await audit("mailbox.suspend", {
          target: account?.email,
          detail: "Suspended mailbox",
        })
      }
      return ok(undefined, src)
    }

    await updateAccount(id, {
      ...(patch.description != null ? { description: patch.description } : {}),
      ...(quotas != null ? { quotas } : {}),
      ...(patch.isEnabled !== undefined ? { isEnabled: patch.isEnabled } : {}),
    })
    if (patch.isEnabled === false) {
      const account = await getAccount(id).catch(() => null)
      await audit("mailbox.suspend", {
        target: account?.email,
        detail: "Suspended mailbox",
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
  const label = description.trim()
  if (!label) {
    return fail(
      new StalwartError("Describe the client (e.g. Thunderbird).", "validation"),
      src
    )
  }

  try {
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
  try {
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
  if (!password || password.length < 6) {
    return fail(
      new StalwartError("Password must be at least 6 characters.", "validation"),
      src
    )
  }
  try {
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
    await updateAccountPassword(id, password)
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
  typedEmail: string
): Promise<ActionResult<void>> {
  const denied = await denyUnlessAuthed<void>()
  if (denied) return denied

  const src = source()
  try {
    if (src === "mock") {
      const store = getMockStore()
      const account = store.accounts.find((a) => a.id === id)
      if (!account) {
        return fail(new StalwartError("Mailbox not found.", "not_found"), src)
      }
      if (typedEmail.trim().toLowerCase() !== account.email.toLowerCase()) {
        return fail(
          new StalwartError("Typed address does not match.", "validation"),
          src
        )
      }
      if (account.isAdmin) {
        return fail(
          new StalwartError("Admin mailboxes require Phase 4 dual-confirm.", "validation"),
          src
        )
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
        detail: "Destroyed mailbox",
      })
      return ok(undefined, src)
    }

    const account = await getAccount(id)
    if (!account) {
      return fail(new StalwartError("Mailbox not found.", "not_found"), src)
    }
    if (typedEmail.trim().toLowerCase() !== account.email.toLowerCase()) {
      return fail(
        new StalwartError("Typed address does not match.", "validation"),
        src
      )
    }
    if (account.isAdmin) {
      return fail(
        new StalwartError("Admin mailboxes require Phase 4 dual-confirm.", "validation"),
        src
      )
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
      detail: "Destroyed mailbox",
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
  const failed: string[] = []
  let destroyed = 0
  for (const id of ids) {
    const detail =
      src === "mock"
        ? getMockStore().accounts.find((a) => a.id === id)
        : await getAccount(id).catch(() => null)
    if (!detail) {
      failed.push(id)
      continue
    }
    // Already authenticated above; destroyMailboxAction re-checks session.
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
  const failed: string[] = []
  let reset = 0
  for (const id of ids) {
    const result = await resetMailboxPasswordAction(id, password)
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
  const failed: string[] = []
  let updated = 0
  for (const id of ids) {
    const result = await updateMailboxAction(id, { isEnabled: !suspend })
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
  try {
    const { valid, failed } = parseMailboxCsvText(input.csvText)
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
      overwritePasswords: !!input.overwritePasswords,
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
  try {
    const { valid, failed } = parseForwardingCsvText(input.csvText)
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
  const job = getJob(jobId)
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
  const job = abortJob(jobId)
  if (!job) {
    return fail(
      new StalwartError("Bulk job not found or expired.", "not_found"),
      src
    )
  }
  return ok({ job: toReport(job) }, src)
}

export async function pauseBulkJobAction(
  jobId: string
): Promise<ActionResult<{ job: BulkJobReport }>> {
  const denied = await denyUnlessAuthed<{ job: BulkJobReport }>()
  if (denied) return denied

  const src = source()
  const job = pauseJob(jobId)
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
  const job = resumeJob(jobId)
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
  try {
    const job = getJob(input.jobId)
    if (!job) {
      return fail(
        new StalwartError("Bulk job not found or expired.", "not_found"),
        src
      )
    }
    if (job.status === "aborted") {
      return ok({ job: toReport(job), chunkIndex: input.chunkIndex }, src)
    }
    if (job.status === "paused") {
      return fail(
        new StalwartError("Bulk job is paused.", "validation"),
        src
      )
    }

    // Idempotent: ignore replay of completed chunks.
    if (job.completedChunks.has(input.chunkIndex)) {
      return ok({ job: toReport(job), chunkIndex: input.chunkIndex }, src)
    }

    job.status = "running"
    const start = input.chunkIndex * job.chunkSize
    const end = start + job.chunkSize

    if (job.kind === "mailboxes" && job.mailboxRows) {
      await commitMailboxChunk(job.mailboxRows, start, end, {
        overwritePasswords: job.overwritePasswords,
        src,
      })
    } else if (job.kind === "forwarding" && job.forwardRows) {
      await commitForwardChunk(job.forwardRows, start, end)
    }

    job.completedChunks.add(input.chunkIndex)
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
    return ok({ job: report, chunkIndex: input.chunkIndex }, src)
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
  return ok(
    {
      roundcubeUrl: getRoundcubeUrl(),
      roundcubeHost: hostFromUrl(getRoundcubeUrl()),
      jmapConfigured: !!config,
      jmapHost: config ? hostFromUrl(config.jmapUrl) : null,
      adminUiUrl: getStalwartAdminUiUrl(),
      stalwartUser: config?.adminUser ?? null,
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
    if (src === "mock") {
      const store = getMockStore()
      return ok(
        {
          domains: store.domains,
          accounts: store.accounts,
          forwards: store.forwards,
          adminUiUrl: getStalwartAdminUiUrl(),
        },
        src
      )
    }

    const { domains, accounts } = await loadLiveDirectory()
    const forwards = buildLiveForwardHints(domains, accounts)
    return ok(
      {
        domains,
        accounts,
        forwards,
        adminUiUrl: getStalwartAdminUiUrl(),
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
  try {
    const targets = input.targets.map((t) => t.trim().toLowerCase()).filter(Boolean)
    const enabled = input.enabled !== false
    const keepLocalCopy = input.keepLocalCopy === true

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
  try {
    if (src === "mock") {
      const store = getMockStore()
      if (!store.forwards.some((f) => f.id === id)) {
        return fail(
          new StalwartError("Forwarding rule not found.", "not_found"),
          src
        )
      }
      store.setForwards(store.forwards.filter((f) => f.id !== id))
      return ok(undefined, src)
    }

    if (id.startsWith("catchall-")) {
      const domainId = id.slice("catchall-".length)
      await updateDomain(domainId, { catchAllAddress: null })
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
  try {
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
      return ok({ mode, note }, src)
    }

    await updateDomain(domainId, { allowRelaying })
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
  try {
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
    for (let i = 0; i < aliases.length; i++) {
      const raw = aliases[i]
      const name = raw.name.trim().toLowerCase()
      if (!name || name.includes("@") || !/^[a-z0-9._+-]+$/i.test(name)) {
        return fail(
          new StalwartError(
            `Invalid alias local-part: ${raw.name || "(empty)"}`,
            "validation"
          ),
          src
        )
      }
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

  const result = await updateDomainAction(domainId, {
    catchAllMode: input.mode,
    catchAllAddress:
      input.mode === "address" ? (input.address ?? null) : null,
  })
  if (!result.ok) return result

  const note =
    input.mode === "blackhole" && source() === "live"
      ? "Stalwart has no discard-at-SMTP flag — blackhole clears catch-all (same as bounce). Use a discard mailbox or Sieve for true drop."
      : input.mode === "bounce"
        ? "Unknown recipients are rejected at SMTP."
        : input.mode === "blackhole"
          ? "Unknown recipients are discarded (mock)."
          : undefined

  return ok(
    {
      mode: input.mode,
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
    if (src === "mock") {
      const store = getMockStore()
      return ok(
        {
          accounts: store.accounts,
          domains: store.domains,
          autoresponders: store.autoresponders,
          filterRules: [...store.filterRules].sort(
            (a, b) => a.priority - b.priority
          ),
          spam: store.spamSettings,
          sieveAvailable: true,
          sieveNote: "Mock mode — rules stored in-memory and rendered as Sieve.",
          adminUiUrl: getStalwartAdminUiUrl(),
          roundcubeUrl: getRoundcubeUrl(),
        },
        src
      )
    }

    const { domains, accounts } = await loadLiveDirectory()
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
        adminUiUrl: getStalwartAdminUiUrl(),
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
  const subject = input.subject.trim()
  const body = input.body.trim()
  if (!subject || !body) {
    return fail(
      new StalwartError("Subject and body are required.", "validation"),
      src
    )
  }

  const daysBetween = Math.max(0, Math.min(365, input.daysBetween ?? 7))

  try {
    if (src === "mock") {
      const store = getMockStore()
      const account = store.accounts.find((a) => a.id === input.accountId)
      if (!account || !account.domainId) {
        return fail(new StalwartError("Mailbox not found.", "not_found"), src)
      }

      const now = new Date().toISOString()
      if (input.id) {
        const existing = store.autoresponders.find((a) => a.id === input.id)
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
          enabled: input.enabled !== false,
          subject,
          body,
          startAt: input.startAt || null,
          endAt: input.endAt || null,
          daysBetween,
          updatedAt: now,
        }
        store.setAutoresponders(
          store.autoresponders.map((a) => (a.id === input.id ? updated : a))
        )
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
        enabled: input.enabled !== false,
        subject,
        body,
        startAt: input.startAt || null,
        endAt: input.endAt || null,
        daysBetween,
        backend: "mock",
        updatedAt: now,
      }
      store.setAutoresponders([...without, created])
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

function validateFilterParts(
  condition: FilterCondition,
  action: FilterAction
): string | null {
  if (!condition.value.trim()) return "Condition value is required."
  if (condition.field === "header" && !condition.headerName?.trim()) {
    return "Header name is required for header conditions."
  }
  if (action.type === "fileinto" && !action.folder?.trim()) {
    return "Folder is required for fileinto."
  }
  if (action.type === "redirect" && !action.redirectTo?.trim()) {
    return "Redirect address is required."
  }
  if (
    action.type === "redirect" &&
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(action.redirectTo!.trim())
  ) {
    return "Redirect address must be a valid email."
  }
  return null
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
  const name = input.name.trim()
  if (!name) {
    return fail(new StalwartError("Rule name is required.", "validation"), src)
  }

  const condition: FilterCondition = {
    field: input.condition.field,
    op: input.condition.op,
    value: input.condition.value.trim(),
    headerName: input.condition.headerName?.trim() || undefined,
  }
  const action: FilterAction = {
    type: input.action.type,
    folder: input.action.folder?.trim() || undefined,
    redirectTo: input.action.redirectTo?.trim().toLowerCase() || undefined,
  }
  const invalid = validateFilterParts(condition, action)
  if (invalid) {
    return fail(new StalwartError(invalid, "validation"), src)
  }

  try {
    if (src === "mock") {
      const store = getMockStore()
      let accountId: string | null = null
      let email: string | null = null

      if (input.scope === "user") {
        const account = store.accounts.find((a) => a.id === input.accountId)
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
      const priority = input.priority ?? 50

      if (input.id) {
        const existing = store.filterRules.find((r) => r.id === input.id)
        if (!existing) {
          return fail(
            new StalwartError("Filter rule not found.", "not_found"),
            src
          )
        }
        const updated: FilterRule = {
          ...existing,
          scope: input.scope,
          accountId,
          email,
          name,
          enabled: input.enabled !== false,
          condition,
          action,
          priority,
          updatedAt: now,
        }
        store.setFilterRules(
          store.filterRules.map((r) => (r.id === input.id ? updated : r))
        )
        return ok(updated, src)
      }

      const created: FilterRule = {
        id: `flt-${crypto.randomUUID().slice(0, 8)}`,
        scope: input.scope,
        accountId,
        email,
        name,
        enabled: input.enabled !== false,
        condition,
        action,
        priority,
        backend: "mock",
        updatedAt: now,
      }
      store.setFilterRules([...store.filterRules, created])
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
  const rejectThreshold = Number(input.rejectThreshold)
  const markAsSpamThreshold = Number(input.markAsSpamThreshold)

  if (
    !Number.isFinite(rejectThreshold) ||
    !Number.isFinite(markAsSpamThreshold) ||
    rejectThreshold < 0 ||
    markAsSpamThreshold < 0
  ) {
    return fail(
      new StalwartError("Thresholds must be non-negative numbers.", "validation"),
      src
    )
  }
  if (markAsSpamThreshold > rejectThreshold) {
    return fail(
      new StalwartError(
        "Mark-as-spam threshold must be ≤ reject threshold.",
        "validation"
      ),
      src
    )
  }

  try {
    if (src === "mock") {
      const store = getMockStore()
      const next: SpamSettings = {
        rejectThreshold,
        markAsSpamThreshold,
        denylist: normalizeAddressList(input.denylist),
        allowlist: normalizeAddressList(input.allowlist),
        backend: "mock",
        note: "Mock spam posture — not pushed to a real MTA.",
        updatedAt: new Date().toISOString(),
      }
      store.setSpamSettings(next)
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
  const adminUiUrl = getStalwartAdminUiUrl()

  if (src === "mock") {
    return ok(
      {
        events: MOCK_DELIVERY_EVENTS,
        note: "Sample SMTP transaction rows — connect Stalwart for live Trace history.",
        usedFallback: true,
        adminUiUrl,
      },
      src
    )
  }

  try {
    const { events, note } = await queryDeliveryTracesLive(250)
    if (events.length === 0) {
      return ok(
        {
          events: MOCK_DELIVERY_EVENTS,
          note: note ?? deliveryUnavailableNote(adminUiUrl),
          usedFallback: true,
          adminUiUrl,
        },
        src
      )
    }
    return ok(
      {
        events,
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
          : "Trace query failed."
    return ok(
      {
        events: MOCK_DELIVERY_EVENTS,
        note: `${deliveryUnavailableNote(adminUiUrl)} (${message})`,
        usedFallback: true,
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
    const { events, fromSample, path } = await readAuditEvents({
      limit: 500,
      allowSampleFallback: src === "mock",
    })
    return ok(
      {
        events,
        fromSample,
        pathHint: path,
      },
      src
    )
  } catch (err) {
    return fail(err, src)
  }
}


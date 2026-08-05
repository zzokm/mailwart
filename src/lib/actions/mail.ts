"use server"

import { AuthError, requireSession } from "@/lib/auth/session"
import {
  getStalwartAdminUiUrl,
  getStalwartConfig,
  getRoundcubeUrl,
  hasStalwartConfig,
} from "@/lib/env"
import { hostFromUrl, parseCsv, quotaSummary } from "@/lib/format"
import { buildRoundcubeUrl } from "@/lib/roundcube"
import {
  bulkCreateAccounts,
  createAccount,
  createDomain,
  destroyAccount,
  destroyDomain,
  getAccount,
  getDomain,
  getMockStore,
  mockHealth,
  parseEmailAddress,
  queryAccounts,
  queryDomains,
  StalwartError,
  updateAccount,
  updateAccountPassword,
  updateDomain,
  type ActionResult,
  type BulkImportResultRow,
  type DataSource,
  type DnsCheckItem,
  type DomainListItem,
  type HealthStatus,
  type OverviewStats,
  type StalwartAccount,
  type StalwartDomain,
  buildDnsChecklist,
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

export async function getHealth(): Promise<HealthStatus> {
  if (!hasStalwartConfig()) {
    return mockHealth()
  }

  const started = Date.now()
  try {
    await jmapCall([["x:Domain/query", { filter: null, limit: 1 }, "h0"]], {
      retry: true,
      timeoutMs: 10_000,
    })
    const latencyMs = Date.now() - started

    let roundcube: HealthStatus["roundcube"] = { ok: null }
    try {
      const res = await fetch(getRoundcubeUrl(), {
        method: "GET",
        signal: AbortSignal.timeout(5000),
        cache: "no-store",
      })
      roundcube = { ok: res.ok }
    } catch (err) {
      roundcube = {
        ok: false,
        error: err instanceof Error ? err.message : "Roundcube unreachable",
      }
    }

    return {
      jmap: { ok: true, latencyMs },
      roundcube,
      source: "live",
    }
  } catch (err) {
    return {
      jmap: {
        ok: false,
        latencyMs: Date.now() - started,
        error: err instanceof Error ? err.message : "JMAP health failed",
      },
      roundcube: { ok: null },
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
    let hasQuota = false
    for (const a of accounts) {
      const q = quotaSummary(a.quotas)
      if (q.bytes != null) {
        hasQuota = true
        storageQuotaBytes! += q.bytes
      }
    }
    if (!hasQuota) storageQuotaBytes = null

    return ok(
      {
        stats: {
          domainCount: domains.length,
          mailboxCount: accounts.length,
          storageQuotaBytes,
          storageUsedBytes: null,
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
  try {
    const { domains, accounts } =
      src === "live" ? await loadLiveDirectory() : loadMockDirectory()
    return ok(
      domains.map((d) => ({
        ...d,
        mailboxCount: accounts.filter((a) => a.domainId === d.id).length,
      })),
      src
    )
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
    dns: DnsCheckItem[]
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
      return ok(
        {
          domain,
          mailboxes: store.accounts.filter((a) => a.domainId === id),
          dns: buildDnsChecklist(domain.name, mailHost),
        },
        src
      )
    }

    const domain = await getDomain(id)
    if (!domain) {
      return fail(new StalwartError("Domain not found.", "not_found"), src)
    }
    const accounts = await queryAccounts([domain])
    return ok(
      {
        domain,
        mailboxes: accounts.filter((a) => a.domainId === id),
        dns: buildDnsChecklist(domain.name, mailHost),
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
      }
      store.setDomains([...store.domains, domain])
      return ok(domain, src)
    }
    const domain = await createDomain(input)
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
  }>
): Promise<ActionResult<void>> {
  const denied = await denyUnlessAuthed<void>()
  if (denied) return denied

  const src = source()
  try {
    if (src === "mock") {
      const store = getMockStore()
      const next = store.domains.map((d) =>
        d.id === id ? { ...d, ...patch } : d
      )
      if (!next.some((d) => d.id === id)) {
        return fail(new StalwartError("Domain not found.", "not_found"), src)
      }
      if (patch.catchAllAddress) {
        const target = patch.catchAllAddress.toLowerCase()
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
      store.setDomains(next)
      return ok(undefined, src)
    }

    if (patch.catchAllAddress) {
      const domain = await getDomain(id)
      if (!domain) {
        return fail(new StalwartError("Domain not found.", "not_found"), src)
      }
      const accounts = await queryAccounts([domain])
      const target = patch.catchAllAddress.toLowerCase()
      if (!accounts.some((a) => a.email.toLowerCase() === target)) {
        return fail(
          new StalwartError(
            "Catch-all target mailbox must exist on this domain.",
            "validation"
          ),
          src
        )
      }
    }

    await updateDomain(id, patch)
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
    roundcubeUrl: string
    aliasesEditable: boolean
  }>
> {
  const src = source()
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
          roundcubeUrl: buildRoundcubeUrl(account.email),
          // TODO: enable after live Account/get aliases shape probe
          aliasesEditable: false,
        },
        src
      )
    }

    const domains = await queryDomains()
    const account = await getAccount(id, domains)
    if (!account) {
      return fail(new StalwartError("Mailbox not found.", "not_found"), src)
    }
    return ok(
      {
        account,
        domains,
        roundcubeUrl: buildRoundcubeUrl(account.email),
        aliasesEditable: false,
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
        quotas:
          input.diskQuotaBytes != null
            ? { diskQuota: input.diskQuotaBytes }
            : {},
        aliases: {},
      }
      store.setAccounts([...store.accounts, account])
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
    return ok(account, src)
  } catch (err) {
    return fail(err, src)
  }
}

export async function updateMailboxAction(
  id: string,
  patch: { description?: string; diskQuotaBytes?: number | null }
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
        }
      })
      if (!next.some((a) => a.id === id)) {
        return fail(new StalwartError("Mailbox not found.", "not_found"), src)
      }
      store.setAccounts(next)
      return ok(undefined, src)
    }

    await updateAccount(id, {
      ...(patch.description != null ? { description: patch.description } : {}),
      ...(quotas != null ? { quotas } : {}),
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
      return ok({ email: account.email }, src)
    }
    const account = await getAccount(id)
    if (!account) {
      return fail(new StalwartError("Mailbox not found.", "not_found"), src)
    }
    await updateAccountPassword(id, password)
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

export async function importMailboxesAction(input: {
  csvText: string
  overwritePasswords?: boolean
}): Promise<ActionResult<{ results: BulkImportResultRow[] }>> {
  const denied = await denyUnlessAuthed<{ results: BulkImportResultRow[] }>()
  if (denied) return denied

  const src = source()
  try {
    const rows = parseCsv(input.csvText)
    if (rows.length === 0) {
      return fail(
        new StalwartError("CSV is empty. Expected email,password,description.", "validation"),
        src
      )
    }

    const { domains, accounts } =
      src === "live" ? await loadLiveDirectory() : loadMockDirectory()
    const domainByName = new Map(domains.map((d) => [d.name.toLowerCase(), d]))
    const existing = new Set(accounts.map((a) => a.email.toLowerCase()))

    const toCreate: Array<{
      local: string
      email: string
      domainId: string
      password: string
      description?: string
    }> = []
    const results: BulkImportResultRow[] = []

    for (const row of rows) {
      const parsed = parseEmailAddress(row.email)
      if (!parsed) {
        results.push({ ...row, status: "failed", reason: "Invalid email." })
        continue
      }
      if (!row.password || row.password.length < 6) {
        results.push({
          ...row,
          status: "failed",
          reason: "Password must be at least 6 characters.",
        })
        continue
      }
      const domain = domainByName.get(parsed.domain)
      if (!domain) {
        results.push({
          ...row,
          email: `${parsed.local}@${parsed.domain}`,
          status: "failed",
          reason: `Unknown domain ${parsed.domain}.`,
        })
        continue
      }
      const email = `${parsed.local}@${domain.name}`
      if (existing.has(email.toLowerCase())) {
        if (input.overwritePasswords) {
          const account = accounts.find(
            (a) => a.email.toLowerCase() === email.toLowerCase()
          )
          if (account) {
            const reset = await resetMailboxPasswordAction(
              account.id,
              row.password
            )
            results.push({
              ...row,
              email,
              status: reset.ok ? "created" : "failed",
              reason: reset.ok
                ? "Password overwritten on existing mailbox."
                : reset.error,
            })
            continue
          }
        }
        results.push({
          ...row,
          email,
          status: "skipped",
          reason: "Already exists.",
        })
        continue
      }
      toCreate.push({
        local: parsed.local,
        email,
        domainId: domain.id,
        password: row.password,
        description: row.description || email,
      })
    }

    if (src === "mock") {
      const store = getMockStore()
      for (const row of toCreate) {
        const account: StalwartAccount = {
          id: `acc-${crypto.randomUUID().slice(0, 8)}`,
          name: row.local,
          description: row.description,
          domainId: row.domainId,
          email: row.email,
          domainName: row.email.split("@")[1],
          quotas: {},
          aliases: {},
        }
        store.setAccounts([...getMockStore().accounts, account])
        existing.add(row.email.toLowerCase())
        results.push({
          email: row.email,
          password: row.password,
          description: row.description,
          status: "created",
        })
      }
      return ok({ results }, src)
    }

    const created = await bulkCreateAccounts(toCreate)
    for (const c of created) {
      const original = toCreate.find((r) => r.email === c.email)
      results.push({
        email: c.email,
        password: original?.password ?? "",
        description: original?.description,
        status: c.status === "created" ? "created" : "failed",
        reason: c.reason,
      })
    }

    return ok({ results }, src)
  } catch (err) {
    return fail(err, src)
  }
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

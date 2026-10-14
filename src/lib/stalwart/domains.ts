import "server-only"

import { jmapCall, responseById } from "./client"
import { formatSetFailure, StalwartError } from "./errors"
import type { StalwartDomain } from "./types"

const DOMAIN_PROPS = [
  "id",
  "name",
  "description",
  "isEnabled",
  "catchAllAddress",
  "allowRelaying",
  "aliases",
  "subAddressing",
  "dnsManagement",
  "certificateManagement",
  "dkimManagement",
  "createdAt",
] as const

function mapDomainAliases(raw: unknown): string[] | undefined {
  if (raw == null) return undefined
  const names: string[] = []
  if (Array.isArray(raw)) {
    for (const item of raw) {
      if (typeof item === "string") names.push(item.toLowerCase())
      else if (item && typeof item === "object" && "name" in item) {
        const n = (item as { name?: string }).name
        if (n) names.push(n.toLowerCase())
      }
    }
  } else if (typeof raw === "object") {
    for (const v of Object.values(raw as Record<string, unknown>)) {
      if (typeof v === "string") names.push(v.toLowerCase())
      else if (v && typeof v === "object" && "name" in v) {
        const n = (v as { name?: string }).name
        if (n) names.push(n.toLowerCase())
      }
    }
  }
  return names.length > 0 ? names : []
}

function mapDomain(item: Record<string, unknown>): StalwartDomain {
  const catchAllAddress =
    typeof item.catchAllAddress === "string"
      ? item.catchAllAddress
      : item.catchAllAddress === null
        ? null
        : undefined
  const allowRelaying =
    typeof item.allowRelaying === "boolean" ? item.allowRelaying : undefined
  return {
    id: String(item.id),
    name: String(item.name ?? ""),
    description:
      typeof item.description === "string" ? item.description : undefined,
    isEnabled: typeof item.isEnabled === "boolean" ? item.isEnabled : true,
    catchAllAddress,
    catchAllMode: catchAllAddress ? "address" : "bounce",
    allowRelaying,
    mailExchanger: allowRelaying ? "backup" : "local",
    domainAliases: mapDomainAliases(item.aliases),
    subAddressing: item.subAddressing as StalwartDomain["subAddressing"],
    dnsManagement:
      typeof item.dnsManagement === "string"
        ? item.dnsManagement
        : typeof (item.dnsManagement as Record<string, unknown> | null)?.["@type"] === "string"
          ? String((item.dnsManagement as Record<string, unknown>)["@type"])
          : undefined,
    certificateManagement:
      typeof item.certificateManagement === "string"
        ? item.certificateManagement
        : typeof (item.certificateManagement as Record<string, unknown> | null)?.["@type"] === "string"
          ? String((item.certificateManagement as Record<string, unknown>)["@type"])
          : undefined,
    dkimManagement:
      typeof item.dkimManagement === "string"
        ? item.dkimManagement
        : typeof (item.dkimManagement as Record<string, unknown> | null)?.["@type"] === "string"
          ? String((item.dkimManagement as Record<string, unknown>)["@type"])
          : undefined,
    createdAt: typeof item.createdAt === "string" ? item.createdAt : undefined,
  }
}

export async function queryDomains(): Promise<StalwartDomain[]> {
  const q = await jmapCall(
    [["x:Domain/query", { filter: null, limit: 100 }, "d0"]],
    { retry: true }
  )
  const ids = (responseById(q, "d0").ids as string[]) ?? []
  if (ids.length === 0) return []

  const g = await jmapCall(
    [["x:Domain/get", { ids, properties: [...DOMAIN_PROPS] }, "d1"]],
    { retry: true }
  )
  const list = (responseById(g, "d1").list as Record<string, unknown>[]) ?? []
  return list.map(mapDomain)
}

export async function getDomain(id: string): Promise<StalwartDomain | null> {
  const g = await jmapCall(
    [["x:Domain/get", { ids: [id], properties: [...DOMAIN_PROPS] }, "d1"]],
    { retry: true }
  )
  const list = (responseById(g, "d1").list as Record<string, unknown>[]) ?? []
  if (!list[0]) return null
  return mapDomain(list[0])
}

export async function getDomainByName(
  name: string
): Promise<StalwartDomain | null> {
  const target = name.trim().toLowerCase()
  if (!target) return null

  // 1. Direct get by target as ID (frequently identical to domain name in Stalwart JMAP)
  try {
    const direct = await getDomain(target)
    if (direct && direct.name.toLowerCase() === target) {
      return direct
    }
  } catch {
    // continue to query
  }

  // 2. Query with filter: { name: target }
  try {
    const dq = await jmapCall(
      [["x:Domain/query", { filter: { name: target }, limit: 10 }, "dq0"]],
      { retry: true }
    )
    const ids = (responseById(dq, "dq0").ids as string[]) ?? []
    for (const id of ids) {
      const dom = await getDomain(id)
      if (dom && dom.name.toLowerCase() === target) {
        return dom
      }
    }
  } catch {
    // continue to full list
  }

  // 3. Fallback: list all domains and find case-insensitive match
  try {
    const all = await queryDomains()
    const found = all.find((d) => d.name.toLowerCase() === target)
    if (found) return found
  } catch {
    // ignore
  }

  return null
}

const FULL_CREATE_DEFAULTS = {
  certificateManagement: { "@type": "Manual" },
  dkimManagement: { "@type": "Automatic" },
  dnsManagement: { "@type": "Manual" },
  subAddressing: { "@type": "Enabled" },
} as const

export async function createDomain(input: {
  name: string
  description?: string
}): Promise<StalwartDomain> {
  const name = input.name.trim().toLowerCase()
  const description = (input.description ?? name).trim()
  const createKey = "new"

  // Primary attempt: explicitly request Manual DNS & Manual Certificate provision
  const full = await jmapCall([
    [
      "x:Domain/set",
      {
        create: {
          [createKey]: {
            name,
            description,
            ...FULL_CREATE_DEFAULTS,
          },
        },
      },
      "d2",
    ],
  ])
  const fullBody = responseById(full, "d2")
  const fullCreated = fullBody.created as
    | Record<string, Record<string, unknown>>
    | undefined
  if (fullCreated?.[createKey]) {
    return mapDomain({ ...fullCreated[createKey], name, description })
  }

  const fullNotCreated = fullBody.notCreated as
    | Record<string, { type?: string; description?: string }>
    | undefined

  // If Stalwart reports primaryKeyViolation on primary attempt, domain exists!
  if (fullNotCreated?.[createKey]?.type === "primaryKeyViolation") {
    const existing = await getDomainByName(name)
    if (existing) {
      await updateDomain(existing.id, {
        dnsManagement: "Manual",
        certificateManagement: "Manual",
      }).catch(() => {})
      return existing
    }
    throw new StalwartError(
      `Domain "${name}" already exists in Stalwart.`,
      "validation",
      fullNotCreated
    )
  }

  // Fallback to minimal create if Stalwart rejects additional fields
  const minimal = await jmapCall([
    [
      "x:Domain/set",
      { create: { [createKey]: { name, description } } },
      "d3",
    ],
  ])
  const body = responseById(minimal, "d3")
  const created = body.created as Record<string, Record<string, unknown>> | undefined
  const notCreated = body.notCreated as
    | Record<string, { type?: string; description?: string }>
    | undefined

  if (created?.[createKey]) {
    return mapDomain({ ...created[createKey], name, description })
  }

  // If Stalwart reports primaryKeyViolation on minimal attempt, domain exists!
  if (notCreated?.[createKey]?.type === "primaryKeyViolation") {
    const existing = await getDomainByName(name)
    if (existing) {
      await updateDomain(existing.id, {
        dnsManagement: "Manual",
        certificateManagement: "Manual",
      }).catch(() => {})
      return existing
    }
    throw new StalwartError(
      `Domain "${name}" already exists in Stalwart.`,
      "validation",
      notCreated
    )
  }

  throw new StalwartError(
    formatSetFailure(
      (fullBody.notCreated as typeof notCreated) ?? notCreated,
      createKey
    ),
    "jmap",
    fullBody.notCreated ?? notCreated
  )
}

export async function updateDomain(
  id: string,
  patch: Partial<{
    description: string
    isEnabled: boolean
    catchAllAddress: string | null
    allowRelaying: boolean
    subAddressing: unknown
    dnsManagement: "Manual" | "Automatic" | string | Record<string, unknown>
    certificateManagement: "Manual" | "Automatic" | string | Record<string, unknown>
    dkimManagement: "Manual" | "Automatic" | string | Record<string, unknown>
  }>
): Promise<void> {
  const transformedPatch: Record<string, unknown> = { ...patch }
  if (patch.dnsManagement === "Manual") {
    transformedPatch.dnsManagement = { "@type": "Manual" }
  }
  if (patch.certificateManagement === "Manual") {
    transformedPatch.certificateManagement = { "@type": "Manual" }
  }
  if (patch.dkimManagement === "Automatic") {
    transformedPatch.dkimManagement = { "@type": "Automatic" }
  }

  const r = await jmapCall([
    ["x:Domain/set", { update: { [id]: transformedPatch } }, "d2"],
  ])
  const body = responseById(r, "d2")
  const notUpdated = body.notUpdated as
    | Record<string, { type?: string; description?: string }>
    | undefined
  if (notUpdated?.[id]) {
    throw new StalwartError(formatSetFailure(notUpdated, id), "jmap", notUpdated)
  }
}

/**
 * Iterate over all domains in Stalwart and enforce Manual DNS & Manual SSL provisioning.
 */
export async function migrateAllDomainsToManual(): Promise<{
  updated: string[]
  failed: Record<string, string>
}> {
  const domains = await queryDomains()
  const updated: string[] = []
  const failed: Record<string, string> = {}

  for (const domain of domains) {
    try {
      await updateDomain(domain.id, {
        dnsManagement: "Manual",
        certificateManagement: "Manual",
      })
      updated.push(domain.name)
    } catch (err) {
      failed[domain.name] = err instanceof Error ? err.message : String(err)
    }
  }

  return { updated, failed }
}

export async function cleanupDomainDependencies(
  id: string,
  domainName?: string
): Promise<void> {
  const normName = domainName?.trim().toLowerCase()

  // 1. Clean up DKIM signatures linked to this domain in Stalwart
  try {
    const q = await jmapCall(
      [["x:DkimSignature/query", { filter: null, limit: 100 }, "dk0"]],
      { retry: true }
    )
    const sigIds = (responseById(q, "dk0").ids as string[]) ?? []
    if (sigIds.length > 0) {
      const g = await jmapCall([
        [
          "x:DkimSignature/get",
          {
            ids: sigIds,
            properties: ["id", "domain", "domainId", "details", "selector"],
          },
          "dk1",
        ],
      ])
      const sigList =
        (responseById(g, "dk1").list as Array<Record<string, unknown>>) ?? []
      const toDestroy = sigList
        .filter((s) => {
          const sDomain = String(s.domain ?? s.details ?? "").toLowerCase()
          const sDomainId = String(s.domainId ?? "")
          const sId = String(s.id ?? "").toLowerCase()
          return (
            (normName && (sDomain === normName || sId.includes(normName))) ||
            sDomainId === id ||
            sDomainId === normName
          )
        })
        .map((s) => String(s.id))

      if (toDestroy.length > 0) {
        await jmapCall([["x:DkimSignature/set", { destroy: toDestroy }, "dk2"]])
      }
    }
  } catch {
    // Best-effort for setups where x:DkimSignature is not queryable directly
  }

  // 2. Clear domain catchAll and aliases so nothing routes to or from it
  try {
    await jmapCall([
      [
        "x:Domain/set",
        {
          update: {
            [id]: {
              catchAllAddress: null,
              aliases: [],
            },
          },
        },
        "d_clear",
      ],
    ])
  } catch {
    // Best effort
  }
}

export async function destroyDomain(
  id: string,
  domainName?: string
): Promise<void> {
  // First proactively clean up dependent signatures/aliases
  await cleanupDomainDependencies(id, domainName)

  const r = await jmapCall([["x:Domain/set", { destroy: [id] }, "d2"]])
  const body = responseById(r, "d2")
  const notDestroyed = body.notDestroyed as
    | Record<string, { type?: string; description?: string }>
    | undefined

  if (notDestroyed?.[id]) {
    // If Stalwart reports objectIsLinked, retry cleanup and attempt destroy once more
    if (notDestroyed[id].type === "objectIsLinked" && domainName) {
      await cleanupDomainDependencies(id, domainName)
      const retry = await jmapCall([
        ["x:Domain/set", { destroy: [id] }, "d2_retry"],
      ])
      const retryBody = responseById(retry, "d2_retry")
      const retryNotDestroyed = retryBody.notDestroyed as
        | Record<string, { type?: string; description?: string }>
        | undefined
      if (!retryNotDestroyed?.[id]) {
        return
      }
    }

    throw new StalwartError(
      formatSetFailure(notDestroyed, id),
      "jmap",
      notDestroyed
    )
  }
}

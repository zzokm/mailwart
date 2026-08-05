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
  "subAddressing",
  "createdAt",
] as const

function mapDomain(item: Record<string, unknown>): StalwartDomain {
  return {
    id: String(item.id),
    name: String(item.name ?? ""),
    description:
      typeof item.description === "string" ? item.description : undefined,
    isEnabled: typeof item.isEnabled === "boolean" ? item.isEnabled : true,
    catchAllAddress:
      typeof item.catchAllAddress === "string"
        ? item.catchAllAddress
        : item.catchAllAddress === null
          ? null
          : undefined,
    subAddressing: item.subAddressing as StalwartDomain["subAddressing"],
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

const FULL_CREATE_DEFAULTS = {
  certificateManagement: "Manual",
  dkimManagement: "Automatic",
  dnsManagement: "Manual",
  subAddressing: "Enabled",
} as const

export async function createDomain(input: {
  name: string
  description?: string
}): Promise<StalwartDomain> {
  const name = input.name.trim().toLowerCase()
  const description = (input.description ?? name).trim()
  const createKey = "new"

  const minimal = await jmapCall([
    [
      "x:Domain/set",
      { create: { [createKey]: { name, description } } },
      "d2",
    ],
  ])
  const body = responseById(minimal, "d2")
  const created = body.created as Record<string, Record<string, unknown>> | undefined
  const notCreated = body.notCreated as
    | Record<string, { type?: string; description?: string }>
    | undefined

  if (created?.[createKey]) {
    return mapDomain({ ...created[createKey], name, description })
  }

  // Retry with full defaults if Stalwart cites missing fields
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
      "d3",
    ],
  ])
  const fullBody = responseById(full, "d3")
  const fullCreated = fullBody.created as
    | Record<string, Record<string, unknown>>
    | undefined
  if (fullCreated?.[createKey]) {
    return mapDomain({ ...fullCreated[createKey], name, description })
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
    subAddressing: string
  }>
): Promise<void> {
  const r = await jmapCall([
    ["x:Domain/set", { update: { [id]: patch } }, "d2"],
  ])
  const body = responseById(r, "d2")
  const notUpdated = body.notUpdated as
    | Record<string, { type?: string; description?: string }>
    | undefined
  if (notUpdated?.[id]) {
    throw new StalwartError(formatSetFailure(notUpdated, id), "jmap", notUpdated)
  }
}

export async function destroyDomain(id: string): Promise<void> {
  const r = await jmapCall([["x:Domain/set", { destroy: [id] }, "d2"]])
  const body = responseById(r, "d2")
  const notDestroyed = body.notDestroyed as
    | Record<string, { type?: string; description?: string }>
    | undefined
  if (notDestroyed?.[id]) {
    throw new StalwartError(
      formatSetFailure(notDestroyed, id),
      "jmap",
      notDestroyed
    )
  }
}

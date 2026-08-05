import "server-only"

import { BULK_TIMEOUT_MS, jmapCall, responseById } from "./client"
import { hydrateAccounts } from "./email"
import { formatSetFailure, StalwartError } from "./errors"
import type { StalwartAccount, StalwartDomain } from "./types"
import { queryDomains } from "./domains"

const ACCOUNT_PROPS = [
  "id",
  "name",
  "description",
  "domainId",
  "emails",
  "quotas",
  "usedDiskQuota",
  "aliases",
  "roles",
  "isEnabled",
  "credentials",
] as const

export async function queryAccounts(
  domains?: StalwartDomain[]
): Promise<StalwartAccount[]> {
  const domainList = domains ?? (await queryDomains())
  const q = await jmapCall(
    [["x:Account/query", { filter: null, limit: 200 }, "a0"]],
    { retry: true }
  )
  const ids = (responseById(q, "a0").ids as string[]) ?? []
  if (ids.length === 0) return []

  const g = await jmapCall(
    [["x:Account/get", { ids, properties: [...ACCOUNT_PROPS] }, "a1"]],
    { retry: true }
  )
  const list = (responseById(g, "a1").list as Record<string, unknown>[]) ?? []
  return hydrateAccounts(list, domainList)
}

export async function getAccount(
  id: string,
  domains?: StalwartDomain[]
): Promise<StalwartAccount | null> {
  const domainList = domains ?? (await queryDomains())
  const g = await jmapCall(
    [["x:Account/get", { ids: [id], properties: [...ACCOUNT_PROPS] }, "a1"]],
    { retry: true }
  )
  const list = (responseById(g, "a1").list as Record<string, unknown>[]) ?? []
  if (!list[0]) return null
  return hydrateAccounts([list[0]], domainList)[0] ?? null
}

function userCreatePayload(input: {
  local: string
  email: string
  domainId: string
  password: string
  description?: string
  quotas?: Record<string, unknown>
}) {
  return {
    "@type": "User",
    name: input.local,
    description: input.description ?? input.email,
    domainId: input.domainId,
    credentials: {
      "0": { "@type": "Password", secret: input.password },
    },
    memberGroupIds: {},
    roles: { "@type": "User" },
    permissions: { "@type": "Inherit" },
    quotas: input.quotas ?? {},
    aliases: {},
    encryptionAtRest: { "@type": "Disabled" },
  }
}

export async function createAccount(input: {
  local: string
  email: string
  domainId: string
  password: string
  description?: string
  quotas?: Record<string, unknown>
}): Promise<StalwartAccount> {
  const key = "new"
  const r = await jmapCall([
    [
      "x:Account/set",
      { create: { [key]: userCreatePayload(input) } },
      "a2",
    ],
  ])
  const body = responseById(r, "a2")
  const created = body.created as Record<string, Record<string, unknown>> | undefined
  if (!created?.[key]) {
    throw new StalwartError(
      formatSetFailure(
        body.notCreated as Record<
          string,
          { type?: string; description?: string }
        >,
        key
      ),
      "jmap",
      body.notCreated
    )
  }

  const domains = await queryDomains()
  const account = await getAccount(String(created[key].id ?? ""), domains)
  if (account) return account

  return hydrateAccounts(
    [
      {
        ...created[key],
        name: input.local,
        description: input.description ?? input.email,
        domainId: input.domainId,
      },
    ],
    domains
  )[0]
}

export async function updateAccountPassword(
  id: string,
  password: string
): Promise<void> {
  const r = await jmapCall([
    [
      "x:Account/set",
      {
        update: {
          [id]: {
            credentials: {
              "0": { "@type": "Password", secret: password },
            },
          },
        },
      },
      "a2",
    ],
  ])
  const body = responseById(r, "a2")
  const notUpdated = body.notUpdated as
    | Record<string, { type?: string; description?: string }>
    | undefined
  if (notUpdated?.[id]) {
    throw new StalwartError(formatSetFailure(notUpdated, id), "jmap", notUpdated)
  }
}

export async function updateAccount(
  id: string,
  patch: Partial<{
    description: string
    quotas: Record<string, unknown>
    isEnabled: boolean
    aliases: Record<string, unknown> | unknown[]
  }>
): Promise<void> {
  const r = await jmapCall([
    ["x:Account/set", { update: { [id]: patch } }, "a2"],
  ])
  const body = responseById(r, "a2")
  const notUpdated = body.notUpdated as
    | Record<string, { type?: string; description?: string }>
    | undefined
  if (notUpdated?.[id]) {
    throw new StalwartError(formatSetFailure(notUpdated, id), "jmap", notUpdated)
  }
}

export async function destroyAccount(id: string): Promise<void> {
  const r = await jmapCall([["x:Account/set", { destroy: [id] }, "a2"]])
  const body = responseById(r, "a2")
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

export async function bulkCreateAccounts(
  rows: Array<{
    local: string
    email: string
    domainId: string
    password: string
    description?: string
  }>,
  chunkSize = 25
): Promise<
  Array<{
    email: string
    status: "created" | "failed"
    reason?: string
    id?: string
  }>
> {
  const results: Array<{
    email: string
    status: "created" | "failed"
    reason?: string
    id?: string
  }> = []

  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize)
    const create: Record<string, ReturnType<typeof userCreatePayload>> = {}
    chunk.forEach((row, idx) => {
      create[`u${idx}`] = userCreatePayload(row)
    })

    try {
      const r = await jmapCall(
        [["x:Account/set", { create }, "a2"]],
        { timeoutMs: BULK_TIMEOUT_MS }
      )
      const body = responseById(r, "a2")
      const created = (body.created ?? {}) as Record<
        string,
        Record<string, unknown>
      >
      const notCreated = (body.notCreated ?? {}) as Record<
        string,
        { type?: string; description?: string }
      >

      chunk.forEach((row, idx) => {
        const key = `u${idx}`
        if (created[key]) {
          results.push({
            email: row.email,
            status: "created",
            id: String(created[key].id ?? ""),
          })
        } else {
          results.push({
            email: row.email,
            status: "failed",
            reason: formatSetFailure(notCreated, key),
          })
        }
      })
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Chunk failed talking to Stalwart."
      for (const row of chunk) {
        results.push({ email: row.email, status: "failed", reason: message })
      }
    }
  }

  return results
}

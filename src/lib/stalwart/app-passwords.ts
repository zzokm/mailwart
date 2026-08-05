import "server-only"

import { jmapCall, responseById } from "./client"
import { formatSetFailure, StalwartError } from "./errors"
import type { AppPassword } from "./types"

/**
 * List app passwords via x:AppPassword/query when available.
 * Returns null when the method is unsupported / filter shape unknown —
 * caller should fall back to Account credentials probe or Admin deep-link.
 */
export async function queryAppPasswordsLive(
  accountId: string
): Promise<AppPassword[] | null> {
  try {
    // Prefer account-scoped filter; if Stalwart rejects, fall through.
    const q = await jmapCall([
      [
        "x:AppPassword/query",
        { filter: { accountId }, limit: 100 },
        "ap0",
      ],
    ])
    const first = q.methodResponses?.[0]
    if (!first || first[0] === "error") return null

    const ids = (responseById(q, "ap0").ids as string[]) ?? []
    if (ids.length === 0) return []

    const g = await jmapCall([
      [
        "x:AppPassword/get",
        {
          ids,
          properties: ["id", "description", "createdAt", "expiresAt"],
        },
        "ap1",
      ],
    ])
    if (g.methodResponses?.[0]?.[0] === "error") return null
    const list =
      (responseById(g, "ap1").list as Record<string, unknown>[]) ?? []
    return list.map((item) => ({
      id: String(item.id),
      description:
        typeof item.description === "string" && item.description.trim()
          ? item.description
          : String(item.id),
      createdAt:
        typeof item.createdAt === "string" ? item.createdAt : undefined,
      expiresAt:
        item.expiresAt == null
          ? null
          : typeof item.expiresAt === "string"
            ? item.expiresAt
            : null,
    }))
  } catch {
    return null
  }
}

/**
 * Create an app password. Tries accountId association; secret is server-set
 * when returned in `created`.
 */
export async function createAppPasswordLive(input: {
  accountId: string
  description: string
}): Promise<{ password: AppPassword; secret: string | null }> {
  const key = "new"
  const r = await jmapCall([
    [
      "x:AppPassword/set",
      {
        create: {
          [key]: {
            description: input.description,
            accountId: input.accountId,
            permissions: { "@type": "Inherit" },
            allowedIps: {},
          },
        },
      },
      "ap2",
    ],
  ])

  const first = r.methodResponses?.[0]
  if (first?.[0] === "error") {
    throw new StalwartError(
      "Live x:AppPassword/set rejected create — manage in Stalwart Admin until account association is confirmed.",
      "jmap",
      first[1]
    )
  }

  const body = responseById(r, "ap2")
  const created = body.created as
    | Record<string, Record<string, unknown>>
    | undefined
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

  const row = created[key]
  const secret =
    typeof row.secret === "string" && row.secret ? row.secret : null
  return {
    password: {
      id: String(row.id ?? key),
      description: input.description,
      createdAt:
        typeof row.createdAt === "string"
          ? row.createdAt
          : new Date().toISOString(),
      expiresAt: null,
    },
    secret,
  }
}

export async function destroyAppPasswordLive(id: string): Promise<void> {
  const r = await jmapCall([
    ["x:AppPassword/set", { destroy: [id] }, "ap3"],
  ])
  const first = r.methodResponses?.[0]
  if (first?.[0] === "error") {
    throw new StalwartError(
      "Live x:AppPassword/set rejected destroy — revoke in Stalwart Admin.",
      "jmap",
      first[1]
    )
  }
  const body = responseById(r, "ap3")
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

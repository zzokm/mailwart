import "server-only"

import { jmapCall, responseById } from "./client"
import { queryDomains } from "./domains"
import { queryAccounts } from "./accounts"
import { getStalwartConfig } from "@/lib/env"

export interface PurgePostmasterResult {
  ok: boolean
  purgedCount: number
  details: Array<{
    domain: string
    address: string
    purged: number
  }>
  error?: string
}

/**
 * System abstraction to purge all automated postmaster emails (DMARC, TLS-RPT, NDRs)
 * from catch-all mailboxes across domains using JMAP Email/query + Email/set destroy.
 */
export async function purgeCatchAllPostmasterEmails(
  targetDomainId?: string
): Promise<PurgePostmasterResult> {
  const config = getStalwartConfig()
  const isLive = Boolean(config && process.env.NODE_ENV !== "test")

  if (!isLive) {
    return {
      ok: true,
      purgedCount: 0,
      details: [],
    }
  }

  try {
    const domains = await queryDomains()
    const targetDomains = targetDomainId
      ? domains.filter((d) => d.id === targetDomainId)
      : domains

    const catchDomains = targetDomains.filter((d) => Boolean(d.catchAllAddress))
    if (catchDomains.length === 0) {
      return { ok: true, purgedCount: 0, details: [] }
    }

    const accounts = await queryAccounts(domains)
    let totalPurged = 0
    const details: Array<{ domain: string; address: string; purged: number }> = []

    for (const d of catchDomains) {
      const catchAddr = d.catchAllAddress!.trim().toLowerCase()
      const account = accounts.find((a) => a.email.toLowerCase() === catchAddr)
      if (!account) continue

      const accountId = account.id

      // 1. Query candidate emails in catch-all mailbox
      const queryRes = await jmapCall(
        [
          [
            "Email/query",
            { accountId, limit: 100 },
            "q0",
          ],
          [
            "Email/get",
            {
              accountId,
              "#ids": {
                resultOf: "q0",
                name: "Email/query",
                path: "/ids",
              },
              properties: ["id", "to", "cc", "subject"],
            },
            "g0",
          ],
        ],
        {
          timeoutMs: 8000,
          using: ["urn:ietf:params:jmap:core", "urn:ietf:params:jmap:mail"],
        }
      ).catch(() => null)

      if (!queryRes) continue

      const getBody = responseById(queryRes, "g0")
      const list = (getBody.list as Array<{
        id: string
        to?: Array<{ email?: string }>
        cc?: Array<{ email?: string }>
        subject?: string
      }>) ?? []

      const idsToDestroy: string[] = []

      for (const email of list) {
        const toEmails = (email.to ?? []).map((t) => t.email?.toLowerCase() ?? "")
        const ccEmails = (email.cc ?? []).map((t) => t.email?.toLowerCase() ?? "")
        const allRecipients = [...toEmails, ...ccEmails]

        const hasPostmaster = allRecipients.some((r) => r.startsWith("postmaster@"))
        const subjectLower = (email.subject ?? "").toLowerCase()
        const isReport =
          subjectLower.includes("dmarc aggregate report") ||
          subjectLower.includes("report domain:") ||
          subjectLower.includes("smtp-tls-reporting")

        if (hasPostmaster || (isReport && allRecipients.some((r) => r.includes(d.name.toLowerCase())))) {
          idsToDestroy.push(email.id)
        }
      }

      if (idsToDestroy.length > 0) {
        const destroyRes = await jmapCall(
          [
            [
              "Email/set",
              {
                accountId,
                destroy: idsToDestroy,
              },
              "d0",
            ],
          ],
          {
            timeoutMs: 8000,
            using: ["urn:ietf:params:jmap:core", "urn:ietf:params:jmap:mail"],
          }
        ).catch(() => null)

        if (destroyRes) {
          const destroyBody = responseById(destroyRes, "d0")
          const destroyed = (destroyBody.destroyed as string[]) ?? idsToDestroy
          totalPurged += destroyed.length
          details.push({
            domain: d.name,
            address: catchAddr,
            purged: destroyed.length,
          })
        }
      } else {
        details.push({
          domain: d.name,
          address: catchAddr,
          purged: 0,
        })
      }
    }

    return {
      ok: true,
      purgedCount: totalPurged,
      details,
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return {
      ok: false,
      purgedCount: 0,
      details: [],
      error: message,
    }
  }
}


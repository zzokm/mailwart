import "server-only"
import crypto from "node:crypto"
import { queryDomains, updateDomain } from "./domains"
import { createAccount, queryAccounts } from "./accounts"
import { getMockStore } from "./mock"
import { dataSource as source } from "@/lib/actions/result"
import { assignMailboxOwner, getDomainOwner } from "@/lib/db"
import { recordAudit } from "@/lib/audit"
import type { StalwartAccount } from "./types"

/**
 * Ensures that for the given domain:
 * 1. A mailbox `catch@domain.tld` exists.
 * 2. The domain has `catchAllAddress: catch@domain.tld` and `catchAllMode: "address"`.
 * Idempotent: safe to run multiple times.
 */
export async function ensureCatchAllMailbox(
  domainIdentifier: string,
  userId?: string
): Promise<{
  created: boolean
  mailbox?: StalwartAccount
  domainUpdated?: boolean
  error?: string
}> {
  const src = source()
  const domainName = domainIdentifier.trim().toLowerCase()

  try {
    if (src === "mock") {
      const store = getMockStore()
      const domain = store.domains.find(
        (d) => d.name.toLowerCase() === domainName || d.id === domainIdentifier
      )
      if (!domain) return { created: false, error: "Domain not found in mock store" }

      const email = `catch@${domain.name.toLowerCase()}`
      let account = store.accounts.find((a) => a.email.toLowerCase() === email)
      let created = false

      if (!account) {
        account = {
          id: `acc-${crypto.randomUUID().slice(0, 8)}`,
          name: "catch",
          description: "Catch-all mailbox",
          domainId: domain.id,
          email,
          domainName: domain.name,
          isEnabled: true,
          quotas: {},
          aliases: {},
          appPasswords: [],
          twoFactor: { state: "disabled" },
        }
        store.setAccounts([...store.accounts, account])
        created = true
      }

      // Ensure domain catch-all is set
      let domainUpdated = false
      if (domain.catchAllAddress !== email) {
        domain.catchAllAddress = email
        domain.catchAllMode = "address"
        domainUpdated = true
      }

      return { created, mailbox: account, domainUpdated }
    }

    // Live Stalwart path
    const domains = await queryDomains()
    const domain = domains.find(
      (d) => d.name.toLowerCase() === domainName || d.id === domainIdentifier
    )
    if (!domain) return { created: false, error: `Domain '${domainName}' not found in Stalwart` }

    const targetEmail = `catch@${domain.name.toLowerCase()}`
    const existingAccounts = await queryAccounts(domains)
    let account = existingAccounts.find((a) => a.email.toLowerCase() === targetEmail)
    let created = false

    if (!account) {
      // Generate a strong random password for catch-all mailbox
      const generatedPassword = crypto.randomBytes(18).toString("base64") + "!Aa1"
      try {
        account = await createAccount({
          local: "catch",
          email: targetEmail,
          domainId: domain.id,
          password: generatedPassword,
          description: "Catch-all mailbox",
        })
        created = true

        // Assign domain owner to mailbox if known
        const ownerId = userId || (await getDomainOwner(domain.id))
        if (ownerId) {
          await assignMailboxOwner(account.id, targetEmail, ownerId).catch(() => {})
        }

        await recordAudit({
          actor: "system",
          action: "mailbox.create",
          target: targetEmail,
          detail: "Automatically created catch-all mailbox upon DNS propagation",
        }).catch(() => {})
      } catch (err) {
        // If it was created concurrently, re-fetch
        const refreshed = await queryAccounts(domains).catch(() => [])
        account = refreshed.find((a) => a.email.toLowerCase() === targetEmail)
        if (!account) {
          return {
            created: false,
            error: `Failed to create catch-all mailbox: ${err instanceof Error ? err.message : String(err)}`,
          }
        }
      }
    }

    // Ensure domain catch-all address is set on domain in Stalwart
    let domainUpdated = false
    if (domain.catchAllAddress !== targetEmail) {
      await updateDomain(domain.id, {
        catchAllAddress: targetEmail,
      })
      domainUpdated = true
      await recordAudit({
        actor: "system",
        action: "catchall.update",
        target: domain.name,
        detail: `Set catch-all address to ${targetEmail}`,
      }).catch(() => {})
    }

    return { created, mailbox: account, domainUpdated }
  } catch (err) {
    return {
      created: false,
      error: err instanceof Error ? err.message : String(err),
    }
  }
}

import "server-only"

import { quotaSummary } from "@/lib/format"
import type { StalwartAccount, StalwartDomain } from "@/lib/stalwart/types"
import {
  getMailboxQuotaWarningStatus,
  recordQuotaWarningSent,
  resetQuotaWarningStatus,
} from "@/lib/db/quota-warnings"
import {
  renderQuotaWarningEmailHtml,
  renderQuotaWarningEmailText,
} from "./templates"
import { sendSystemEmail } from "@/lib/email/sender"
import { recordAudit } from "@/lib/audit"
import { queryAccounts } from "@/lib/stalwart/accounts"
import { queryDomains } from "@/lib/stalwart/domains"
import { dataSource as source } from "@/lib/actions/result"
import { getMockStore } from "@/lib/stalwart/mock"

export interface QuotaCheckResult {
  email: string
  quotaBytes: number | null
  usedBytes: number
  percent: number
  actionTaken:
    | "none"
    | "warning_90_sent"
    | "critical_100_sent"
    | "reset_cleared"
  detail?: string
  sentTo?: string
  catchAllCopy?: string | null
}

export interface QuotaCheckSummary {
  checked: number
  warningsSent: number
  criticalSent: number
  resets: number
  results: QuotaCheckResult[]
}

/**
 * Checks a single mailbox against its quota limits and automatically sends
 * 90% warning or 100% critical threshold notification emails.
 * Also guarantees that if a catch-all is set up on the domain, the catch mailbox
 * receives the notification copy.
 */
export async function checkMailboxQuota(
  account: StalwartAccount,
  domain?: StalwartDomain
): Promise<QuotaCheckResult> {
  const normEmail = account.email.trim().toLowerCase()
  const summary = quotaSummary(account.quotas)

  // Infinite capacity mailboxes have no quota ceiling to warn against
  if (summary.isUnlimited || summary.bytes == null || summary.bytes <= 0) {
    return {
      email: normEmail,
      quotaBytes: null,
      usedBytes: account.usedDiskQuota ?? summary.used ?? 0,
      percent: 0,
      actionTaken: "none",
      detail: "Infinite capacity mailbox",
    }
  }

  const quotaBytes = summary.bytes
  const usedBytes = account.usedDiskQuota ?? summary.used ?? 0
  const percent = (usedBytes / quotaBytes) * 100

  const status = await getMailboxQuotaWarningStatus(normEmail)
  const catchAllAddress =
    domain?.catchAllAddress &&
    domain.catchAllAddress.toLowerCase() !== normEmail
      ? domain.catchAllAddress
      : null

  // 1. Critical Level (100% or greater)
  if (percent >= 100) {
    if (!status.warning100SentAt) {
      const emailPayload = {
        email: normEmail,
        domainName: domain?.name ?? normEmail.split("@")[1] ?? "",
        quotaBytes,
        usedBytes,
        catchAllAddress,
      }

      const html = renderQuotaWarningEmailHtml(emailPayload, 100)
      const text = renderQuotaWarningEmailText(emailPayload, 100)
      const subject = `[Urgent] Storage full (100%) for ${normEmail} - incoming emails suspended`

      const sendRes = await dispatchQuotaAlert({
        to: normEmail,
        catchAll: catchAllAddress,
        subject,
        html,
        text,
      })

      await recordQuotaWarningSent({
        email: normEmail,
        level: 100,
        usedBytes,
        quotaBytes,
        sentTo: normEmail,
        catchAllCopy: catchAllAddress,
        status: sendRes.success ? "sent" : "failed",
        error: sendRes.error,
      })

      await recordAudit({
        actor: "system",
        action: "mailbox.quota_critical",
        detail: `Dispatched 100% quota full alert to ${normEmail}${catchAllAddress ? ` and catch-all ${catchAllAddress}` : ""}`,
        meta: { email: normEmail, usedBytes, quotaBytes, percent, catchAll: catchAllAddress },
      }).catch(() => {})

      return {
        email: normEmail,
        quotaBytes,
        usedBytes,
        percent,
        actionTaken: "critical_100_sent",
        detail: `Dispatched 100% critical quota alert (${percent.toFixed(1)}%)`,
        sentTo: normEmail,
        catchAllCopy: catchAllAddress,
      }
    }

    return {
      email: normEmail,
      quotaBytes,
      usedBytes,
      percent,
      actionTaken: "none",
      detail: "100% warning already dispatched",
    }
  }

  // 2. Warning Level (90% to 99.9%)
  if (percent >= 90) {
    // If 100% was previously dispatched and user freed space down to 90-99%, clear 100% flag
    if (status.warning100SentAt) {
      await resetQuotaWarningStatus(normEmail, 100)
    }

    if (!status.warning90SentAt) {
      const emailPayload = {
        email: normEmail,
        domainName: domain?.name ?? normEmail.split("@")[1] ?? "",
        quotaBytes,
        usedBytes,
        catchAllAddress,
      }

      const html = renderQuotaWarningEmailHtml(emailPayload, 90)
      const text = renderQuotaWarningEmailText(emailPayload, 90)
      const subject = `[Warning] Storage capacity 90% reached for ${normEmail}`

      const sendRes = await dispatchQuotaAlert({
        to: normEmail,
        catchAll: catchAllAddress,
        subject,
        html,
        text,
      })

      await recordQuotaWarningSent({
        email: normEmail,
        level: 90,
        usedBytes,
        quotaBytes,
        sentTo: normEmail,
        catchAllCopy: catchAllAddress,
        status: sendRes.success ? "sent" : "failed",
        error: sendRes.error,
      })

      await recordAudit({
        actor: "system",
        action: "mailbox.quota_warning",
        detail: `Dispatched 90% quota warning alert to ${normEmail}${catchAllAddress ? ` and catch-all ${catchAllAddress}` : ""}`,
        meta: { email: normEmail, usedBytes, quotaBytes, percent, catchAll: catchAllAddress },
      }).catch(() => {})

      return {
        email: normEmail,
        quotaBytes,
        usedBytes,
        percent,
        actionTaken: "warning_90_sent",
        detail: `Dispatched 90% warning quota alert (${percent.toFixed(1)}%)`,
        sentTo: normEmail,
        catchAllCopy: catchAllAddress,
      }
    }

    return {
      email: normEmail,
      quotaBytes,
      usedBytes,
      percent,
      actionTaken: "none",
      detail: "90% warning already dispatched",
    }
  }

  // 3. Normal Level (< 90%)
  if (status.warning90SentAt || status.warning100SentAt) {
    // User freed space below 90% threshold: reset warnings so future spikes re-trigger
    await resetQuotaWarningStatus(normEmail, "all")
    return {
      email: normEmail,
      quotaBytes,
      usedBytes,
      percent,
      actionTaken: "reset_cleared",
      detail: `Usage dropped below 90% (${percent.toFixed(1)}%), warnings reset`,
    }
  }

  return {
    email: normEmail,
    quotaBytes,
    usedBytes,
    percent,
    actionTaken: "none",
    detail: "Usage within normal limits",
  }
}

/**
 * Checks all mailboxes across all domains and sends threshold warning emails as needed.
 */
export async function checkAllMailboxesQuota(
  accountsList?: StalwartAccount[],
  domainsList?: StalwartDomain[]
): Promise<QuotaCheckSummary> {
  const src = source()
  let domains: StalwartDomain[] = []
  let accounts: StalwartAccount[] = []

  if (domainsList && accountsList) {
    domains = domainsList
    accounts = accountsList
  } else if (src === "mock") {
    const store = getMockStore()
    domains = store.domains
    accounts = store.accounts
  } else {
    domains = await queryDomains()
    accounts = await queryAccounts(domains)
  }

  const domainMap = new Map(domains.map((d) => [d.id, d]))
  const results: QuotaCheckResult[] = []

  let warningsSent = 0
  let criticalSent = 0
  let resets = 0

  for (const account of accounts) {
    const domain = account.domainId ? domainMap.get(account.domainId) : undefined
    const res = await checkMailboxQuota(account, domain)
    results.push(res)

    if (res.actionTaken === "warning_90_sent") warningsSent++
    if (res.actionTaken === "critical_100_sent") criticalSent++
    if (res.actionTaken === "reset_cleared") resets++
  }

  return {
    checked: accounts.length,
    warningsSent,
    criticalSent,
    resets,
    results,
  }
}

/**
 * Dispatches the quota email alert to the mailbox recipient and, if configured,
 * directly copies the domain catch-all archive.
 */
async function dispatchQuotaAlert(options: {
  to: string
  catchAll?: string | null
  subject: string
  html: string
  text: string
}): Promise<{ success: boolean; messageId?: string; error?: string }> {
  const recipients = [options.to]
  if (options.catchAll && options.catchAll.toLowerCase() !== options.to.toLowerCase()) {
    recipients.push(options.catchAll)
  }

  // 1. Dispatch via configured system sender
  const primaryRes = await sendSystemEmail({
    to: recipients,
    subject: options.subject,
    html: options.html,
    text: options.text,
    fromName: "Mail Administrator",
  })

  return primaryRes
}

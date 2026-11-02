import { describe, it, expect, beforeEach } from "vitest"
import { checkMailboxQuota, checkAllMailboxesQuota } from "./quota-monitor"
import {
  renderQuotaWarningEmailHtml,
  renderQuotaWarningEmailText,
} from "./templates"
import {
  getMailboxQuotaWarningStatus,
  resetQuotaWarningStatus,
} from "@/lib/db/quota-warnings"
import type { StalwartAccount, StalwartDomain } from "@/lib/stalwart/types"

describe("Mailbox Storage Quota Warning & Auto-Alert System", () => {
  const testDomain: StalwartDomain = {
    id: "dom-test",
    name: "testdomain.com",
    catchAllAddress: "catch@testdomain.com",
    catchAllMode: "address",
  }

  const baseAccount: StalwartAccount = {
    id: "acc-1",
    name: "user",
    email: "user@testdomain.com",
    domainId: "dom-test",
    domainName: "testdomain.com",
    isEnabled: true,
    quotas: {
      maxDiskQuota: 100 * 1024 * 1024, // 100 MB
    },
    aliases: {},
    appPasswords: [],
    twoFactor: { state: "disabled" },
  }

  beforeEach(async () => {
    await resetQuotaWarningStatus("user@testdomain.com", "all")
    await resetQuotaWarningStatus("catch@testdomain.com", "all")
  })

  it("skips mailboxes with infinite or unmetered capacity", async () => {
    const infiniteAccount: StalwartAccount = {
      ...baseAccount,
      quotas: {}, // empty = infinite
      usedDiskQuota: 500 * 1024 * 1024, // 500 MB used
    }

    const result = await checkMailboxQuota(infiniteAccount, testDomain)
    expect(result.actionTaken).toBe("none")
    expect(result.quotaBytes).toBeNull()
  })

  it("does not send warning when usage is below 90%", async () => {
    const underLimitAccount: StalwartAccount = {
      ...baseAccount,
      usedDiskQuota: 50 * 1024 * 1024, // 50 MB / 100 MB = 50%
    }

    const result = await checkMailboxQuota(underLimitAccount, testDomain)
    expect(result.actionTaken).toBe("none")
    expect(result.percent).toBe(50)

    const status = await getMailboxQuotaWarningStatus(underLimitAccount.email)
    expect(status.warning90SentAt).toBeNull()
    expect(status.warning100SentAt).toBeNull()
  })

  it("dispatches 90% warning email and copies domain catch-all when usage reaches threshold", async () => {
    const warningAccount: StalwartAccount = {
      ...baseAccount,
      usedDiskQuota: 92 * 1024 * 1024, // 92 MB / 100 MB = 92%
    }

    const result = await checkMailboxQuota(warningAccount, testDomain)
    expect(result.actionTaken).toBe("warning_90_sent")
    expect(result.percent).toBe(92)
    expect(result.sentTo).toBe("user@testdomain.com")
    expect(result.catchAllCopy).toBe("catch@testdomain.com")

    const status = await getMailboxQuotaWarningStatus(warningAccount.email)
    expect(status.warning90SentAt).not.toBeNull()
    expect(status.warning100SentAt).toBeNull()

    // Subsequent check at 92% should NOT duplicate the warning email
    const secondCheck = await checkMailboxQuota(warningAccount, testDomain)
    expect(secondCheck.actionTaken).toBe("none")
    expect(secondCheck.detail).toContain("already dispatched")
  })

  it("dispatches 100% critical alert and copies domain catch-all when storage is full", async () => {
    const fullAccount: StalwartAccount = {
      ...baseAccount,
      usedDiskQuota: 100 * 1024 * 1024, // 100 MB / 100 MB = 100%
    }

    const result = await checkMailboxQuota(fullAccount, testDomain)
    expect(result.actionTaken).toBe("critical_100_sent")
    expect(result.percent).toBe(100)
    expect(result.sentTo).toBe("user@testdomain.com")
    expect(result.catchAllCopy).toBe("catch@testdomain.com")

    const status = await getMailboxQuotaWarningStatus(fullAccount.email)
    expect(status.warning100SentAt).not.toBeNull()

    // Subsequent check at 100% should NOT duplicate the alert
    const secondCheck = await checkMailboxQuota(fullAccount, testDomain)
    expect(secondCheck.actionTaken).toBe("none")
    expect(secondCheck.detail).toContain("already dispatched")
  })

  it("resets warning flags when mailbox usage drops below 90%", async () => {
    const fullAccount: StalwartAccount = {
      ...baseAccount,
      usedDiskQuota: 100 * 1024 * 1024,
    }
    await checkMailboxQuota(fullAccount, testDomain)

    let status = await getMailboxQuotaWarningStatus(fullAccount.email)
    expect(status.warning100SentAt).not.toBeNull()

    // User deletes emails, usage drops to 60 MB (60%)
    const cleanedAccount: StalwartAccount = {
      ...baseAccount,
      usedDiskQuota: 60 * 1024 * 1024,
    }
    const cleanResult = await checkMailboxQuota(cleanedAccount, testDomain)
    expect(cleanResult.actionTaken).toBe("reset_cleared")

    status = await getMailboxQuotaWarningStatus(fullAccount.email)
    expect(status.warning90SentAt).toBeNull()
    expect(status.warning100SentAt).toBeNull()

    // If storage fills up again to 92%, warning triggers again
    const reWarningAccount: StalwartAccount = {
      ...baseAccount,
      usedDiskQuota: 92 * 1024 * 1024,
    }
    const reResult = await checkMailboxQuota(reWarningAccount, testDomain)
    expect(reResult.actionTaken).toBe("warning_90_sent")
  })

  it("renders email templates with allocated size, current usage, and catch-all status", () => {
    const payload = {
      email: "user@testdomain.com",
      domainName: "testdomain.com",
      quotaBytes: 64 * 1024 * 1024,
      usedBytes: 58 * 1024 * 1024,
      catchAllAddress: "catch@testdomain.com",
    }

    const html90 = renderQuotaWarningEmailHtml(payload, 90)
    expect(html90).toContain("64 MB")
    expect(html90).toContain("58 MB")
    expect(html90).toContain("catch@testdomain.com")
    expect(html90).toContain("90% QUOTA")
    expect(html90).toContain("stop receiving new emails")

    const text100 = renderQuotaWarningEmailText(
      {
        ...payload,
        usedBytes: 64 * 1024 * 1024,
      },
      100
    )
    expect(text100).toContain("STORAGE FULL (100%)")
    expect(text100).toContain("Allocated Quota:    64 MB")
    expect(text100).toContain("Current Usage:      64 MB")
    expect(text100).toContain("catch@testdomain.com")
    expect(text100).toContain("stop receiving incoming emails")
  })

  it("checks batch mailboxes across multiple domains", async () => {
    const accounts: StalwartAccount[] = [
      {
        ...baseAccount,
        id: "acc-a",
        email: "a@testdomain.com",
        usedDiskQuota: 95 * 1024 * 1024,
      },
      {
        ...baseAccount,
        id: "acc-b",
        email: "b@testdomain.com",
        usedDiskQuota: 20 * 1024 * 1024,
      },
    ]

    const summary = await checkAllMailboxesQuota(accounts, [testDomain])
    expect(summary.checked).toBe(2)
    expect(summary.warningsSent).toBe(1)
  })
})

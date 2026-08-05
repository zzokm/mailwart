import type {
  DomainListItem,
  HealthStatus,
  OverviewStats,
  StalwartAccount,
  StalwartDomain,
} from "./types"

/** Production-shaped sample data when STALWART_* env is missing. */
export const MOCK_DOMAINS: StalwartDomain[] = [
  {
    id: "dom-yehia",
    name: "yehia.dev",
    description: "yehia.dev",
    isEnabled: true,
    catchAllAddress: "catch@yehia.dev",
    subAddressing: "Enabled",
    createdAt: "2025-11-01T00:00:00Z",
  },
  {
    id: "dom-hiy",
    name: "hiy.me",
    description: "hiy.me",
    isEnabled: true,
    catchAllAddress: "catch@hiy.me",
    subAddressing: "Enabled",
    createdAt: "2025-11-01T00:00:00Z",
  },
  {
    id: "dom-zokm",
    name: "zokm.me",
    description: "zokm.me",
    isEnabled: true,
    catchAllAddress: "catch@zokm.me",
    subAddressing: "Enabled",
    createdAt: "2025-11-01T00:00:00Z",
  },
  {
    id: "dom-restoqd",
    name: "restoqd.com",
    description: "restoqd.com",
    isEnabled: true,
    catchAllAddress: "catch@restoqd.com",
    subAddressing: "Enabled",
    createdAt: "2025-11-01T00:00:00Z",
  },
]

export const MOCK_ACCOUNTS: StalwartAccount[] = [
  {
    id: "acc-hi",
    name: "hi",
    description: "hi@yehia.dev",
    domainId: "dom-yehia",
    email: "hi@yehia.dev",
    domainName: "yehia.dev",
    quotas: { diskQuota: 2_147_483_648 },
    aliases: {},
  },
  {
    id: "acc-me",
    name: "me",
    description: "me@yehia.dev",
    domainId: "dom-yehia",
    email: "me@yehia.dev",
    domainName: "yehia.dev",
    quotas: { diskQuota: 5_368_709_120 },
    aliases: {},
  },
  {
    id: "acc-noreply",
    name: "noreply",
    description: "noreply@yehia.dev",
    domainId: "dom-yehia",
    email: "noreply@yehia.dev",
    domainName: "yehia.dev",
    quotas: {},
    aliases: {},
  },
  {
    id: "acc-catch-yehia",
    name: "catch",
    description: "catch@yehia.dev",
    domainId: "dom-yehia",
    email: "catch@yehia.dev",
    domainName: "yehia.dev",
    quotas: {},
    aliases: {},
  },
  {
    id: "acc-coolify",
    name: "coolify",
    description: "coolify@zokm.me",
    domainId: "dom-zokm",
    email: "coolify@zokm.me",
    domainName: "zokm.me",
    quotas: { diskQuota: 2_147_483_648 },
    aliases: {},
  },
  {
    id: "acc-support",
    name: "support",
    description: "support@zokm.me",
    domainId: "dom-zokm",
    email: "support@zokm.me",
    domainName: "zokm.me",
    quotas: { diskQuota: 2_147_483_648 },
    aliases: {},
  },
  {
    id: "acc-appflowy",
    name: "appflowy",
    description: "appflowy@zokm.me",
    domainId: "dom-zokm",
    email: "appflowy@zokm.me",
    domainName: "zokm.me",
    quotas: {},
    aliases: {},
  },
  {
    id: "acc-games",
    name: "games",
    description: "games@zokm.me",
    domainId: "dom-zokm",
    email: "games@zokm.me",
    domainName: "zokm.me",
    quotas: {},
    aliases: {},
  },
  {
    id: "acc-catch-zokm",
    name: "catch",
    description: "catch@zokm.me",
    domainId: "dom-zokm",
    email: "catch@zokm.me",
    domainName: "zokm.me",
    quotas: {},
    aliases: {},
  },
  {
    id: "acc-catch-hiy",
    name: "catch",
    description: "catch@hiy.me",
    domainId: "dom-hiy",
    email: "catch@hiy.me",
    domainName: "hiy.me",
    quotas: {},
    aliases: {},
  },
  {
    id: "acc-catch-restoqd",
    name: "catch",
    description: "catch@restoqd.com",
    domainId: "dom-restoqd",
    email: "catch@restoqd.com",
    domainName: "restoqd.com",
    quotas: {},
    aliases: {},
  },
  {
    id: "acc-admin",
    name: "admin",
    description: "admin@zokm.me",
    domainId: "dom-zokm",
    email: "admin@zokm.me",
    domainName: "zokm.me",
    quotas: {},
    aliases: {},
    isAdmin: true,
    roles: { "@type": "Admin" },
  },
]

export function mockDomainList(): DomainListItem[] {
  return MOCK_DOMAINS.map((d) => ({
    ...d,
    mailboxCount: MOCK_ACCOUNTS.filter((a) => a.domainId === d.id).length,
  }))
}

export function mockOverviewStats(): OverviewStats {
  const quotas = MOCK_ACCOUNTS.map((a) => {
    const q = a.quotas?.diskQuota
    return typeof q === "number" ? q : 0
  })
  const total = quotas.reduce((s, n) => s + n, 0)
  return {
    domainCount: MOCK_DOMAINS.length,
    mailboxCount: MOCK_ACCOUNTS.length,
    storageQuotaBytes: total > 0 ? total : null,
    storageUsedBytes: null,
    activeSessions: null,
  }
}

export function mockHealth(): HealthStatus {
  return {
    jmap: {
      ok: false,
      latencyMs: null,
      error: "STALWART_* not configured — showing sample directory.",
    },
    roundcube: { ok: null },
    source: "mock",
  }
}

/** In-memory mutation store for mock mode (process-local, resets on restart). */
let mockDomains = [...MOCK_DOMAINS]
let mockAccounts = [...MOCK_ACCOUNTS]

export function getMockStore() {
  return {
    domains: mockDomains,
    accounts: mockAccounts,
    reset() {
      mockDomains = [...MOCK_DOMAINS]
      mockAccounts = [...MOCK_ACCOUNTS]
    },
    setDomains(next: StalwartDomain[]) {
      mockDomains = next
    },
    setAccounts(next: StalwartAccount[]) {
      mockAccounts = next
    },
  }
}

import type {
  DomainListItem,
  HealthStatus,
  OverviewStats,
  StalwartAccount,
  StalwartDomain,
} from "./types"

/** Production-shaped sample data when STALWART_* env is missing. RFC 2606 domains only. */
export const MOCK_DOMAINS: StalwartDomain[] = [
  {
    id: "dom-example-com",
    name: "example.com",
    description: "example.com",
    isEnabled: true,
    catchAllAddress: "catch@example.com",
    subAddressing: "Enabled",
    createdAt: "2025-11-01T00:00:00Z",
  },
  {
    id: "dom-example-net",
    name: "example.net",
    description: "example.net",
    isEnabled: true,
    catchAllAddress: "catch@example.net",
    subAddressing: "Enabled",
    createdAt: "2025-11-01T00:00:00Z",
  },
  {
    id: "dom-example-org",
    name: "example.org",
    description: "example.org",
    isEnabled: true,
    catchAllAddress: "catch@example.org",
    subAddressing: "Enabled",
    createdAt: "2025-11-01T00:00:00Z",
  },
  {
    id: "dom-test",
    name: "internal.test",
    description: "internal.test",
    isEnabled: false,
    catchAllAddress: null,
    subAddressing: "Enabled",
    createdAt: "2025-11-01T00:00:00Z",
  },
]

export const MOCK_ACCOUNTS: StalwartAccount[] = [
  {
    id: "acc-hello",
    name: "hello",
    description: "hello@example.com",
    domainId: "dom-example-com",
    email: "hello@example.com",
    domainName: "example.com",
    quotas: { diskQuota: 2_147_483_648 },
    aliases: {},
  },
  {
    id: "acc-billing",
    name: "billing",
    description: "billing@example.com",
    domainId: "dom-example-com",
    email: "billing@example.com",
    domainName: "example.com",
    quotas: { diskQuota: 5_368_709_120 },
    aliases: {},
  },
  {
    id: "acc-noreply",
    name: "noreply",
    description: "noreply@example.com",
    domainId: "dom-example-com",
    email: "noreply@example.com",
    domainName: "example.com",
    quotas: {},
    aliases: {},
  },
  {
    id: "acc-catch-example-com",
    name: "catch",
    description: "catch@example.com",
    domainId: "dom-example-com",
    email: "catch@example.com",
    domainName: "example.com",
    quotas: {},
    aliases: {},
  },
  {
    id: "acc-support",
    name: "support",
    description: "support@example.net",
    domainId: "dom-example-net",
    email: "support@example.net",
    domainName: "example.net",
    quotas: { diskQuota: 2_147_483_648 },
    aliases: {},
  },
  {
    id: "acc-alerts",
    name: "alerts",
    description: "alerts@example.net",
    domainId: "dom-example-net",
    email: "alerts@example.net",
    domainName: "example.net",
    quotas: { diskQuota: 1_073_741_824 },
    aliases: {},
  },
  {
    id: "acc-deploy",
    name: "deploy",
    description: "deploy@example.net",
    domainId: "dom-example-net",
    email: "deploy@example.net",
    domainName: "example.net",
    quotas: {},
    aliases: {},
  },
  {
    id: "acc-catch-example-net",
    name: "catch",
    description: "catch@example.net",
    domainId: "dom-example-net",
    email: "catch@example.net",
    domainName: "example.net",
    quotas: {},
    aliases: {},
  },
  {
    id: "acc-press",
    name: "press",
    description: "press@example.org",
    domainId: "dom-example-org",
    email: "press@example.org",
    domainName: "example.org",
    quotas: {},
    aliases: {},
  },
  {
    id: "acc-catch-example-org",
    name: "catch",
    description: "catch@example.org",
    domainId: "dom-example-org",
    email: "catch@example.org",
    domainName: "example.org",
    quotas: {},
    aliases: {},
  },
  {
    id: "acc-admin",
    name: "admin",
    description: "admin@example.com",
    domainId: "dom-example-com",
    email: "admin@example.com",
    domainName: "example.com",
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
      error: "STALWART_* not configured. Showing sample directory.",
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

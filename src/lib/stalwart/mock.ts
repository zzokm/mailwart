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
    isEnabled: true,
    quotas: { diskQuota: 2_147_483_648, diskUsed: 812_646_400 },
    aliases: {},
    appPasswords: [
      {
        id: "ap-hello-1",
        description: "Thunderbird",
        createdAt: "2026-01-12T10:00:00Z",
      },
    ],
    twoFactor: { state: "enabled" },
  },
  {
    id: "acc-billing",
    name: "billing",
    description: "billing@example.com",
    domainId: "dom-example-com",
    email: "billing@example.com",
    domainName: "example.com",
    isEnabled: true,
    quotas: { diskQuota: 5_368_709_120, diskUsed: 4_831_838_208 },
    aliases: {},
    appPasswords: [],
    twoFactor: { state: "disabled" },
  },
  {
    id: "acc-noreply",
    name: "noreply",
    description: "noreply@example.com",
    domainId: "dom-example-com",
    email: "noreply@example.com",
    domainName: "example.com",
    isEnabled: false,
    quotas: {},
    aliases: {},
    appPasswords: [],
    twoFactor: { state: "disabled" },
  },
  {
    id: "acc-catch-example-com",
    name: "catch",
    description: "catch@example.com",
    domainId: "dom-example-com",
    email: "catch@example.com",
    domainName: "example.com",
    isEnabled: true,
    quotas: {},
    aliases: {},
    appPasswords: [],
    twoFactor: { state: "disabled" },
  },
  {
    id: "acc-support",
    name: "support",
    description: "support@example.net",
    domainId: "dom-example-net",
    email: "support@example.net",
    domainName: "example.net",
    isEnabled: true,
    quotas: { diskQuota: 2_147_483_648, diskUsed: 1_288_490_188 },
    aliases: {},
    appPasswords: [
      {
        id: "ap-support-1",
        description: "Phone IMAP",
        createdAt: "2026-02-01T08:30:00Z",
      },
      {
        id: "ap-support-2",
        description: "CI SMTP",
        createdAt: "2026-03-14T16:00:00Z",
      },
    ],
    twoFactor: { state: "enabled" },
  },
  {
    id: "acc-alerts",
    name: "alerts",
    description: "alerts@example.net",
    domainId: "dom-example-net",
    email: "alerts@example.net",
    domainName: "example.net",
    isEnabled: true,
    quotas: { diskQuota: 1_073_741_824, diskUsed: 94_371_840 },
    aliases: {},
    appPasswords: [],
    twoFactor: { state: "disabled" },
  },
  {
    id: "acc-deploy",
    name: "deploy",
    description: "deploy@example.net",
    domainId: "dom-example-net",
    email: "deploy@example.net",
    domainName: "example.net",
    isEnabled: true,
    quotas: {},
    aliases: {},
    appPasswords: [],
    twoFactor: { state: "unknown", note: "Sample unknown probe state." },
  },
  {
    id: "acc-catch-example-net",
    name: "catch",
    description: "catch@example.net",
    domainId: "dom-example-net",
    email: "catch@example.net",
    domainName: "example.net",
    isEnabled: true,
    quotas: {},
    aliases: {},
    appPasswords: [],
    twoFactor: { state: "disabled" },
  },
  {
    id: "acc-press",
    name: "press",
    description: "press@example.org",
    domainId: "dom-example-org",
    email: "press@example.org",
    domainName: "example.org",
    isEnabled: true,
    quotas: {},
    aliases: {},
    appPasswords: [],
    twoFactor: { state: "disabled" },
  },
  {
    id: "acc-catch-example-org",
    name: "catch",
    description: "catch@example.org",
    domainId: "dom-example-org",
    email: "catch@example.org",
    domainName: "example.org",
    isEnabled: true,
    quotas: {},
    aliases: {},
    appPasswords: [],
    twoFactor: { state: "disabled" },
  },
  {
    id: "acc-admin",
    name: "admin",
    description: "admin@example.com",
    domainId: "dom-example-com",
    email: "admin@example.com",
    domainName: "example.com",
    isEnabled: true,
    quotas: {},
    aliases: {},
    appPasswords: [],
    twoFactor: { state: "enabled" },
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
  let quotaSum = 0
  let usedSum = 0
  let hasQuota = false
  let hasUsed = false
  let withQuota = 0
  for (const a of MOCK_ACCOUNTS) {
    const q = a.quotas?.diskQuota
    const u = a.quotas?.diskUsed
    if (typeof q === "number") {
      hasQuota = true
      withQuota++
      quotaSum += q
    }
    if (typeof u === "number") {
      hasUsed = true
      usedSum += u
    }
  }
  return {
    domainCount: MOCK_DOMAINS.length,
    mailboxCount: MOCK_ACCOUNTS.length,
    enabledDomainCount: MOCK_DOMAINS.filter((d) => d.isEnabled !== false).length,
    catchAllCount: MOCK_DOMAINS.filter((d) => !!d.catchAllAddress).length,
    mailboxesWithQuota: withQuota,
    storageQuotaBytes: hasQuota ? quotaSum : null,
    storageUsedBytes: hasUsed ? usedSum : null,
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

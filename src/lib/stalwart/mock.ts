import type {
  Autoresponder,
  DomainListItem,
  FilterRule,
  ForwardingRule,
  HealthStatus,
  OverviewStats,
  SpamSettings,
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
    catchAllMode: "address",
    allowRelaying: false,
    mailExchanger: "local",
    domainAliases: [],
    subAddressing: "Enabled",
    createdAt: "2025-11-01T00:00:00Z",
  },
  {
    id: "dom-example-net",
    name: "example.net",
    description: "example.net",
    isEnabled: true,
    catchAllAddress: "catch@example.net",
    catchAllMode: "address",
    allowRelaying: true,
    mailExchanger: "backup",
    domainAliases: ["mail.example.net"],
    subAddressing: "Enabled",
    createdAt: "2025-11-01T00:00:00Z",
  },
  {
    id: "dom-example-org",
    name: "example.org",
    description: "example.org",
    isEnabled: true,
    catchAllAddress: "catch@example.org",
    catchAllMode: "address",
    allowRelaying: false,
    mailExchanger: "local",
    domainAliases: [],
    subAddressing: "Enabled",
    createdAt: "2025-11-01T00:00:00Z",
  },
  {
    id: "dom-test",
    name: "internal.test",
    description: "internal.test",
    isEnabled: false,
    catchAllAddress: null,
    catchAllMode: "bounce",
    allowRelaying: true,
    mailExchanger: "remote",
    domainAliases: [],
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
    aliases: {
      "0": {
        name: "hi",
        domainId: "dom-example-com",
        enabled: true,
        description: "Short alias",
      },
      "1": {
        name: "hello",
        domainId: "dom-example-org",
        enabled: true,
      },
    },
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
    aliases: {
      "0": {
        name: "help",
        domainId: "dom-example-net",
        enabled: true,
      },
    },
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

export const MOCK_FORWARDING_RULES: ForwardingRule[] = [
  {
    id: "fwd-hello-external",
    scope: "user",
    sourceType: "exact",
    domainId: "dom-example-com",
    domainName: "example.com",
    source: "hello@example.com",
    sourceAccountId: "acc-hello",
    targets: ["ops@example.org"],
    keepLocalCopy: true,
    enabled: true,
    backend: "mock",
    updatedAt: "2026-03-01T12:00:00Z",
  },
  {
    id: "fwd-billing-external",
    scope: "user",
    sourceType: "exact",
    domainId: "dom-example-com",
    domainName: "example.com",
    source: "billing@example.com",
    sourceAccountId: "acc-billing",
    targets: ["finance@example.net"],
    keepLocalCopy: false,
    enabled: true,
    backend: "mock",
    updatedAt: "2026-03-10T09:00:00Z",
  },
  {
    id: "fwd-support-wildcard",
    scope: "wildcard",
    sourceType: "wildcard",
    domainId: "dom-example-com",
    domainName: "example.com",
    source: "support-*@example.com",
    sourceAccountId: null,
    targets: ["helpdesk@gmail.com"],
    keepLocalCopy: true,
    enabled: true,
    backend: "mock",
    updatedAt: "2026-03-12T14:20:00Z",
  },
  {
    id: "fwd-dev-regex",
    scope: "regex",
    sourceType: "regex",
    domainId: "dom-example-com",
    domainName: "example.com",
    source: "^dev-(api|web)@example\\.com$",
    sourceAccountId: null,
    targets: ["dev-team@gmail.com"],
    keepLocalCopy: true,
    enabled: true,
    backend: "mock",
    updatedAt: "2026-03-14T11:00:00Z",
  },
  {
    id: "fwd-domain-net",
    scope: "domain",
    sourceType: "domain",
    domainId: "dom-example-net",
    domainName: "example.net",
    source: "*@example.net",
    sourceAccountId: null,
    targets: ["archive@example.com"],
    keepLocalCopy: true,
    enabled: false,
    backend: "mock",
    updatedAt: "2026-02-20T16:30:00Z",
  },
]

export const MOCK_AUTORESPONDERS: Autoresponder[] = [
  {
    id: "ar-hello",
    accountId: "acc-hello",
    email: "hello@example.com",
    domainId: "dom-example-com",
    enabled: true,
    subject: "Out of office",
    body: "Thanks for your message. I am away and will reply when I return.",
    startAt: "2026-08-01T00:00:00Z",
    endAt: "2026-08-15T23:59:59Z",
    daysBetween: 7,
    backend: "mock",
    updatedAt: "2026-07-28T10:00:00Z",
  },
  {
    id: "ar-support",
    accountId: "acc-support",
    email: "support@example.net",
    domainId: "dom-example-net",
    enabled: false,
    subject: "Support hours",
    body: "Our support desk is currently closed. We will respond on the next business day.",
    startAt: null,
    endAt: null,
    daysBetween: 1,
    backend: "mock",
    updatedAt: "2026-06-01T08:00:00Z",
  },
]

export const MOCK_FILTER_RULES: FilterRule[] = [
  {
    id: "flt-global-unsub",
    scope: "global",
    accountId: null,
    email: null,
    name: "Drop unsubscribe noise",
    enabled: true,
    condition: { field: "subject", op: "contains", value: "unsubscribe" },
    action: { type: "discard" },
    priority: 10,
    backend: "mock",
    updatedAt: "2026-05-01T12:00:00Z",
  },
  {
    id: "flt-hello-news",
    scope: "user",
    accountId: "acc-hello",
    email: "hello@example.com",
    name: "Newsletters to folder",
    enabled: true,
    condition: { field: "from", op: "contains", value: "newsletter" },
    action: { type: "fileinto", folder: "INBOX.News" },
    priority: 20,
    backend: "mock",
    updatedAt: "2026-05-12T09:00:00Z",
  },
  {
    id: "flt-billing-invoice",
    scope: "user",
    accountId: "acc-billing",
    email: "billing@example.com",
    name: "Invoices",
    enabled: true,
    condition: { field: "subject", op: "contains", value: "invoice" },
    action: { type: "fileinto", folder: "INBOX.Invoices" },
    priority: 15,
    backend: "mock",
    updatedAt: "2026-05-20T14:00:00Z",
  },
]

export const MOCK_SPAM_SETTINGS: SpamSettings = {
  rejectThreshold: 10,
  markAsSpamThreshold: 5,
  denylist: ["spam@evil.example", "bad.example"],
  allowlist: ["partner@example.org", "example.net"],
  backend: "mock",
  note: "Sample spam posture for local/mock mode.",
  updatedAt: "2026-04-01T00:00:00Z",
}

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
    catchAllCount: MOCK_DOMAINS.filter(
      (d) => d.catchAllMode === "address" || !!d.catchAllAddress
    ).length,
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
let mockDomains = structuredClone(MOCK_DOMAINS)
let mockAccounts = structuredClone(MOCK_ACCOUNTS)
let mockForwards = structuredClone(MOCK_FORWARDING_RULES)
let mockAutoresponders = structuredClone(MOCK_AUTORESPONDERS)
let mockFilterRules = structuredClone(MOCK_FILTER_RULES)
let mockSpamSettings = structuredClone(MOCK_SPAM_SETTINGS)

export function getMockStore() {
  return {
    domains: mockDomains,
    accounts: mockAccounts,
    forwards: mockForwards,
    autoresponders: mockAutoresponders,
    filterRules: mockFilterRules,
    spamSettings: mockSpamSettings,
    reset() {
      mockDomains = structuredClone(MOCK_DOMAINS)
      mockAccounts = structuredClone(MOCK_ACCOUNTS)
      mockForwards = structuredClone(MOCK_FORWARDING_RULES)
      mockAutoresponders = structuredClone(MOCK_AUTORESPONDERS)
      mockFilterRules = structuredClone(MOCK_FILTER_RULES)
      mockSpamSettings = structuredClone(MOCK_SPAM_SETTINGS)
    },
    setDomains(next: StalwartDomain[]) {
      mockDomains = next
    },
    setAccounts(next: StalwartAccount[]) {
      mockAccounts = next
    },
    setForwards(next: ForwardingRule[]) {
      mockForwards = next
    },
    setAutoresponders(next: Autoresponder[]) {
      mockAutoresponders = next
    },
    setFilterRules(next: FilterRule[]) {
      mockFilterRules = next
    },
    setSpamSettings(next: SpamSettings) {
      mockSpamSettings = next
    },
  }
}

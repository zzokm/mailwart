/** Client shapes matching ARCHITECTURE §5 / restore scripts. */

export type DataSource = "live" | "mock"

export type JmapMethodCall = [string, Record<string, unknown>, string]

export type JmapRequest = {
  using: string[]
  methodCalls: JmapMethodCall[]
}

export type JmapMethodResponse = [string, Record<string, unknown>, string]

export type JmapResponse = {
  methodResponses: JmapMethodResponse[]
  sessionState?: string
}

export type StalwartDomain = {
  id: string
  name: string
  description?: string
  isEnabled?: boolean
  catchAllAddress?: string | null
  subAddressing?: string | { "@type"?: string } | null
  createdAt?: string
}

export type AccountQuotas = Record<string, number | string | unknown>

/**
 * Aliases shape is pending live Account/get probe (PRODUCT_SPEC open Q2).
 * Treat as opaque until Phase 3+ probe confirms the map format.
 */
export type AccountAliases = Record<string, unknown> | unknown[] | null

/** App password for SMTP/IMAP clients — secret shown only at create time. */
export type AppPassword = {
  id: string
  description: string
  createdAt?: string
  expiresAt?: string | null
}

/**
 * 2FA / TOTP status derived from Account credentials probe.
 * `unknown` = live shape not confirmed — show Admin deep-link.
 */
export type TwoFactorStatus = {
  state: "enabled" | "disabled" | "unknown"
  note?: string
}

export type StalwartAccount = {
  id: string
  name: string
  description?: string
  domainId?: string
  emails?: unknown
  quotas?: AccountQuotas
  aliases?: AccountAliases
  roles?: unknown
  /** When false, mailbox is suspended (login/routing blocked when API supports it). */
  isEnabled?: boolean
  /** Server-set used disk bytes when Account/get exposes usedDiskQuota. */
  usedDiskQuota?: number
  /** App passwords when mock or credentials probe succeeded. */
  appPasswords?: AppPassword[]
  twoFactor?: TwoFactorStatus
  /** Computed full address for UI — never bare local-part alone. */
  email: string
  domainName?: string
  isAdmin?: boolean
}

export type DomainListItem = StalwartDomain & {
  mailboxCount: number
  /** Compact DNS health when list action runs checks (optional). */
  dnsSummary?: DnsHealthSummary
}

export type OverviewStats = {
  domainCount: number
  mailboxCount: number
  /** Domains with isEnabled !== false. */
  enabledDomainCount: number
  /** Domains with a catch-all address configured. */
  catchAllCount: number
  /** Mailboxes that declare an explicit disk quota. */
  mailboxesWithQuota: number
  /** Sum of known quota limits when present; null = unknown / default. */
  storageQuotaBytes: number | null
  /** Sum of used storage when present; null = unknown. */
  storageUsedBytes: number | null
  /** Soft session count — app sessions not wired until Phase 4. */
  activeSessions: number | null
}

export type HealthStatus = {
  jmap: {
    ok: boolean
    latencyMs: number | null
    error?: string
  }
  roundcube: {
    ok: boolean | null
    error?: string
  }
  source: DataSource
}

/** Pass / warn / fail rubric per ARCHITECTURE §10. `unknown` = not checked. */
export type DnsCheckStatus = "pass" | "warn" | "fail" | "unknown"

export type DnsCheckItem = {
  type: "MX" | "TXT" | "SPF" | "DKIM" | "DMARC"
  label: string
  expected: string
  status: DnsCheckStatus
  note?: string
  /** Observed raw record snippet(s) for copy. */
  observed?: string
}

export type DnsHealthSummary = {
  worst: DnsCheckStatus
  checks: DnsCheckItem[]
  checkedAt: string
  fromCache: boolean
}

export type DkimGeneratedRecord = {
  selector: string
  privateKeyPem: string
  publicKeyPem: string
  dnsName: string
  dnsType: "TXT"
  dnsValue: string
  /** Zone-file style one-liner for paste. */
  zoneLine: string
}

export type DmarcGeneratedRecord = {
  policy: "none" | "quarantine" | "reject"
  dnsName: string
  dnsType: "TXT"
  dnsValue: string
  zoneLine: string
}

export type BulkImportRow = {
  email: string
  password: string
  description?: string
}

export type BulkImportResultRow = BulkImportRow & {
  status: "created" | "skipped" | "failed"
  reason?: string
}

export type ActionResult<T = void> =
  | { ok: true; data: T; source: DataSource }
  | { ok: false; error: string; source: DataSource }

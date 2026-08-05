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

/** How unknown recipients are handled for a domain. */
export type CatchAllMode = "address" | "bounce" | "blackhole"

/**
 * cPanel-style mail exchanger posture for the domain.
 * Maps to Stalwart `allowRelaying` where the API allows:
 * - local → allowRelaying false (reject unknown / deliver local only)
 * - backup → allowRelaying true (accept + relay unknown — split/backup)
 * - remote → allowRelaying true with remote-MX operator intent
 */
export type MailExchangerMode = "local" | "backup" | "remote"

export type StalwartDomain = {
  id: string
  name: string
  description?: string
  isEnabled?: boolean
  catchAllAddress?: string | null
  /**
   * Derived / mock-tracked catch-all posture.
   * Live Stalwart only persists address vs unset (bounce); blackhole is mock or advisory.
   */
  catchAllMode?: CatchAllMode
  /** When true, unknown local recipients may be accepted and relayed (split delivery). */
  allowRelaying?: boolean
  /** Operator-facing MX posture; mock-tracked, derived from allowRelaying on live. */
  mailExchanger?: MailExchangerMode
  /** Domain name aliases (other names treated as this domain). */
  domainAliases?: string[]
  subAddressing?: string | { "@type"?: string } | null
  createdAt?: string
}

/** Normalized email alias (alternate local-part delivering into a mailbox). */
export type EmailAliasEntry = {
  key: string
  name: string
  domainId: string
  enabled: boolean
  description?: string
  /** Reconstructed full address when domain name known. */
  email?: string
}

/**
 * Full forwarder: mail for source is redirected to targets.
 * Distinct from aliases (which expand acceptance into a mailbox).
 */
export type ForwardingRule = {
  id: string
  scope: "user" | "domain"
  /** Domain that owns the source address. */
  domainId: string
  domainName: string
  /** Full source address (user) or `*@domain` (domain). */
  source: string
  /** Existing mailbox id when user-scope and source is a real account. */
  sourceAccountId?: string | null
  targets: string[]
  /** Keep a local copy when the source is a real mailbox (mock / Sieve intent). */
  keepLocalCopy: boolean
  enabled: boolean
  /** How this rule is backed when live. */
  backend: "mock" | "alias" | "catchall" | "sieve-pending"
  updatedAt: string
}

/** Per-mailbox vacation / out-of-office autoresponder. */
export type Autoresponder = {
  id: string
  accountId: string
  email: string
  domainId: string
  enabled: boolean
  subject: string
  body: string
  /** ISO date (inclusive). Null = immediate. */
  startAt?: string | null
  /** ISO date (inclusive). Null = no end. */
  endAt?: string | null
  /** Minimum days between replies to the same sender. */
  daysBetween: number
  backend: "mock" | "sieve" | "sieve-pending"
  updatedAt: string
}

export type FilterScope = "global" | "user"

export type FilterConditionField = "subject" | "from" | "to" | "header"
export type FilterConditionOp = "contains" | "is" | "matches"
export type FilterActionType =
  | "fileinto"
  | "discard"
  | "redirect"
  | "keep"
  | "stop"

export type FilterCondition = {
  field: FilterConditionField
  op: FilterConditionOp
  value: string
  /** Required when field is `header`. */
  headerName?: string
}

export type FilterAction = {
  type: FilterActionType
  /** Destination folder for fileinto (e.g. INBOX.Spam). */
  folder?: string
  /** Redirect target address. */
  redirectTo?: string
}

/** Sieve-style filter rule (global or per-mailbox). */
export type FilterRule = {
  id: string
  scope: FilterScope
  /** Set when scope is user. */
  accountId?: string | null
  email?: string | null
  name: string
  enabled: boolean
  condition: FilterCondition
  action: FilterAction
  /** Lower runs first. */
  priority: number
  backend: "mock" | "sieve" | "sieve-pending"
  updatedAt: string
}

/** Global spam posture — thresholds + address lists. */
export type SpamSettings = {
  /** Score at/above which mail is rejected. */
  rejectThreshold: number
  /** Score at/above which mail is marked as spam. */
  markAsSpamThreshold: number
  /** Blocked senders / domains. */
  denylist: string[]
  /** Trusted senders / domains (safelist). */
  allowlist: string[]
  backend: "mock" | "live" | "unavailable"
  note?: string
  updatedAt: string
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

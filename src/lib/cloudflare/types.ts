export type CloudflareAccount = {
  id: string
  name: string
}

export type CloudflareZone = {
  id: string
  name: string
  status: string
  account: CloudflareAccount
  nameServers?: string[]
  accountConfigId?: string // Internal account configuration ID
  accountLabel?: string // User-visible account or org name
}

export type CloudflareDnsRecord = {
  id: string
  zone_id: string
  zone_name: string
  name: string
  type: string
  content: string
  proxiable: boolean
  proxied: boolean
  ttl: number
  priority?: number
  comment?: string
  created_on?: string
  modified_on?: string
}

export type DnsProvisionAction = "created" | "updated" | "exists" | "deleted" | "failed"

export type ProvisionedRecordResult = {
  type: "MX" | "TXT" | "A" | "CNAME"
  name: string
  content: string
  priority?: number
  action: DnsProvisionAction
  id?: string
  detail?: string
}

export type CloudflareProvisionResult = {
  domain: string
  zoneId: string
  zoneName: string
  records: ProvisionedRecordResult[]
  success: boolean
  error?: string
  conflictsDetected?: DetectedOlderRecord[]
}

export type DetectedOlderRecord = {
  id: string
  type: "MX" | "TXT" | "A" | "CNAME"
  name: string
  content: string
  priority?: number
  proxied?: boolean
  providerDetected?: string // e.g. "Google Workspace", "Microsoft 365", "ProtonMail", "Zoho Mail", "Legacy Server"
  category: "mx" | "spf" | "dkim" | "dmarc" | "mail_host"
  reason: string
}

export type ZoneMailAudit = {
  zoneId: string
  zoneName: string
  accountConfigId?: string
  accountName?: string
  olderRecords: DetectedOlderRecord[]
  hasConflicts: boolean
}

export type CloudflareAccountConfig = {
  id: string
  accountName: string
  accountId?: string
  apiToken: string
  lastVerifiedAt?: string
  zonesCount?: number
  status?: "active" | "error" | "invalid"
  errorMessage?: string
  userId?: string
}

export type CloudflareAccountSummary = {
  id: string
  accountName: string
  accountId?: string
  tokenMasked: string
  lastVerifiedAt?: string
  zonesCount: number
  status: "active" | "error" | "invalid"
  errorMessage?: string
  isEnv?: boolean
  userId?: string
}

export type CloudflareStatus = {
  configured: boolean
  source: "env" | "settings" | "both" | "none"
  accounts: CloudflareAccountSummary[]
  totalZonesCount: number
  // Legacy compatibility fields if any legacy component looks for them
  tokenMasked?: string
  accountName?: string
  lastVerifiedAt?: string
}

export type CloudflareSettings = {
  accounts: CloudflareAccountConfig[]
  // Legacy compatibility fields for migration
  apiToken?: string
  accountName?: string
  lastVerifiedAt?: string
  defaultMailHost?: string
}

export type WebmailPropagationItem = {
  domain: string
  zoneId?: string
  success: boolean
  action?: "created" | "updated" | "exists"
  detail?: string
  error?: string
}

export type WebmailPropagationSummary = {
  total: number
  successCount: number
  failureCount: number
  items: WebmailPropagationItem[]
}


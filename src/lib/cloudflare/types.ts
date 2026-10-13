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

export type DnsProvisionAction = "created" | "updated" | "exists" | "failed"

export type ProvisionedRecordResult = {
  type: "MX" | "TXT"
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
}

export type CloudflareStatus = {
  configured: boolean
  source: "env" | "settings" | "none"
  tokenMasked?: string
  accountName?: string
  accessibleZonesCount?: number
  lastVerifiedAt?: string
  defaultMailHost: string
}

export type CloudflareSettings = {
  apiToken?: string
  accountName?: string
  lastVerifiedAt?: string
  defaultMailHost?: string
}

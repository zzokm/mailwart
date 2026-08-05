export type BulkJobKind = "mailboxes" | "forwarding"

export type BulkRowOutcome =
  | "pending"
  | "created"
  | "skipped"
  | "failed"
  | "updated"

export type BulkMailboxJobRow = {
  email: string
  password: string
  description?: string
  quotaBytes: number | null
  local: string
  domainId: string
  domainName: string
  existingAccountId?: string
  status: BulkRowOutcome
  reason?: string
}

export type BulkForwardJobRow = {
  source: string
  targets: string[]
  keepLocalCopy: boolean
  enabled: boolean
  domainId: string
  domainName: string
  scope: "user" | "domain"
  status: BulkRowOutcome
  reason?: string
}

export type BulkJobReport = {
  id: string
  kind: BulkJobKind
  status: "ready" | "running" | "paused" | "aborted" | "completed"
  overwritePasswords: boolean
  chunkSize: number
  totalRows: number
  doneRows: number
  created: number
  skipped: number
  failed: number
  updated: number
  chunkCount: number
  completedChunkIndexes: number[]
  createdAt: string
  expiresAt: string
  rows: Array<{
    key: string
    status: BulkRowOutcome
    reason?: string
    detail?: string
  }>
}

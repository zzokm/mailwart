import "server-only"

import { BULK_CHUNK_SIZE } from "./parse"
import type {
  BulkForwardJobRow,
  BulkJobKind,
  BulkJobReport,
  BulkMailboxJobRow,
  BulkRowOutcome,
} from "./types"

export type {
  BulkForwardJobRow,
  BulkJobKind,
  BulkJobReport,
  BulkMailboxJobRow,
  BulkRowOutcome,
}

type StoredJob = {
  id: string
  kind: BulkJobKind
  status: BulkJobReport["status"]
  overwritePasswords: boolean
  chunkSize: number
  createdAt: number
  expiresAt: number
  completedChunks: Set<number>
  mailboxRows?: BulkMailboxJobRow[]
  forwardRows?: BulkForwardJobRow[]
}

const TTL_MS = 60 * 60 * 1000
const jobs = new Map<string, StoredJob>()

function purgeExpired() {
  const now = Date.now()
  for (const [id, job] of jobs) {
    if (job.expiresAt <= now) jobs.delete(id)
  }
}

function countOutcomes(
  rows: Array<{ status: BulkRowOutcome }>
): Pick<
  BulkJobReport,
  "doneRows" | "created" | "skipped" | "failed" | "updated"
> {
  let created = 0
  let skipped = 0
  let failed = 0
  let updated = 0
  let doneRows = 0
  for (const r of rows) {
    if (r.status === "pending") continue
    doneRows++
    if (r.status === "created") created++
    else if (r.status === "skipped") skipped++
    else if (r.status === "failed") failed++
    else if (r.status === "updated") updated++
  }
  return { doneRows, created, skipped, failed, updated }
}

export function createMailboxJob(input: {
  rows: BulkMailboxJobRow[]
  overwritePasswords: boolean
  chunkSize?: number
}): StoredJob {
  purgeExpired()
  const id = `job-${crypto.randomUUID()}`
  const now = Date.now()
  const job: StoredJob = {
    id,
    kind: "mailboxes",
    status: "ready",
    overwritePasswords: input.overwritePasswords,
    chunkSize: input.chunkSize ?? BULK_CHUNK_SIZE,
    createdAt: now,
    expiresAt: now + TTL_MS,
    completedChunks: new Set(),
    mailboxRows: input.rows,
  }
  jobs.set(id, job)
  return job
}

export function createForwardingJob(input: {
  rows: BulkForwardJobRow[]
  chunkSize?: number
}): StoredJob {
  purgeExpired()
  const id = `job-${crypto.randomUUID()}`
  const now = Date.now()
  const job: StoredJob = {
    id,
    kind: "forwarding",
    status: "ready",
    overwritePasswords: false,
    chunkSize: input.chunkSize ?? BULK_CHUNK_SIZE,
    createdAt: now,
    expiresAt: now + TTL_MS,
    completedChunks: new Set(),
    forwardRows: input.rows,
  }
  jobs.set(id, job)
  return job
}

export function getJob(jobId: string): StoredJob | null {
  purgeExpired()
  const job = jobs.get(jobId)
  if (!job) return null
  if (job.expiresAt <= Date.now()) {
    jobs.delete(jobId)
    return null
  }
  return job
}

export function abortJob(jobId: string): StoredJob | null {
  const job = getJob(jobId)
  if (!job) return null
  if (job.status === "completed" || job.status === "aborted") return job
  job.status = "aborted"
  return job
}

export function pauseJob(jobId: string): StoredJob | null {
  const job = getJob(jobId)
  if (!job) return null
  if (job.status === "running" || job.status === "ready") {
    job.status = "paused"
  }
  return job
}

export function resumeJob(jobId: string): StoredJob | null {
  const job = getJob(jobId)
  if (!job) return null
  if (job.status === "paused" || job.status === "ready") {
    job.status = "running"
  }
  return job
}

export function toReport(job: StoredJob): BulkJobReport {
  const rows =
    job.kind === "mailboxes" ? (job.mailboxRows ?? []) : (job.forwardRows ?? [])
  const counts = countOutcomes(rows)
  const chunkCount = Math.ceil(rows.length / job.chunkSize) || 0
  const allDone =
    rows.length === 0 || rows.every((r) => r.status !== "pending")

  if (allDone && job.status !== "aborted") {
    job.status = "completed"
  }

  return {
    id: job.id,
    kind: job.kind,
    status: job.status,
    overwritePasswords: job.overwritePasswords,
    chunkSize: job.chunkSize,
    totalRows: rows.length,
    ...counts,
    chunkCount,
    completedChunkIndexes: [...job.completedChunks].sort((a, b) => a - b),
    createdAt: new Date(job.createdAt).toISOString(),
    expiresAt: new Date(job.expiresAt).toISOString(),
    rows: rows.map((r) => {
      if ("email" in r) {
        return {
          key: r.email,
          status: r.status,
          reason: r.reason,
          detail: r.quotaBytes != null ? `quota=${r.quotaBytes}` : undefined,
        }
      }
      return {
        key: r.source,
        status: r.status,
        reason: r.reason,
        detail: r.targets.join(";"),
      }
    }),
  }
}

export type { StoredJob }

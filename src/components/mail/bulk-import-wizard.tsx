"use client"

import { useCallback, useRef, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Download, Pause, Play, Square, Upload } from "lucide-react"
import { toast } from "sonner"

import {
  abortBulkJobAction,
  commitBulkJobChunkAction,
  pauseBulkJobAction,
  prepareBulkForwardingJobAction,
  prepareBulkMailboxJobAction,
  resumeBulkJobAction,
} from "@/lib/actions/mail"
import { toastActionResult } from "@/lib/action-toast"
import {
  FORWARDING_TEMPLATE_CSV,
  FORWARDING_TEMPLATE_FILENAME,
  MAILBOX_TEMPLATE_CSV,
  MAILBOX_TEMPLATE_FILENAME,
} from "@/lib/bulk/templates"
import type { BulkJobReport } from "@/lib/bulk/types"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { cn } from "@/lib/utils"

type Kind = "mailboxes" | "forwarding"
type Step = "upload" | "preview" | "running" | "report"

function downloadText(filename: string, text: string) {
  const blob = new Blob([text], { type: "text/csv;charset=utf-8" })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

function progressPct(job: BulkJobReport): number {
  if (job.totalRows === 0) return 100
  return Math.min(100, Math.round((job.doneRows / job.totalRows) * 100))
}

export function BulkImportWizard() {
  const router = useRouter()
  const [kind, setKind] = useState<Kind>("mailboxes")
  const [step, setStep] = useState<Step>("upload")
  const [csvText, setCsvText] = useState("")
  const [overwrite, setOverwrite] = useState(false)
  const [dragging, setDragging] = useState(false)
  const [job, setJob] = useState<BulkJobReport | null>(null)
  const [pending, startTransition] = useTransition()
  const pauseRef = useRef(false)
  const abortRef = useRef(false)

  const onFile = useCallback(async (file: File) => {
    if (!file.name.toLowerCase().endsWith(".csv") && file.type && !file.type.includes("csv") && file.type !== "text/plain") {
      toast.error("Only CSV files are supported.")
      return
    }
    const text = await file.text()
    setCsvText(text)
    setStep("upload")
    setJob(null)
  }, [])

  function resetAll() {
    pauseRef.current = false
    abortRef.current = false
    setJob(null)
    setCsvText("")
    setStep("upload")
  }

  function validateAndPreview() {
    startTransition(async () => {
      const result =
        kind === "mailboxes"
          ? await prepareBulkMailboxJobAction({
              csvText,
              overwritePasswords: overwrite,
            })
          : await prepareBulkForwardingJobAction({ csvText })

      if (
        !toastActionResult(result, {
          success: result.ok
            ? `Validated ${result.data.job.totalRows} rows (${result.data.job.failed} failed validation, ${result.data.job.totalRows - result.data.job.failed} ready).`
            : "",
        })
      ) {
        return
      }
      setJob(result.data.job)
      setStep("preview")
    })
  }

  async function runChunks(jobId: string, report: BulkJobReport) {
    setStep("running")
    pauseRef.current = false
    abortRef.current = false

    let current = report
    for (let i = 0; i < current.chunkCount; i++) {
      if (abortRef.current) break
      while (pauseRef.current) {
        await new Promise((r) => setTimeout(r, 250))
        if (abortRef.current) break
      }
      if (abortRef.current) break

      if (current.completedChunkIndexes.includes(i)) continue

      const result = await commitBulkJobChunkAction({
        jobId,
        chunkIndex: i,
      })
      if (!toastActionResult(result, { success: "" })) {
        setStep("preview")
        return
      }
      current = result.data.job
      setJob(current)
      if (current.status === "aborted" || current.status === "completed") break
    }

    setJob(current)
    setStep("report")
    router.refresh()

    if (current.status === "aborted") {
      toast.error(
        `Aborted. ${current.created + current.updated} applied, ${current.failed} failed, ${current.skipped} skipped.`
      )
      return
    }
    toast.success(
      `${current.created} created, ${current.updated} updated, ${current.skipped} skipped, ${current.failed} failed.`
    )
  }

  function startCommit() {
    if (!job) return
    startTransition(async () => {
      await runChunks(job.id, job)
    })
  }

  function downloadFailures() {
    if (!job) return
    const failed = job.rows.filter((r) => r.status === "failed")
    const lines =
      kind === "mailboxes"
        ? [
            "email,reason",
            ...failed.map((r) => `${r.key},${JSON.stringify(r.reason ?? "")}`),
          ]
        : [
            "source,reason",
            ...failed.map((r) => `${r.key},${JSON.stringify(r.reason ?? "")}`),
          ]
    downloadText("import-failures.csv", lines.join("\n"))
  }

  const columnsHint =
    kind === "mailboxes"
      ? "email, password, description, quota"
      : "source, targets, keep_local, enabled"

  return (
    <div className="space-y-6">
      <Tabs
        value={kind}
        onValueChange={(v) => {
          if (step === "running") return
          if (v === "mailboxes" || v === "forwarding") {
            setKind(v)
            resetAll()
          }
        }}
      >
        <TabsList variant="line" className="w-full justify-start sm:w-auto">
          <TabsTrigger value="mailboxes">Mailboxes</TabsTrigger>
          <TabsTrigger value="forwarding">Forwarding</TabsTrigger>
        </TabsList>
      </Tabs>

      <ol className="flex flex-wrap gap-2 font-mono text-[11px] tracking-wide text-muted-foreground">
        {(
          [
            ["upload", "Upload"],
            ["preview", "Validate"],
            ["running", "Commit"],
            ["report", "Report"],
          ] as const
        ).map(([id, label], idx) => (
          <li
            key={id}
            className={cn(
              "rounded-md border px-2 py-1",
              step === id
                ? "border-primary/50 text-foreground"
                : "border-border/60"
            )}
          >
            {idx + 1}. {label}
          </li>
        ))}
      </ol>

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() =>
            downloadText(
              kind === "mailboxes"
                ? MAILBOX_TEMPLATE_FILENAME
                : FORWARDING_TEMPLATE_FILENAME,
              kind === "mailboxes"
                ? MAILBOX_TEMPLATE_CSV
                : FORWARDING_TEMPLATE_CSV
            )
          }
        >
          <Download data-icon="inline-start" />
          Download template.csv
        </Button>
      </div>

      {step === "upload" || step === "preview" ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <div
            className={cn(
              "flex min-h-48 flex-col items-center justify-center gap-3 rounded-xl border border-dashed px-4 py-8 text-center transition-colors",
              dragging
                ? "border-primary bg-primary/5"
                : "border-border/80 bg-muted/10"
            )}
            onDragOver={(e) => {
              e.preventDefault()
              setDragging(true)
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault()
              setDragging(false)
              const file = e.dataTransfer.files?.[0]
              if (file) void onFile(file)
            }}
          >
            <Upload className="size-5 text-muted-foreground" />
            <div className="space-y-1">
              <p className="text-sm text-foreground">Drop CSV here</p>
              <p className="text-xs text-muted-foreground">
                Columns: {columnsHint}
              </p>
              <p className="text-[11px] text-muted-foreground">
                CSV only · max 2 MB / 5 000 rows · chunks of 25
              </p>
            </div>
            <label className="cursor-pointer">
              <input
                type="file"
                accept=".csv,text/csv,text/plain"
                className="sr-only"
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  if (file) void onFile(file)
                }}
              />
              <span className="text-sm text-primary underline-offset-4 hover:underline">
                Or browse files
              </span>
            </label>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="csv">Paste CSV</Label>
            <textarea
              id="csv"
              value={csvText}
              onChange={(e) => {
                setCsvText(e.target.value)
                setJob(null)
                setStep("upload")
              }}
              placeholder={
                kind === "mailboxes"
                  ? MAILBOX_TEMPLATE_CSV
                  : FORWARDING_TEMPLATE_CSV
              }
              className="min-h-48 w-full rounded-xl border border-input bg-transparent px-3 py-2 font-mono text-[12px] outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
            />
          </div>
        </div>
      ) : null}

      {(step === "upload" || step === "preview") && csvText.trim() ? (
        <div className="flex flex-wrap items-center gap-4 rounded-xl border border-border/70 px-4 py-3">
          {kind === "mailboxes" ? (
            <label className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={overwrite}
                onCheckedChange={(v) => setOverwrite(!!v)}
              />
              Overwrite passwords on existing addresses
            </label>
          ) : null}
          <Button
            disabled={pending || !csvText.trim()}
            variant="outline"
            onClick={validateAndPreview}
          >
            {pending ? "Validating…" : "Validate CSV"}
          </Button>
          {step === "preview" && job ? (
            <Button disabled={pending} onClick={startCommit}>
              Commit job ({job.chunkCount} chunks)
            </Button>
          ) : null}
        </div>
      ) : null}

      {step === "preview" && job ? (
        <JobSummary job={job} />
      ) : null}

      {step === "running" && job ? (
        <div className="space-y-4 rounded-xl border border-border/70 px-4 py-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
                Job {job.id}
              </p>
              <p className="text-sm text-foreground">
                {job.doneRows} / {job.totalRows} rows · chunk size {job.chunkSize}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="outline"
                disabled={pending}
                onClick={() => {
                  pauseRef.current = true
                  startTransition(async () => {
                    const r = await pauseBulkJobAction(job.id)
                    if (r.ok) setJob(r.data.job)
                    else toastActionResult(r, { success: "" })
                  })
                }}
              >
                <Pause data-icon="inline-start" />
                Pause
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={pending}
                onClick={() => {
                  pauseRef.current = false
                  startTransition(async () => {
                    const r = await resumeBulkJobAction(job.id)
                    if (r.ok) setJob(r.data.job)
                    else toastActionResult(r, { success: "" })
                  })
                }}
              >
                <Play data-icon="inline-start" />
                Resume
              </Button>
              <Button
                size="sm"
                variant="destructive"
                disabled={pending}
                onClick={() => {
                  abortRef.current = true
                  pauseRef.current = false
                  startTransition(async () => {
                    const r = await abortBulkJobAction(job.id)
                    if (r.ok) {
                      setJob(r.data.job)
                      toast.error("Abort requested.")
                    } else toastActionResult(r, { success: "" })
                  })
                }}
              >
                <Square data-icon="inline-start" />
                Abort
              </Button>
            </div>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full bg-primary transition-[width] duration-300"
              style={{ width: `${progressPct(job)}%` }}
            />
          </div>
          <JobSummary job={job} />
        </div>
      ) : null}

      {step === "report" && job ? (
        <div className="space-y-3">
          <JobSummary job={job} />
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={downloadFailures}
              disabled={!job.rows.some((r) => r.status === "failed")}
            >
              Download failures
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={resetAll}>
              Start over
            </Button>
          </div>
          <div className="overflow-hidden rounded-xl border border-border/80">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="font-mono text-[10px] uppercase tracking-[0.14em]">
                    {kind === "mailboxes" ? "Email" : "Source"}
                  </TableHead>
                  <TableHead className="font-mono text-[10px] uppercase tracking-[0.14em]">
                    Status
                  </TableHead>
                  <TableHead className="font-mono text-[10px] uppercase tracking-[0.14em]">
                    Reason
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {job.rows.map((r, i) => (
                  <TableRow key={`${r.key}-${i}`}>
                    <TableCell className="font-mono text-[13px]">
                      {r.key}
                    </TableCell>
                    <TableCell className="font-mono text-[12px]">
                      {r.status}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {r.reason ?? "-"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      ) : null}
    </div>
  )
}

function JobSummary({ job }: { job: BulkJobReport }) {
  return (
    <div className="flex flex-wrap gap-3 font-mono text-[12px] text-muted-foreground">
      <span>total {job.totalRows}</span>
      <span className="text-foreground">created {job.created}</span>
      <span>updated {job.updated}</span>
      <span>skipped {job.skipped}</span>
      <span className="text-destructive">failed {job.failed}</span>
      <span>status {job.status}</span>
    </div>
  )
}

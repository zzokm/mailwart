"use client"

import { useCallback, useState, useTransition } from "react"
import { toast } from "sonner"
import { Upload } from "lucide-react"

import { importMailboxesAction } from "@/lib/actions/mail"
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
import type { BulkImportResultRow } from "@/lib/stalwart/types"
import { cn } from "@/lib/utils"

const SAMPLE = `email,password,description
ops@yehia.dev,ChangeMe123!,ops mailbox
notes@zokm.me,ChangeMe123!`

export function BulkImportWizard() {
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1)
  const [csvText, setCsvText] = useState("")
  const [overwrite, setOverwrite] = useState(false)
  const [dragging, setDragging] = useState(false)
  const [results, setResults] = useState<BulkImportResultRow[] | null>(null)
  const [pending, startTransition] = useTransition()

  const onFile = useCallback(async (file: File) => {
    const text = await file.text()
    setCsvText(text)
    setStep(2)
  }, [])

  function downloadFailures() {
    if (!results) return
    const failed = results.filter((r) => r.status === "failed")
    const lines = [
      "email,password,description,reason",
      ...failed.map(
        (r) =>
          `${r.email},${r.password},${r.description ?? ""},${r.reason ?? ""}`
      ),
    ]
    const blob = new Blob([lines.join("\n")], { type: "text/csv" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = "import-failures.csv"
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="space-y-6">
      <ol className="flex flex-wrap gap-2 font-mono text-[11px] tracking-wide text-muted-foreground">
        {[
          [1, "Upload"],
          [2, "Validate"],
          [3, "Commit"],
          [4, "Report"],
        ].map(([n, label]) => (
          <li
            key={n}
            className={cn(
              "rounded-md border px-2 py-1",
              step === n
                ? "border-primary/50 text-foreground"
                : "border-border/60"
            )}
          >
            {n}. {label}
          </li>
        ))}
      </ol>

      {step === 1 || step === 2 ? (
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
                Columns: email, password, description
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
            <Label htmlFor="csv">Paste CSV / JSON-ish rows</Label>
            <textarea
              id="csv"
              value={csvText}
              onChange={(e) => {
                setCsvText(e.target.value)
                if (e.target.value.trim()) setStep(2)
              }}
              placeholder={SAMPLE}
              className="min-h-48 w-full rounded-xl border border-input bg-transparent px-3 py-2 font-mono text-[12px] outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
            />
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="justify-start"
              onClick={() => {
                setCsvText(SAMPLE)
                setStep(2)
              }}
            >
              Load sample
            </Button>
          </div>
        </div>
      ) : null}

      {step >= 2 && step < 4 ? (
        <div className="flex flex-wrap items-center gap-4 rounded-xl border border-border/70 px-4 py-3">
          <label className="flex items-center gap-2 text-sm">
            <Checkbox
              checked={overwrite}
              onCheckedChange={(v) => setOverwrite(!!v)}
            />
            Overwrite passwords on existing addresses
          </label>
          <Button
            disabled={pending || !csvText.trim()}
            onClick={() => {
              setStep(3)
              startTransition(async () => {
                const result = await importMailboxesAction({
                  csvText,
                  overwritePasswords: overwrite,
                })
                if (!result.ok) {
                  toast.error(result.error)
                  setStep(2)
                  return
                }
                setResults(result.data.results)
                setStep(4)
                const created = result.data.results.filter(
                  (r) => r.status === "created"
                ).length
                const failed = result.data.results.filter(
                  (r) => r.status === "failed"
                ).length
                toast.success(
                  `${created} created/updated, ${failed} failed, ${result.data.results.length - created - failed} skipped.`
                )
              })
            }}
          >
            {pending ? "Committing…" : "Commit import"}
          </Button>
        </div>
      ) : null}

      {step === 4 && results ? (
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={downloadFailures}
              disabled={!results.some((r) => r.status === "failed")}
            >
              Download failures
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                setResults(null)
                setCsvText("")
                setStep(1)
              }}
            >
              Start over
            </Button>
          </div>
          <div className="overflow-hidden rounded-xl border border-border/80">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="font-mono text-[10px] uppercase tracking-[0.14em]">
                    Email
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
                {results.map((r, i) => (
                  <TableRow key={`${r.email}-${i}`}>
                    <TableCell className="font-mono text-[13px]">
                      {r.email}
                    </TableCell>
                    <TableCell className="font-mono text-[12px]">
                      {r.status}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {r.reason ?? "—"}
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

"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useMemo, useState, useTransition } from "react"
import { Ban, Plus, Search, Trash2, KeyRound, Info, Pencil, ArrowUp, ArrowDown, ArrowUpDown } from "lucide-react"

import {
  bulkDestroyMailboxesAction,
  bulkResetPasswordsAction,
  bulkSuspendMailboxesAction,
} from "@/lib/actions/mail"
import { toastActionResult } from "@/lib/action-toast"
import { CreateMailboxDialog } from "@/components/mail/create-mailbox-dialog"
import { ConfirmDestroy } from "@/components/mail/confirm-destroy"
import { EmptyState } from "@/components/mail/empty-state"
import { QuotaBar } from "@/components/mail/quota-bar"
import { RoundcubeButton } from "@/components/mail/roundcube-button"
import { MailboxConfigDialog } from "@/components/mail/mailbox-config-dialog"
import { PasswordField } from "@/components/mail/password-field"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { buildRoundcubeUrl } from "@/lib/roundcube-client"
import { generatePassword, quotaSummary } from "@/lib/format"
import type { StalwartAccount, StalwartDomain } from "@/lib/stalwart/types"

type EmailSortMode = "alpha-asc" | "alpha-desc" | "domain-asc" | "domain-desc"
type StatusSortMode = "active-first" | "suspended-first"
type SpaceSortMode = "used-desc" | "used-asc"

type SortState =
  | { field: null }
  | { field: "email"; mode: EmailSortMode }
  | { field: "status"; mode: StatusSortMode }
  | { field: "space"; mode: SpaceSortMode }

export function MailboxTable({
  accounts,
  domains,
  initialDomainId,
}: {
  accounts: StalwartAccount[]
  domains: StalwartDomain[]
  initialDomainId?: string
}) {
  const router = useRouter()
  const [domainId, setDomainId] = useState(initialDomainId ?? "all")
  const [query, setQuery] = useState("")
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [pending, startTransition] = useTransition()
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false)
  const [bulkResetOpen, setBulkResetOpen] = useState(false)
  const [bulkPassword, setBulkPassword] = useState(() => generatePassword())
  const [createOpen, setCreateOpen] = useState(false)
  const [configAccount, setConfigAccount] = useState<StalwartAccount | null>(null)
  const [sortState, setSortState] = useState<SortState>({ field: null })

  const uniqueDomains = useMemo(() => {
    const set = new Set<string>()
    for (const a of accounts) {
      if (a.domainId) set.add(a.domainId)
      else if (a.email.includes("@")) set.add(a.email.split("@")[1].toLowerCase())
    }
    return set
  }, [accounts])

  const isSingleDomain = domainId !== "all" || uniqueDomains.size <= 1

  function toggleEmailSort() {
    setSortState((prev) => {
      if (prev.field !== "email") {
        return { field: "email", mode: "alpha-asc" }
      }
      if (prev.mode === "alpha-asc") {
        return { field: "email", mode: "alpha-desc" }
      }
      if (isSingleDomain) {
        return { field: null }
      }
      if (prev.mode === "alpha-desc") {
        return { field: "email", mode: "domain-asc" }
      }
      if (prev.mode === "domain-asc") {
        return { field: "email", mode: "domain-desc" }
      }
      return { field: null }
    })
  }

  function toggleStatusSort() {
    setSortState((prev) => {
      if (prev.field !== "status") {
        return { field: "status", mode: "active-first" }
      }
      if (prev.mode === "active-first") {
        return { field: "status", mode: "suspended-first" }
      }
      return { field: null }
    })
  }

  function toggleSpaceSort() {
    setSortState((prev) => {
      if (prev.field !== "space") {
        return { field: "space", mode: "used-desc" }
      }
      if (prev.mode === "used-desc") {
        return { field: "space", mode: "used-asc" }
      }
      return { field: null }
    })
  }

  const filtered = useMemo(() => {
    return accounts.filter((a) => {
      if (domainId !== "all" && a.domainId !== domainId) return false
      if (!query.trim()) return true
      const q = query.toLowerCase()
      return (
        a.email.toLowerCase().includes(q) ||
        (a.description ?? "").toLowerCase().includes(q)
      )
    })
  }, [accounts, domainId, query])

  const sorted = useMemo(() => {
    if (!sortState.field) return filtered

    const list = [...filtered]
    if (sortState.field === "email") {
      const mode = sortState.mode
      return list.sort((a, b) => {
        const eA = a.email.toLowerCase()
        const eB = b.email.toLowerCase()
        if (mode === "alpha-asc") return eA.localeCompare(eB)
        if (mode === "alpha-desc") return eB.localeCompare(eA)

        const [uA = "", dA = ""] = eA.split("@")
        const [uB = "", dB = ""] = eB.split("@")
        if (mode === "domain-asc") {
          const domComp = dA.localeCompare(dB)
          if (domComp !== 0) return domComp
          return uA.localeCompare(uB)
        }
        if (mode === "domain-desc") {
          const domComp = dB.localeCompare(dA)
          if (domComp !== 0) return domComp
          return uB.localeCompare(uA)
        }
        return 0
      })
    }

    if (sortState.field === "status") {
      const mode = sortState.mode
      return list.sort((a, b) => {
        const actA = a.isEnabled !== false ? 1 : 0
        const actB = b.isEnabled !== false ? 1 : 0
        if (actA !== actB) {
          return mode === "active-first" ? actB - actA : actA - actB
        }
        return a.email.toLowerCase().localeCompare(b.email.toLowerCase())
      })
    }

    if (sortState.field === "space") {
      const mode = sortState.mode
      return list.sort((a, b) => {
        const uA = quotaSummary(a.quotas).used
        const uB = quotaSummary(b.quotas).used
        if (uA !== uB) {
          return mode === "used-desc" ? uB - uA : uA - uB
        }
        return a.email.toLowerCase().localeCompare(b.email.toLowerCase())
      })
    }

    return list
  }, [filtered, sortState])

  const allSelected =
    sorted.length > 0 && sorted.every((a) => selected.has(a.id))

  function toggleAll(checked: boolean) {
    if (!checked) {
      setSelected(new Set())
      return
    }
    setSelected(new Set(sorted.map((a) => a.id)))
  }

  function toggleOne(id: string, checked: boolean) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (checked) next.add(id)
      else next.delete(id)
      return next
    })
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-1 flex-col gap-2 sm:flex-row sm:items-center">
          <div className="relative min-w-0 flex-1 sm:max-w-xs">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search email…"
              className="pl-8 font-mono text-[13px]"
            />
          </div>
          <Select
            items={{
              all: "All domains",
              ...Object.fromEntries(domains.map((d) => [d.id, d.name])),
            }}
            value={domainId}
            onValueChange={(v) => setDomainId(v ?? "all")}
          >
            <SelectTrigger className="w-full sm:w-48">
              <SelectValue placeholder="All domains" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All domains</SelectItem>
              {domains.map((d) => (
                <SelectItem key={d.id} value={d.id}>
                  {d.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button size="sm" onClick={() => setCreateOpen(true)}>
          <Plus data-icon="inline-start" />
          Create mailbox
        </Button>
      </div>

      {selected.size > 0 ? (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border/70 bg-muted/20 px-3 py-2">
          <span className="font-mono text-[12px] text-muted-foreground">
            {selected.size} selected
          </span>
          <Button
            size="sm"
            variant="outline"
            disabled={pending}
            onClick={() => {
              setBulkPassword(generatePassword())
              setBulkResetOpen(true)
            }}
          >
            <KeyRound data-icon="inline-start" />
            Reset passwords
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={pending}
            onClick={() => {
              startTransition(async () => {
                const result = await bulkSuspendMailboxesAction(
                  [...selected],
                  true
                )
                if (
                  !toastActionResult(result, {
                    success: result.ok
                      ? `Suspended ${result.data.updated}. Failed: ${result.data.failed.length}.`
                      : "",
                  })
                ) {
                  return
                }
                setSelected(new Set())
                router.refresh()
              })
            }}
          >
            <Ban data-icon="inline-start" />
            Suspend
          </Button>
          <Button
            size="sm"
            variant="destructive"
            disabled={pending}
            onClick={() => setBulkDeleteOpen(true)}
          >
            <Trash2 data-icon="inline-start" />
            Delete
          </Button>
        </div>
      ) : null}

      {filtered.length === 0 ? (
        <EmptyState
          title={
            query || domainId !== "all"
              ? "No mailboxes match this filter."
              : "No mailboxes yet."
          }
          description={
            domainId !== "all"
              ? "Create one for the selected domain."
              : "Create a mailbox to start."
          }
          action={
            <Button size="sm" onClick={() => setCreateOpen(true)}>
              Create mailbox
            </Button>
          }
        />
      ) : (
        <div className="overflow-hidden rounded-xl border border-border/80">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="w-10">
                  <Checkbox
                    checked={allSelected}
                    onCheckedChange={(v) => toggleAll(!!v)}
                    aria-label="Select all"
                  />
                </TableHead>
                <TableHead className="w-[260px]">
                  <button
                    type="button"
                    onClick={toggleEmailSort}
                    className="group inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground hover:text-foreground transition-colors select-none cursor-pointer"
                    title={
                      isSingleDomain
                        ? "Sort by email: A-Z, Z-A, or clear"
                        : "Sort by email: A-Z, Z-A, Domain A-Z, Domain Z-A, or clear"
                    }
                  >
                    <span>Email</span>
                    {sortState.field === "email" ? (
                      sortState.mode === "alpha-asc" ? (
                        <>
                          <ArrowUp className="size-3 text-foreground" />
                          <span className="rounded bg-muted px-1 py-0.5 text-[9px] font-semibold text-foreground lowercase tracking-normal">
                            a-z
                          </span>
                        </>
                      ) : sortState.mode === "alpha-desc" ? (
                        <>
                          <ArrowDown className="size-3 text-foreground" />
                          <span className="rounded bg-muted px-1 py-0.5 text-[9px] font-semibold text-foreground lowercase tracking-normal">
                            z-a
                          </span>
                        </>
                      ) : sortState.mode === "domain-asc" ? (
                        <>
                          <ArrowUp className="size-3 text-foreground" />
                          <span className="rounded bg-muted px-1 py-0.5 text-[9px] font-semibold text-foreground lowercase tracking-normal">
                            @ a-z
                          </span>
                        </>
                      ) : (
                        <>
                          <ArrowDown className="size-3 text-foreground" />
                          <span className="rounded bg-muted px-1 py-0.5 text-[9px] font-semibold text-foreground lowercase tracking-normal">
                            @ z-a
                          </span>
                        </>
                      )
                    ) : (
                      <ArrowUpDown className="size-3 opacity-40 group-hover:opacity-80 transition-opacity" />
                    )}
                  </button>
                </TableHead>
                <TableHead className="w-24 hidden text-center sm:table-cell">
                  <div className="flex justify-center">
                    <button
                      type="button"
                      onClick={toggleStatusSort}
                      className="group inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground hover:text-foreground transition-colors select-none cursor-pointer"
                      title="Sort by status: Active first, Suspended first, or clear"
                    >
                      <span>Status</span>
                      {sortState.field === "status" ? (
                        sortState.mode === "active-first" ? (
                          <>
                            <ArrowUp className="size-3 text-foreground" />
                            <span className="rounded bg-muted px-1 py-0.5 text-[9px] font-semibold text-foreground lowercase tracking-normal">
                              act
                            </span>
                          </>
                        ) : (
                          <>
                            <ArrowDown className="size-3 text-foreground" />
                            <span className="rounded bg-muted px-1 py-0.5 text-[9px] font-semibold text-foreground lowercase tracking-normal">
                              susp
                            </span>
                          </>
                        )
                      ) : (
                        <ArrowUpDown className="size-3 opacity-40 group-hover:opacity-80 transition-opacity" />
                      )}
                    </button>
                  </div>
                </TableHead>
                <TableHead className="hidden text-center lg:table-cell">
                  <div className="flex justify-center">
                    <button
                      type="button"
                      onClick={toggleSpaceSort}
                      className="group inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground hover:text-foreground transition-colors select-none cursor-pointer"
                      title="Sort by space: High to Low, Low to High, or clear"
                    >
                      <span>Space</span>
                      {sortState.field === "space" ? (
                        sortState.mode === "used-desc" ? (
                          <>
                            <ArrowDown className="size-3 text-foreground" />
                            <span className="rounded bg-muted px-1 py-0.5 text-[9px] font-semibold text-foreground lowercase tracking-normal">
                              high
                            </span>
                          </>
                        ) : (
                          <>
                            <ArrowUp className="size-3 text-foreground" />
                            <span className="rounded bg-muted px-1 py-0.5 text-[9px] font-semibold text-foreground lowercase tracking-normal">
                              low
                            </span>
                          </>
                        )
                      ) : (
                        <ArrowUpDown className="size-3 opacity-40 group-hover:opacity-80 transition-opacity" />
                      )}
                    </button>
                  </div>
                </TableHead>
                <TableHead className="w-[340px] font-mono text-[10px] uppercase tracking-[0.14em] text-right">
                  Actions
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sorted.map((a) => {
                const suspended = a.isEnabled === false
                return (
                <TableRow
                  key={a.id}
                  className={suspended ? "opacity-70" : undefined}
                >
                  <TableCell className="w-10">
                    <Checkbox
                      checked={selected.has(a.id)}
                      onCheckedChange={(v) => toggleOne(a.id, !!v)}
                      aria-label={`Select ${a.email}`}
                      disabled={a.isAdmin}
                    />
                  </TableCell>
                  <TableCell className="w-[260px]">
                    <div className="flex flex-wrap items-center gap-2">
                      <Link
                        href={`/dashboard/mailboxes/${a.id}`}
                        className="font-mono text-[13px] underline-offset-4 hover:underline"
                      >
                        {a.email}
                      </Link>
                      {a.isAdmin ? (
                        <Badge variant="outline" className="font-mono text-[10px]">
                          admin
                        </Badge>
                      ) : null}
                    </div>
                  </TableCell>
                  <TableCell className="w-24 hidden text-center sm:table-cell">
                    <div className="flex justify-center">
                      <Badge
                        variant={suspended ? "destructive" : "outline"}
                        className="font-mono text-[10px]"
                      >
                        {suspended ? "suspended" : "active"}
                      </Badge>
                    </div>
                  </TableCell>
                  <TableCell className="hidden lg:table-cell">
                    <div className="flex justify-center">
                      <QuotaBar quotas={a.quotas} />
                    </div>
                  </TableCell>
                  <TableCell className="w-[340px]">
                    <div className="flex justify-end items-center gap-2">
                      {/* 1. Open Webmail button with text */}
                      <RoundcubeButton
                        href={buildRoundcubeUrl(a.email)}
                        email={a.email}
                      />

                      {/* 2. 'i' Configuration button with text */}
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setConfigAccount(a)}
                        aria-label={`Email configuration for ${a.email}`}
                      >
                        <Info className="size-3.5" data-icon="inline-start" />
                        Configuration
                      </Button>

                      {/* 3. Edit button with pencil icon and text */}
                      <Button
                        variant="outline"
                        size="sm"
                        nativeButton={false}
                        render={
                          <Link
                            href={`/dashboard/mailboxes/${a.id}`}
                            aria-label={`Edit ${a.email}`}
                          />
                        }
                      >
                        <Pencil className="size-3.5" data-icon="inline-start" />
                        Edit
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>
      )}

      <CreateMailboxDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        domains={domains}
        defaultDomainId={domainId === "all" ? domains[0]?.id : domainId}
      />

      <ConfirmDestroy
        open={bulkDeleteOpen}
        onOpenChange={setBulkDeleteOpen}
        title={`Delete ${selected.size} mailboxes?`}
        description="Type DELETE to confirm bulk destroy. Catch-all targets and admin accounts are blocked."
        confirmValue="DELETE"
        confirmLabel='Type "DELETE"'
        pending={pending}
        onConfirm={() => {
          startTransition(async () => {
            const result = await bulkDestroyMailboxesAction([...selected])
            if (
              !toastActionResult(result, {
                success: result.ok
                  ? `Destroyed ${result.data.destroyed}. Failed: ${result.data.failed.length}.`
                  : "",
              })
            ) {
              return
            }
            setSelected(new Set())
            setBulkDeleteOpen(false)
            router.refresh()
          })
        }}
      />

      <Dialog open={bulkResetOpen} onOpenChange={setBulkResetOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Bulk password reset</DialogTitle>
            <DialogDescription>
              Applies one password to {selected.size} selected mailboxes. Copy
              it before closing.
            </DialogDescription>
          </DialogHeader>
          <PasswordField
            value={bulkPassword}
            onChange={setBulkPassword}
            disabled={pending}
          />
          <DialogFooter>
            <Button
              variant="outline"
              disabled={pending}
              onClick={() => setBulkResetOpen(false)}
            >
              Cancel
            </Button>
            <Button
              disabled={pending || bulkPassword.length < 6}
              onClick={() => {
                startTransition(async () => {
                  const result = await bulkResetPasswordsAction(
                    [...selected],
                    bulkPassword
                  )
                  if (
                    !toastActionResult(result, {
                      success: result.ok
                        ? `Reset ${result.data.reset}. Failed: ${result.data.failed.length}.`
                        : "",
                    })
                  ) {
                    return
                  }
                  setBulkResetOpen(false)
                  router.refresh()
                })
              }}
            >
              Reset passwords
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <MailboxConfigDialog
        account={configAccount}
        open={!!configAccount}
        onOpenChange={(open) => {
          if (!open) setConfigAccount(null)
        }}
      />
    </div>
  )
}

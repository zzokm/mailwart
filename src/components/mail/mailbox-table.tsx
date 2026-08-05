"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useMemo, useState, useTransition } from "react"
import { Ban, Plus, Search, Trash2, KeyRound } from "lucide-react"

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
import { generatePassword } from "@/lib/format"
import type { StalwartAccount, StalwartDomain } from "@/lib/stalwart/types"

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

  const allSelected =
    filtered.length > 0 && filtered.every((a) => selected.has(a.id))

  function toggleAll(checked: boolean) {
    if (!checked) {
      setSelected(new Set())
      return
    }
    setSelected(new Set(filtered.map((a) => a.id)))
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
                <TableHead className="font-mono text-[10px] uppercase tracking-[0.14em]">
                  Email
                </TableHead>
                <TableHead className="hidden font-mono text-[10px] uppercase tracking-[0.14em] md:table-cell">
                  Domain
                </TableHead>
                <TableHead className="hidden font-mono text-[10px] uppercase tracking-[0.14em] sm:table-cell">
                  Status
                </TableHead>
                <TableHead className="hidden font-mono text-[10px] uppercase tracking-[0.14em] lg:table-cell">
                  Space
                </TableHead>
                <TableHead className="font-mono text-[10px] uppercase tracking-[0.14em] text-right">
                  Actions
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((a) => {
                const suspended = a.isEnabled === false
                return (
                <TableRow
                  key={a.id}
                  className={suspended ? "opacity-70" : undefined}
                >
                  <TableCell>
                    <Checkbox
                      checked={selected.has(a.id)}
                      onCheckedChange={(v) => toggleOne(a.id, !!v)}
                      aria-label={`Select ${a.email}`}
                      disabled={a.isAdmin}
                    />
                  </TableCell>
                  <TableCell>
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
                  <TableCell className="hidden font-mono text-[12px] text-muted-foreground md:table-cell">
                    {a.domainName ?? "-"}
                  </TableCell>
                  <TableCell className="hidden sm:table-cell">
                    <Badge
                      variant={suspended ? "destructive" : "outline"}
                      className="font-mono text-[10px]"
                    >
                      {suspended ? "suspended" : "active"}
                    </Badge>
                  </TableCell>
                  <TableCell className="hidden lg:table-cell">
                    <QuotaBar quotas={a.quotas} />
                  </TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-1.5">
                      <RoundcubeButton
                        href={buildRoundcubeUrl(a.email)}
                        email={a.email}
                      />
                      <Button
                        size="sm"
                        variant="ghost"
                        nativeButton={false}
                        render={<Link href={`/dashboard/mailboxes/${a.id}`} />}
                      >
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
    </div>
  )
}

"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react"
import { Ban, Bell, Plus, Search, Trash2, KeyRound, Info, Pencil, ArrowUp, ArrowDown, ArrowUpDown, HardDrive } from "lucide-react"

import {
  bulkDestroyMailboxesAction,
  bulkResetPasswordsAction,
  bulkSuspendMailboxesAction,
  refreshMailboxActivityAction,
} from "@/lib/actions/mail"
import { toastActionResult } from "@/lib/action-toast"
import { CreateMailboxDialog } from "@/components/mail/create-mailbox-dialog"
import { BulkStorageDialog } from "@/components/mail/bulk-storage-dialog"
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

export type MailboxSortField =
  | "email"
  | "domain"
  | "space"
  | "capacity"
  | "status"
  | "notifications"
  | "date"
  | "name"

export type MailboxSortDirection = "asc" | "desc"

export const SORT_FIELD_OPTIONS: { id: MailboxSortField; label: string }[] = [
  { id: "email", label: "Email" },
  { id: "domain", label: "Domain" },
  { id: "space", label: "Storage used" },
  { id: "capacity", label: "Storage capacity" },
  { id: "status", label: "Status" },
  { id: "notifications", label: "Unread / Activity" },
  { id: "date", label: "Date added" },
  { id: "name", label: "Name / Description" },
]

export function getDirectionLabel(
  field: MailboxSortField,
  dir: MailboxSortDirection
) {
  switch (field) {
    case "email":
    case "domain":
    case "name":
      return dir === "asc" ? "A → Z" : "Z → A"
    case "status":
      return dir === "asc" ? "Active first" : "Suspended first"
    case "space":
      return dir === "desc" ? "Highest used" : "Lowest used"
    case "capacity":
      return dir === "desc" ? "Largest capacity" : "Smallest capacity"
    case "notifications":
      return dir === "desc" ? "Most unread" : "Least unread"
    case "date":
      return dir === "desc" ? "Newest first" : "Oldest first"
    default:
      return dir === "asc" ? "Ascending" : "Descending"
  }
}

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
  const [bulkStorageOpen, setBulkStorageOpen] = useState(false)
  const [bulkPassword, setBulkPassword] = useState(() => generatePassword())
  const [createOpen, setCreateOpen] = useState(false)
  const [configAccount, setConfigAccount] = useState<StalwartAccount | null>(null)
  const [sortField, setSortField] = useState<MailboxSortField>("date")
  const [sortDirection, setSortDirection] = useState<MailboxSortDirection>("desc")

  const [activityMap, setActivityMap] = useState<
    Map<
      string,
      {
        unreadCount: number
        newCount: number
        usedDiskQuota?: number
        isEnabled?: boolean
      }
    >
  >(() => new Map())

  const isFetchingRef = useRef(false)
  const fetchFreshActivity = useCallback(async () => {
    if (isFetchingRef.current) return
    isFetchingRef.current = true
    try {
      const res = await refreshMailboxActivityAction()
      if (res.ok && Array.isArray(res.data)) {
        const map = new Map(res.data.map((item) => [item.email.toLowerCase(), item]))
        setActivityMap(map)
      }
    } catch {
      // Ignore background network interruptions
    } finally {
      isFetchingRef.current = false
    }
  }, [])

  useEffect(() => {
    // 1. Initial live check deferred on mount
    const timer = setTimeout(() => {
      void fetchFreshActivity()
    }, 0)

    // 2. Refresh on tab switch / window focus
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        void fetchFreshActivity()
      }
    }
    const onFocus = () => {
      void fetchFreshActivity()
    }

    document.addEventListener("visibilitychange", onVisibilityChange)
    window.addEventListener("focus", onFocus)

    // 3. Keep checking continuously while page is open and static (every 10s)
    const interval = setInterval(() => {
      if (document.visibilityState === "visible") {
        void fetchFreshActivity()
      }
    }, 10_000)

    return () => {
      clearTimeout(timer)
      document.removeEventListener("visibilitychange", onVisibilityChange)
      window.removeEventListener("focus", onFocus)
      clearInterval(interval)
    }
  }, [fetchFreshActivity])

  const accountList = useMemo(() => {
    if (activityMap.size === 0) return accounts
    return accounts.map((acc) => {
      const fresh = activityMap.get(acc.email.toLowerCase())
      if (!fresh) return acc
      return {
        ...acc,
        unreadCount: fresh.unreadCount,
        newCount: fresh.newCount,
        usedDiskQuota: fresh.usedDiskQuota ?? acc.usedDiskQuota,
        isEnabled: fresh.isEnabled ?? acc.isEnabled,
      }
    })
  }, [accounts, activityMap])

  const uniqueDomains = useMemo(() => {
    const set = new Set<string>()
    for (const a of accountList) {
      if (a.domainId) set.add(a.domainId)
      else if (a.email.includes("@")) set.add(a.email.split("@")[1].toLowerCase())
    }
    return set
  }, [accountList])

  const domainMap = useMemo(() => {
    const map = new Map<string, StalwartDomain>()
    for (const d of domains) {
      map.set(d.id, d)
      map.set(d.name.toLowerCase(), d)
    }
    return map
  }, [domains])

  const getAccountTimestamp = useCallback(
    (acc: StalwartAccount) => {
      if (acc.createdAt) {
        const t = new Date(acc.createdAt).getTime()
        if (!Number.isNaN(t) && t > 0) return t
      }
      const dom =
        (acc.domainId ? domainMap.get(acc.domainId) : undefined) ??
        (acc.domainName ? domainMap.get(acc.domainName.toLowerCase()) : undefined) ??
        (acc.email.includes("@")
          ? domainMap.get(acc.email.split("@")[1].toLowerCase())
          : undefined)
      if (dom?.createdAt) {
        const t = new Date(dom.createdAt).getTime()
        if (!Number.isNaN(t) && t > 0) return t
      }
      return 0
    },
    [domainMap]
  )

  const isSingleDomain = domainId !== "all" || uniqueDomains.size <= 1

  function toggleEmailSort() {
    if (sortField !== "email" && sortField !== "domain") {
      setSortField("email")
      setSortDirection("asc")
    } else if (sortField === "email" && sortDirection === "asc") {
      setSortDirection("desc")
    } else if (!isSingleDomain && sortField === "email" && sortDirection === "desc") {
      setSortField("domain")
      setSortDirection("asc")
    } else if (!isSingleDomain && sortField === "domain" && sortDirection === "asc") {
      setSortDirection("desc")
    } else {
      setSortField("email")
      setSortDirection("asc")
    }
  }

  function toggleStatusSort() {
    if (sortField !== "status") {
      setSortField("status")
      setSortDirection("asc")
    } else {
      setSortDirection((prev) => (prev === "asc" ? "desc" : "asc"))
    }
  }

  function toggleSpaceSort() {
    if (sortField !== "space" && sortField !== "capacity") {
      setSortField("space")
      setSortDirection("desc")
    } else if (sortField === "space" && sortDirection === "desc") {
      setSortDirection("asc")
    } else if (sortField === "space" && sortDirection === "asc") {
      setSortField("capacity")
      setSortDirection("desc")
    } else if (sortField === "capacity" && sortDirection === "desc") {
      setSortDirection("asc")
    } else {
      setSortField("space")
      setSortDirection("desc")
    }
  }

  function toggleNotificationSort() {
    if (sortField !== "notifications") {
      setSortField("notifications")
      setSortDirection("desc")
    } else {
      setSortDirection((prev) => (prev === "desc" ? "asc" : "desc"))
    }
  }

  function handleSortFieldChange(field: MailboxSortField) {
    setSortField(field)
    if (
      field === "date" ||
      field === "space" ||
      field === "notifications" ||
      field === "capacity"
    ) {
      setSortDirection("desc")
    } else {
      setSortDirection("asc")
    }
  }

  function toggleSortDirection() {
    setSortDirection((prev) => (prev === "asc" ? "desc" : "asc"))
  }

  const filtered = useMemo(() => {
    return accountList.filter((a) => {
      if (domainId !== "all" && a.domainId !== domainId) return false
      if (!query.trim()) return true
      const q = query.toLowerCase()
      return (
        a.email.toLowerCase().includes(q) ||
        (a.description ?? "").toLowerCase().includes(q)
      )
    })
  }, [accountList, domainId, query])

  const sorted = useMemo(() => {
    const list = [...filtered]
    return list.sort((a, b) => {
      if (sortField === "email") {
        const eA = a.email.toLowerCase()
        const eB = b.email.toLowerCase()
        return sortDirection === "asc"
          ? eA.localeCompare(eB)
          : eB.localeCompare(eA)
      }

      if (sortField === "domain") {
        const [uA = "", dA = ""] = a.email.toLowerCase().split("@")
        const [uB = "", dB = ""] = b.email.toLowerCase().split("@")
        const domComp =
          sortDirection === "asc" ? dA.localeCompare(dB) : dB.localeCompare(dA)
        if (domComp !== 0) return domComp
        return uA.localeCompare(uB)
      }

      if (sortField === "status") {
        const actA = a.isEnabled !== false ? 1 : 0
        const actB = b.isEnabled !== false ? 1 : 0
        if (actA !== actB) {
          return sortDirection === "asc" ? actB - actA : actA - actB
        }
        return a.email.toLowerCase().localeCompare(b.email.toLowerCase())
      }

      if (sortField === "space") {
        const uA = quotaSummary(a.quotas).used
        const uB = quotaSummary(b.quotas).used
        if (uA !== uB) {
          return sortDirection === "desc" ? uB - uA : uA - uB
        }
        return a.email.toLowerCase().localeCompare(b.email.toLowerCase())
      }

      if (sortField === "capacity") {
        const qA = quotaSummary(a.quotas)
        const qB = quotaSummary(b.quotas)
        const capA = qA.isUnlimited ? Number.POSITIVE_INFINITY : (qA.bytes ?? 0)
        const capB = qB.isUnlimited ? Number.POSITIVE_INFINITY : (qB.bytes ?? 0)
        if (capA !== capB) {
          return sortDirection === "desc" ? capB - capA : capA - capB
        }
        return a.email.toLowerCase().localeCompare(b.email.toLowerCase())
      }

      if (sortField === "notifications") {
        const aNew = a.newCount ?? 0
        const bNew = b.newCount ?? 0
        const aUnread = a.unreadCount ?? 0
        const bUnread = b.unreadCount ?? 0
        const totalA = aNew + aUnread
        const totalB = bNew + bUnread
        if (totalA !== totalB) {
          return sortDirection === "desc" ? totalB - totalA : totalA - totalB
        }
        return a.email.toLowerCase().localeCompare(b.email.toLowerCase())
      }

      if (sortField === "date") {
        const tA = getAccountTimestamp(a)
        const tB = getAccountTimestamp(b)
        if (tA !== tB) {
          return sortDirection === "desc" ? tB - tA : tA - tB
        }
        return sortDirection === "desc"
          ? b.email.toLowerCase().localeCompare(a.email.toLowerCase())
          : a.email.toLowerCase().localeCompare(b.email.toLowerCase())
      }

      if (sortField === "name") {
        const nA = (a.name || a.description || a.email).toLowerCase()
        const nB = (b.name || b.description || b.email).toLowerCase()
        return sortDirection === "asc"
          ? nA.localeCompare(nB)
          : nB.localeCompare(nA)
      }

      return 0
    })
  }, [filtered, sortField, sortDirection, getAccountTimestamp])

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
        <div className="flex flex-1 flex-wrap gap-2 sm:flex-nowrap sm:items-center">
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
            <SelectTrigger className="w-full sm:w-44">
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

          {/* Sort By Field & Direction Toggle */}
          <div className="flex items-center gap-1.5 w-full sm:w-auto">
            <Select
              items={Object.fromEntries(
                SORT_FIELD_OPTIONS.map((o) => [o.id, o.label])
              )}
              value={sortField}
              onValueChange={(v) => {
                if (v) handleSortFieldChange(v as MailboxSortField)
              }}
            >
              <SelectTrigger className="w-full sm:w-44 font-mono text-[13px]">
                <div className="flex items-center gap-1.5 truncate">
                  <ArrowUpDown className="size-3.5 text-muted-foreground shrink-0" />
                  <span className="text-muted-foreground">Sort:</span>
                  <SelectValue placeholder="Sort by…" />
                </div>
              </SelectTrigger>
              <SelectContent>
                {SORT_FIELD_OPTIONS.map((opt) => (
                  <SelectItem key={opt.id} value={opt.id}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Button
              type="button"
              variant="outline"
              size="icon"
              className="size-9 shrink-0"
              onClick={toggleSortDirection}
              title={`Sort ${sortDirection === "asc" ? "Ascending" : "Descending"} (${getDirectionLabel(sortField, sortDirection)}). Click to reverse.`}
              aria-label={`Toggle sort direction (${sortDirection === "asc" ? "Ascending" : "Descending"})`}
            >
              {sortDirection === "asc" ? (
                <ArrowUp className="size-4 text-foreground" />
              ) : (
                <ArrowDown className="size-4 text-foreground" />
              )}
            </Button>
          </div>
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
            onClick={() => setBulkStorageOpen(true)}
          >
            <HardDrive data-icon="inline-start" />
            Set capacity
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
                        ? "Sort by email: A-Z, Z-A"
                        : "Sort by email: A-Z, Z-A, Domain A-Z, Domain Z-A"
                    }
                  >
                    <span>Email</span>
                    {sortField === "email" ? (
                      sortDirection === "asc" ? (
                        <>
                          <ArrowUp className="size-3 text-foreground" />
                          <span className="rounded bg-muted px-1 py-0.5 text-[9px] font-semibold text-foreground lowercase tracking-normal">
                            a-z
                          </span>
                        </>
                      ) : (
                        <>
                          <ArrowDown className="size-3 text-foreground" />
                          <span className="rounded bg-muted px-1 py-0.5 text-[9px] font-semibold text-foreground lowercase tracking-normal">
                            z-a
                          </span>
                        </>
                      )
                    ) : sortField === "domain" ? (
                      sortDirection === "asc" ? (
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
                      title="Sort by status: Active first, Suspended first"
                    >
                      <span>Status</span>
                      {sortField === "status" ? (
                        sortDirection === "asc" ? (
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
                <TableHead className="w-40 hidden text-center lg:table-cell">
                  <div className="flex justify-center">
                    <button
                      type="button"
                      onClick={toggleSpaceSort}
                      className="group inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground hover:text-foreground transition-colors select-none cursor-pointer"
                      title="Sort by space: High to Low, Low to High"
                    >
                      <span>Space</span>
                      {sortField === "space" ? (
                        sortDirection === "desc" ? (
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
                      ) : sortField === "capacity" ? (
                        sortDirection === "desc" ? (
                          <>
                            <ArrowDown className="size-3 text-foreground" />
                            <span className="rounded bg-muted px-1 py-0.5 text-[9px] font-semibold text-foreground lowercase tracking-normal">
                              max
                            </span>
                          </>
                        ) : (
                          <>
                            <ArrowUp className="size-3 text-foreground" />
                            <span className="rounded bg-muted px-1 py-0.5 text-[9px] font-semibold text-foreground lowercase tracking-normal">
                              min
                            </span>
                          </>
                        )
                      ) : (
                        <ArrowUpDown className="size-3 opacity-40 group-hover:opacity-80 transition-opacity" />
                      )}
                    </button>
                  </div>
                </TableHead>
                <TableHead className="w-48 text-center sm:table-cell">
                  <div className="flex justify-center">
                    <button
                      type="button"
                      onClick={toggleNotificationSort}
                      className="group inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground hover:text-foreground transition-colors select-none cursor-pointer"
                      title="Sort by notifications: Most unread first, Least unread first"
                    >
                      <Bell className="size-3 text-muted-foreground group-hover:text-foreground transition-colors" />
                      <span>Notifications</span>
                      {sortField === "notifications" ? (
                        sortDirection === "desc" ? (
                          <>
                            <ArrowDown className="size-3 text-foreground" />
                            <span className="rounded bg-muted px-1 py-0.5 text-[9px] font-semibold text-foreground lowercase tracking-normal">
                              most
                            </span>
                          </>
                        ) : (
                          <>
                            <ArrowUp className="size-3 text-foreground" />
                            <span className="rounded bg-muted px-1 py-0.5 text-[9px] font-semibold text-foreground lowercase tracking-normal">
                              least
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
                  <TableCell className="w-40 hidden text-center lg:table-cell">
                    <div className="flex justify-center">
                      <QuotaBar quotas={a.quotas} />
                    </div>
                  </TableCell>
                  <TableCell className="w-48 text-center sm:table-cell">
                    <div className="flex items-center justify-center gap-1.5 font-mono text-[12px]">
                      {a.newCount && a.newCount > 0 ? (
                        <div
                          className="inline-flex items-center gap-1.5 text-foreground font-medium select-none"
                          title={`${a.newCount} new notification${a.newCount > 1 ? "s" : ""}${a.unreadCount ? ` (${a.unreadCount} unread)` : ""}`}
                        >
                          <div className="relative inline-flex items-center">
                            <Bell className="size-3.5 text-muted-foreground" />
                            <span className="absolute top-0 right-0 size-1.5 rounded-full bg-red-600" />
                          </div>
                          <span>+{a.newCount} new</span>
                          {a.unreadCount && a.unreadCount > a.newCount ? (
                            <span className="text-[11px] font-normal text-muted-foreground">
                              ({a.unreadCount} unread)
                            </span>
                          ) : null}
                        </div>
                      ) : a.unreadCount && a.unreadCount > 0 ? (
                        <div
                          className="inline-flex items-center gap-1.5 text-muted-foreground select-none"
                          title={`${a.unreadCount} unread email${a.unreadCount > 1 ? "s" : ""} (older/ignored, no new)`}
                        >
                          <Bell className="size-3.5 text-muted-foreground/60" />
                          <span>{a.unreadCount} unread</span>
                        </div>
                      ) : (
                        <span className="text-muted-foreground/40 font-mono text-[11px] select-none" title="All caught up">
                          —
                        </span>
                      )}
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

      <BulkStorageDialog
        open={bulkStorageOpen}
        onOpenChange={setBulkStorageOpen}
        accountIds={[...selected]}
        onSuccess={() => {
          setSelected(new Set())
          router.refresh()
        }}
      />

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

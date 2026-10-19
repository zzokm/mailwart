"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useMemo, useState, useTransition } from "react"
import {
  Check,
  Edit2,
  ExternalLink,
  Plus,
  Search,
  ShieldCheck,
  Trash2,
  X,
} from "lucide-react"

import {
  destroyForwardingRuleAction,
  toggleForwardingRuleAction,
  updateCatchAllAction,
  updateMailExchangerAction,
  upsertForwardingRuleAction,
} from "@/lib/actions/mail"
import { toastActionResult } from "@/lib/action-toast"
import { parseEmailAliases } from "@/lib/stalwart/routing-utils"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { cn } from "@/lib/utils"
import type {
  CatchAllMode,
  ForwardingRule,
  ForwardSourceType,
  MailExchangerMode,
  StalwartAccount,
  StalwartDomain,
} from "@/lib/stalwart/types"

const CATCH_ALL_MODE_LABEL: Record<CatchAllMode, string> = {
  address: "address",
  bounce: "bounce",
  blackhole: "blackhole",
}

const MX_MODE_LABEL: Record<MailExchangerMode, string> = {
  local: "local",
  backup: "backup",
  remote: "remote",
}

const FORWARD_SOURCE_TYPES: Record<
  ForwardSourceType,
  { label: string; placeholder: string; helper: string }
> = {
  exact: {
    label: "Exact Address",
    placeholder: "info",
    helper: "Match a specific mailbox or free local-part",
  },
  wildcard: {
    label: "Wildcard Source",
    placeholder: "support-* or billing.*",
    helper: "Pattern with * or ? wildcards (e.g. support-*, billing.*)",
  },
  regex: {
    label: "Regex Source",
    placeholder: "^invoice-[0-9]+",
    helper: "Regular expression pattern evaluated via Sieve :regex",
  },
  domain: {
    label: "Domain Catch-All (*@)",
    placeholder: "*",
    helper: "Match all incoming mail for the entire domain",
  },
}

function catchAllModeOf(d: StalwartDomain): CatchAllMode {
  if (d.catchAllMode === "blackhole" && !d.catchAllAddress) return "blackhole"
  if (d.catchAllAddress) return "address"
  return "bounce"
}

export function RoutingClient({
  domains,
  accounts,
  forwards: initialForwards,
  adminUiUrl,
  source,
}: {
  domains: StalwartDomain[]
  accounts: StalwartAccount[]
  forwards: ForwardingRule[]
  adminUiUrl: string
  source: "live" | "mock"
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [prevInitialForwards, setPrevInitialForwards] = useState(initialForwards)
  const [forwards, setForwards] = useState<ForwardingRule[]>(initialForwards)

  if (prevInitialForwards !== initialForwards) {
    setPrevInitialForwards(initialForwards)
    setForwards(initialForwards)
  }

  const aliasRows = useMemo(() => {
    const domainsById = new Map(domains.map((d) => [d.id, d]))
    const rows: Array<{
      accountId: string
      mailbox: string
      email: string
      domainName: string
    }> = []
    for (const a of accounts) {
      for (const alias of parseEmailAliases(a.aliases, domainsById)) {
        if (!alias.email) continue
        rows.push({
          accountId: a.id,
          mailbox: a.email,
          email: alias.email,
          domainName: domainsById.get(alias.domainId)?.name ?? "",
        })
      }
    }
    return rows.sort((x, y) => x.email.localeCompare(y.email))
  }, [accounts, domains])

  return (
    <Tabs defaultValue="forwarding" className="w-full">
      <TabsList variant="line" className="mb-6 w-full justify-start gap-8">
        {/* Forwarding is placed FIRST as requested */}
        <TabsTrigger value="forwarding" className="gap-2">
          <span>Forwarding</span>
          <Badge variant="secondary" className="font-mono text-[10px] px-1.5 py-0 h-4">
            {forwards.length}
          </Badge>
        </TabsTrigger>
        {/* Catch-alls is placed SECOND as requested */}
        <TabsTrigger value="catch-alls" className="gap-2">
          <span>Catch-alls &amp; MX posture</span>
          <Badge variant="secondary" className="font-mono text-[10px] px-1.5 py-0 h-4">
            {domains.length}
          </Badge>
        </TabsTrigger>
      </TabsList>

      {/* 1. Forwarding Content (First) */}
      <TabsContent value="forwarding" className="space-y-6">
        <ForwardsSection
          domains={domains}
          accounts={accounts}
          forwards={forwards}
          onUpdateForwards={setForwards}
          source={source}
          adminUiUrl={adminUiUrl}
          startTransition={startTransition}
          onDone={() => router.refresh()}
        />
      </TabsContent>

      {/* 2. Catch-alls & MX Posture Content (Second) */}
      <TabsContent value="catch-alls" className="space-y-10">
        <CatchAllsSection
          domains={domains}
          accounts={accounts}
          pending={pending}
          startTransition={startTransition}
          onDone={() => router.refresh()}
        />

        <section className="space-y-3">
          <div>
            <h2 className="text-sm font-medium">Aliases</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              High-signal alternate addresses across mailboxes. Edit on the
              mailbox detail page.
            </p>
          </div>
          {aliasRows.length === 0 ? (
            <p className="rounded-xl border border-dashed border-border/70 px-4 py-6 font-mono text-[12px] text-muted-foreground">
              No aliases configured.
            </p>
          ) : (
            <div className="overflow-hidden rounded-xl border border-border/80">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="font-mono text-[10px] uppercase tracking-[0.14em]">
                      Alias
                    </TableHead>
                    <TableHead className="font-mono text-[10px] uppercase tracking-[0.14em]">
                      Delivers to
                    </TableHead>
                    <TableHead className="hidden font-mono text-[10px] uppercase tracking-[0.14em] md:table-cell">
                      Domain
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {aliasRows.map((row) => (
                    <TableRow key={`${row.accountId}-${row.email}`}>
                      <TableCell className="font-mono text-[13px]">
                        {row.email}
                      </TableCell>
                      <TableCell>
                        <Link
                          href={`/dashboard/mailboxes/${row.accountId}`}
                          className="font-mono text-[13px] underline-offset-4 hover:underline"
                        >
                          {row.mailbox}
                        </Link>
                      </TableCell>
                      <TableCell className="hidden font-mono text-[12px] text-muted-foreground md:table-cell">
                        {row.domainName}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </section>
      </TabsContent>
    </Tabs>
  )
}

function CatchAllsSection({
  domains,
  accounts,
  pending,
  startTransition,
  onDone,
}: {
  domains: StalwartDomain[]
  accounts: StalwartAccount[]
  pending: boolean
  startTransition: (fn: () => void) => void
  onDone: () => void
}) {
  return (
    <section className="space-y-4">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-sm font-medium">Catch-alls &amp; Archival Journaling</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Configure catch-all routing for unknown addresses. When an address is selected, all incoming domain deliveries automatically duplicate an archival copy into the catch-all mailbox via Sieve.
          </p>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-border/80">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="font-mono text-[10px] uppercase tracking-[0.14em]">
                Domain
              </TableHead>
              <TableHead className="font-mono text-[10px] uppercase tracking-[0.14em]">
                Catch-all &amp; Archival
              </TableHead>
              <TableHead className="font-mono text-[10px] uppercase tracking-[0.14em]">
                MX Posture
              </TableHead>
              <TableHead className="font-mono text-[10px] uppercase tracking-[0.14em] text-right">
                Actions
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {domains.map((d) => {
              const mode = catchAllModeOf(d)
              const mailboxes = accounts.filter((a) => a.domainId === d.id)
              const hasCatchAll = Boolean(d.catchAllAddress)

              return (
                <TableRow key={d.id}>
                  <TableCell className="align-top py-3.5">
                    <div className="flex flex-col gap-1">
                      <div className="flex items-center gap-1.5">
                        <Link
                          href={`/dashboard/domains/${d.id}`}
                          className="font-mono text-[13px] font-medium underline-offset-4 hover:underline"
                        >
                          {d.name}
                        </Link>
                        {d.isEnabled === false ? (
                          <Badge
                            variant="outline"
                            className="font-mono text-[10px] text-destructive border-destructive/30"
                          >
                            suspended
                          </Badge>
                        ) : null}
                      </div>
                      <span className="text-[11px] text-muted-foreground">
                        {mailboxes.length} {mailboxes.length === 1 ? "mailbox" : "mailboxes"}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell className="align-top py-3.5">
                    <div className="space-y-2">
                      <CatchAllInline
                        domain={d}
                        mailboxes={mailboxes}
                        mode={mode}
                        pending={pending}
                        startTransition={startTransition}
                        onDone={onDone}
                      />
                      {hasCatchAll ? (
                        <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-2 text-xs">
                          <div className="flex items-center gap-1.5 text-emerald-500 font-medium">
                            <ShieldCheck className="size-3.5 shrink-0" />
                            <span>Archival Mirroring Active</span>
                          </div>
                          <p className="mt-0.5 text-[11px] text-muted-foreground leading-relaxed">
                            Delivered emails to any mailbox or catch-all on <code className="font-mono text-[10px]">{d.name}</code> duplicate a copy into <span className="font-mono font-medium text-foreground">{d.catchAllAddress}</span>.
                          </p>
                        </div>
                      ) : null}
                    </div>
                  </TableCell>
                  <TableCell className="align-top py-3.5">
                    <MxInline
                      domain={d}
                      pending={pending}
                      startTransition={startTransition}
                      onDone={onDone}
                    />
                  </TableCell>
                  <TableCell className="align-top text-right py-3.5">
                    <Button
                      size="sm"
                      variant="ghost"
                      nativeButton={false}
                      render={<Link href={`/dashboard/domains/${d.id}`} />}
                    >
                      Domain
                    </Button>
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </div>
    </section>
  )
}

function CatchAllInline({
  domain,
  mailboxes,
  mode,
  pending,
  startTransition,
  onDone,
}: {
  domain: StalwartDomain
  mailboxes: StalwartAccount[]
  mode: CatchAllMode
  pending: boolean
  startTransition: (fn: () => void) => void
  onDone: () => void
}) {
  const [localMode, setLocalMode] = useState<CatchAllMode>(mode)
  const [address, setAddress] = useState(domain.catchAllAddress ?? "")

  function commit(nextMode: CatchAllMode, nextAddress: string) {
    startTransition(() => {
      void (async () => {
        const result = await updateCatchAllAction(domain.id, {
          mode: nextMode,
          address: nextMode === "address" ? nextAddress || null : null,
        })
        if (
          !toastActionResult(result, {
            success: `Catch-all updated for ${domain.name}.`,
            note: result.ok ? result.data.note : undefined,
            noteOnly: Boolean(result.ok && result.data.note),
          })
        ) {
          setLocalMode(mode)
          setAddress(domain.catchAllAddress ?? "")
          return
        }
        onDone()
      })()
    })
  }

  return (
    <div className="flex min-w-[13rem] flex-col gap-1.5">
      <Select
        items={CATCH_ALL_MODE_LABEL}
        value={localMode}
        disabled={pending}
        onValueChange={(v) => {
          const next = (v ?? "bounce") as CatchAllMode
          setLocalMode(next)
          if (next !== "address") commit(next, address)
        }}
      >
        <SelectTrigger className="h-8 w-full font-mono text-[12px]">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {Object.entries(CATCH_ALL_MODE_LABEL).map(([value, label]) => (
            <SelectItem key={value} value={value}>
              {label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {localMode === "address" ? (
        <Select
          items={{
            __none__: "Select mailbox…",
            ...Object.fromEntries(mailboxes.map((m) => [m.email, m.email])),
          }}
          value={address || "__none__"}
          disabled={pending}
          onValueChange={(v) => {
            const next = v === "__none__" ? "" : (v ?? "")
            setAddress(next)
            if (next) commit("address", next)
          }}
        >
          <SelectTrigger className="h-8 w-full font-mono text-[12px]">
            <SelectValue placeholder="Mailbox" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__none__">Select mailbox…</SelectItem>
            {mailboxes.map((m) => (
              <SelectItem key={m.id} value={m.email}>
                {m.email}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : (
        <span className="font-mono text-[11px] text-muted-foreground">
          {localMode === "blackhole" ? "discard (mock)" : "reject at SMTP"}
        </span>
      )}
    </div>
  )
}

function MxInline({
  domain,
  pending,
  startTransition,
  onDone,
}: {
  domain: StalwartDomain
  pending: boolean
  startTransition: (fn: () => void) => void
  onDone: () => void
}) {
  const current: MailExchangerMode =
    domain.mailExchanger ?? (domain.allowRelaying ? "backup" : "local")
  const [mode, setMode] = useState<MailExchangerMode>(current)

  return (
    <Select
      items={MX_MODE_LABEL}
      value={mode}
      disabled={pending}
      onValueChange={(v) => {
        const next = (v ?? "local") as MailExchangerMode
        setMode(next)
        startTransition(() => {
          void (async () => {
            const result = await updateMailExchangerAction(domain.id, next)
            if (
              !toastActionResult(result, {
                success: result.ok
                  ? (result.data.note ?? `MX posture → ${next}`)
                  : "",
              })
            ) {
              setMode(current)
              return
            }
            onDone()
          })()
        })
      }}
    >
      <SelectTrigger className="h-8 w-[7.5rem] font-mono text-[12px]">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {Object.entries(MX_MODE_LABEL).map(([value, label]) => (
          <SelectItem key={value} value={value}>
            {label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

function ForwardsSection({
  domains,
  forwards,
  onUpdateForwards,
  source,
  adminUiUrl,
  startTransition,
  onDone,
}: {
  domains: StalwartDomain[]
  accounts: StalwartAccount[]
  forwards: ForwardingRule[]
  onUpdateForwards: React.Dispatch<React.SetStateAction<ForwardingRule[]>>
  source: "live" | "mock"
  adminUiUrl: string
  startTransition: (fn: () => void) => void
  onDone: () => void
}) {
  const [editingId, setEditingId] = useState<string | null>(null)
  const [sourceType, setSourceType] = useState<ForwardSourceType>("exact")
  const [domainId, setDomainId] = useState(domains[0]?.id ?? "")
  const [sourceAddr, setSourceAddr] = useState("")
  const [targets, setTargets] = useState("")
  const [keepLocal, setKeepLocal] = useState(true)
  const [searchQuery, setSearchQuery] = useState("")
  const [saving, setSaving] = useState(false)
  const [actionPendingId, setActionPendingId] = useState<string | null>(null)

  const domain = domains.find((d) => d.id === domainId)

  function startEdit(rule: ForwardingRule) {
    setEditingId(rule.id)
    const sType =
      rule.sourceType ||
      (rule.scope === "domain"
        ? "domain"
        : rule.scope === "wildcard" || rule.source.includes("*")
          ? "wildcard"
          : rule.scope === "regex" || rule.source.startsWith("^")
            ? "regex"
            : "exact")
    setSourceType(sType)
    setDomainId(rule.domainId)

    // Abstract the @domain part for display if present
    const targetDom = domains.find((d) => d.id === rule.domainId)
    const dName = targetDom?.name || rule.domainName
    let displaySource = rule.source
    if (sType === "domain") {
      displaySource = "*"
    } else if (dName) {
      const suffix = `@${dName.toLowerCase()}`
      if (displaySource.toLowerCase().endsWith(suffix)) {
        displaySource = displaySource.slice(0, -suffix.length)
      } else if (sType === "regex") {
        const escapedSuffix = `@${dName.toLowerCase().replace(/\./g, "\\.")}`
        if (displaySource.toLowerCase().endsWith(`${escapedSuffix}$`)) {
          displaySource = `${displaySource.slice(0, -(escapedSuffix.length + 1))}$`
        } else if (displaySource.toLowerCase().endsWith(escapedSuffix)) {
          displaySource = displaySource.slice(0, -escapedSuffix.length)
        }
      }
    }

    setSourceAddr(displaySource)
    setTargets(rule.targets.join(", "))
    setKeepLocal(rule.keepLocalCopy !== false)
  }

  function cancelEdit() {
    setEditingId(null)
    setSourceType("exact")
    setSourceAddr("")
    setTargets("")
    setKeepLocal(true)
  }

  async function saveRule() {
    if (saving) return
    setSaving(true)
    try {
      const rawSource = sourceType === "domain" ? "*" : sourceAddr.trim()

      const result = await upsertForwardingRuleAction({
        id: editingId || undefined,
        scope: sourceType === "exact" ? "user" : sourceType,
        sourceType,
        domainId,
        source: rawSource,
        targets: targets.split(/[\s,;]+/).filter(Boolean),
        keepLocalCopy: keepLocal,
        enabled: true,
      })

      if (
        !toastActionResult(result, {
          success: result.ok
            ? editingId
              ? "Forward updated successfully."
              : `Forward rule saved (${result.data.backend}).`
            : "",
        })
      ) {
        return
      }

      // Optimistically update table immediately without waiting
      const saved = result.data
      onUpdateForwards((prev) => {
        const idx = prev.findIndex((f) => f.id === saved.id)
        if (idx !== -1) {
          const next = [...prev]
          next[idx] = saved
          return next
        }
        return [saved, ...prev]
      })

      cancelEdit()
      startTransition(() => {
        onDone()
      })
    } finally {
      setSaving(false)
    }
  }

  async function toggleStatus(rule: ForwardingRule) {
    const nextState = !rule.enabled
    setActionPendingId(rule.id)
    onUpdateForwards((prev) =>
      prev.map((f) => (f.id === rule.id ? { ...f, enabled: nextState } : f))
    )

    try {
      const result = await toggleForwardingRuleAction(rule.id, nextState)
      if (
        !toastActionResult(result, {
          success: `Forward rule ${nextState ? "enabled" : "paused"}.`,
        })
      ) {
        onUpdateForwards((prev) =>
          prev.map((f) => (f.id === rule.id ? { ...f, enabled: rule.enabled } : f))
        )
      } else {
        startTransition(() => {
          onDone()
        })
      }
    } finally {
      setActionPendingId(null)
    }
  }

  async function deleteRule(ruleId: string) {
    setActionPendingId(ruleId)
    let removed: ForwardingRule | undefined
    onUpdateForwards((prev) => {
      removed = prev.find((f) => f.id === ruleId)
      return prev.filter((f) => f.id !== ruleId)
    })

    try {
      const result = await destroyForwardingRuleAction(ruleId)
      if (
        !toastActionResult(result, {
          success: "Forwarding rule removed.",
        })
      ) {
        if (removed) {
          onUpdateForwards((prev) => [removed!, ...prev])
        }
      } else {
        if (editingId === ruleId) cancelEdit()
        startTransition(() => {
          onDone()
        })
      }
    } finally {
      setActionPendingId(null)
    }
  }

  const filteredForwards = useMemo(() => {
    if (!searchQuery.trim()) return forwards
    const q = searchQuery.toLowerCase().trim()
    return forwards.filter(
      (f) =>
        f.source.toLowerCase().includes(q) ||
        f.domainName.toLowerCase().includes(q) ||
        f.targets.some((t) => t.toLowerCase().includes(q))
    )
  }, [forwards, searchQuery])

  return (
    <section className="space-y-6">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-sm font-medium">Forwarding Rules</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Redirect inbound emails to external targets (e.g. Gmail, Outlook) or internal mailboxes using Sieve filters. Supports exact addresses, wildcard patterns, and regex.
          </p>
        </div>
      </div>

      {/* Form for Creating / Editing Forwards */}
      <div className="rounded-xl border border-border/80 bg-card/40 p-4 shadow-xs">
        <div className="mb-3.5 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="font-mono text-[11px] font-semibold uppercase tracking-wider text-primary">
              {editingId ? "Edit Forward Rule" : "Create Forward Rule"}
            </span>
            {editingId ? (
              <Badge variant="outline" className="font-mono text-[10px]">
                ID: {editingId}
              </Badge>
            ) : null}
          </div>
          {editingId ? (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-7 text-xs text-muted-foreground hover:text-foreground"
              onClick={cancelEdit}
            >
              <X className="size-3.5 mr-1" />
              Cancel Edit
            </Button>
          ) : null}
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 items-start">
          {/* 1. Source Type Selector (Requirement 2: exact, wildcard, regex, domain) */}
          <div className="flex flex-col gap-1.5">
            <div className="flex h-5 items-center">
              <Label className="text-[11px] text-muted-foreground">Source Type</Label>
            </div>
            <Select
              items={Object.fromEntries(
                Object.entries(FORWARD_SOURCE_TYPES).map(([k, v]) => [k, v.label])
              )}
              value={sourceType}
              onValueChange={(v) => {
                const nextType = (v as ForwardSourceType) ?? "exact"
                setSourceType(nextType)
                if (nextType === "domain") {
                  setSourceAddr("*")
                } else if (sourceAddr === "*") {
                  setSourceAddr("")
                }
              }}
              disabled={saving}
            >
              <SelectTrigger className="h-8 w-full font-mono text-[13px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(FORWARD_SOURCE_TYPES).map(([value, info]) => (
                  <SelectItem key={value} value={value}>
                    <div className="flex flex-col py-0.5">
                      <span>{info.label}</span>
                      <span className="text-[10px] text-muted-foreground">
                        {info.helper}
                      </span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* 2. Target Domain */}
          <div className="flex flex-col gap-1.5">
            <div className="flex h-5 items-center">
              <Label className="text-[11px] text-muted-foreground">Domain</Label>
            </div>
            <Select
              items={Object.fromEntries(domains.map((d) => [d.id, d.name]))}
              value={domainId}
              onValueChange={(v) => {
                const nextId = v ?? ""
                setDomainId(nextId)
              }}
              disabled={saving}
            >
              <SelectTrigger className="h-8 w-full font-mono text-[13px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {domains.map((d) => (
                  <SelectItem key={d.id} value={d.id}>
                    {d.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* 3. Source Pattern / Address */}
          <div className="flex flex-col gap-1.5">
            <div className="flex h-5 items-center">
              <Label className="text-[11px] text-muted-foreground">
                Source Pattern
              </Label>
            </div>
            <div className="relative flex items-center">
              <Input
                value={sourceType === "domain" ? "*" : sourceAddr}
                disabled={saving || sourceType === "domain"}
                onChange={(e) => setSourceAddr(e.target.value)}
                onBlur={() => {
                  if (domain && sourceAddr && sourceType !== "domain") {
                    const domName = domain.name.toLowerCase()
                    const suffix = `@${domName}`
                    if (sourceAddr.toLowerCase().endsWith(suffix)) {
                      setSourceAddr(sourceAddr.slice(0, -suffix.length))
                    }
                  }
                }}
                className={cn(
                  "h-8 font-mono text-[13px]",
                  domain ? "pr-28 sm:pr-36" : ""
                )}
                placeholder={FORWARD_SOURCE_TYPES[sourceType].placeholder}
              />
              {domain ? (
                <div
                  className="pointer-events-none absolute right-2 flex max-w-[130px] items-center truncate rounded-md border border-border/60 bg-muted/70 px-2 py-0.5 font-mono text-[11px] text-muted-foreground select-none"
                  title={`@${domain.name}`}
                >
                  @{domain.name}
                </div>
              ) : null}
            </div>
            <span className="text-[10px] text-muted-foreground leading-tight">
              {sourceType === "domain"
                ? `Applies to all incoming mail on @${domain?.name ?? "domain"}`
                : `Pattern abstracts @${domain?.name ?? "domain"}. Including the full address also works.`}
            </span>
          </div>

          {/* 4. Target Addresses (Supports external like Gmail) */}
          <div className="flex flex-col gap-1.5">
            <div className="flex h-5 items-center">
              <Label className="text-[11px] text-muted-foreground truncate" title="Targets (e.g. personal Gmail or internal)">
                Targets (e.g. personal Gmail or internal)
              </Label>
            </div>
            <Input
              value={targets}
              disabled={saving}
              onChange={(e) => setTargets(e.target.value)}
              className="h-8 font-mono text-[13px]"
              placeholder="myemail@gmail.com, office@domain.com"
            />
          </div>

          {/* Form Actions */}
          <div className="flex flex-wrap items-center justify-between gap-3 sm:col-span-2 lg:col-span-4 pt-1">
            <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer select-none">
              <input
                type="checkbox"
                checked={keepLocal}
                disabled={saving}
                onChange={(e) => setKeepLocal(e.target.checked)}
                className="size-3.5 rounded accent-primary"
              />
              <span>Keep local copy (retain copy in recipient mailbox or catch-all archive)</span>
            </label>

            <div className="flex items-center gap-2">
              {editingId ? (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={saving}
                  onClick={cancelEdit}
                >
                  Cancel
                </Button>
              ) : null}

              <Button
                type="button"
                size="sm"
                disabled={
                  saving ||
                  !targets.trim() ||
                  (sourceType !== "domain" && !sourceAddr.trim())
                }
                onClick={saveRule}
              >
                {saving ? (
                  <>
                    <span className="size-3.5 mr-1 inline-block animate-spin rounded-full border-2 border-current border-t-transparent" />
                    {editingId ? "Updating..." : "Saving..."}
                  </>
                ) : editingId ? (
                  <>
                    <Check data-icon="inline-start" />
                    Update rule
                  </>
                ) : (
                  <>
                    <Plus data-icon="inline-start" />
                    Add forward
                  </>
                )}
              </Button>

              {source === "live" && adminUiUrl ? (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  nativeButton={false}
                  render={<a href={adminUiUrl} target="_blank" rel="noreferrer" />}
                >
                  <ExternalLink data-icon="inline-start" />
                  Stalwart Admin
                </Button>
              ) : null}
            </div>
          </div>
        </div>
      </div>

      {/* Forwards Table */}
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Configured Rules
            </h3>
            <Badge variant="secondary" className="font-mono text-[10px]">
              {filteredForwards.length}
            </Badge>
          </div>

          {forwards.length > 3 ? (
            <div className="relative w-64">
              <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Filter rules..."
                className="h-7 pl-8 font-mono text-[11px]"
              />
            </div>
          ) : null}
        </div>

        {filteredForwards.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border/70 px-4 py-8 text-center font-mono text-[12px] text-muted-foreground">
            {forwards.length === 0
              ? "No forwarding rules created yet. Configure an exact address, wildcard pattern, or external Gmail forward above."
              : "No rules matching search criteria."}
          </p>
        ) : (
          <div className="overflow-hidden rounded-xl border border-border/80">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="font-mono text-[10px] uppercase tracking-[0.14em]">
                    Source Pattern
                  </TableHead>
                  <TableHead className="font-mono text-[10px] uppercase tracking-[0.14em]">
                    Targets
                  </TableHead>
                  <TableHead className="font-mono text-[10px] uppercase tracking-[0.14em]">
                    Backend
                  </TableHead>
                  <TableHead className="font-mono text-[10px] uppercase tracking-[0.14em]">
                    Status
                  </TableHead>
                  <TableHead className="font-mono text-[10px] uppercase tracking-[0.14em] text-right">
                    Actions
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredForwards.map((f) => {
                  const sType =
                    f.sourceType ||
                    (f.scope === "domain"
                      ? "domain"
                      : f.scope === "wildcard" || f.source.includes("*")
                        ? "wildcard"
                        : f.scope === "regex" || f.source.startsWith("^")
                          ? "regex"
                          : "exact")

                  const isBeingEdited = editingId === f.id

                  return (
                    <TableRow
                      key={f.id}
                      className={cn(
                        "transition-colors",
                        isBeingEdited && "bg-primary/5"
                      )}
                    >
                      {/* Source with pattern type badge */}
                      <TableCell className="align-top py-3 font-mono text-[13px]">
                        <div className="flex flex-col gap-1">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="font-semibold text-foreground">
                              {f.source}
                            </span>
                            <Badge
                              variant="outline"
                              className={cn(
                                "font-mono text-[9px] uppercase px-1.5 py-0",
                                sType === "exact" && "border-blue-500/30 text-blue-500 bg-blue-500/5",
                                sType === "wildcard" && "border-amber-500/30 text-amber-500 bg-amber-500/5",
                                sType === "regex" && "border-purple-500/30 text-purple-500 bg-purple-500/5",
                                sType === "domain" && "border-sky-500/30 text-sky-500 bg-sky-500/5"
                              )}
                            >
                              {sType}
                            </Badge>
                          </div>
                          <span className="text-[11px] text-muted-foreground font-sans">
                            Domain: {f.domainName}
                          </span>
                        </div>
                      </TableCell>

                      {/* Targets with external badges */}
                      <TableCell className="align-top py-3 font-mono text-[12px]">
                        <div className="flex flex-col gap-1.5">
                          <div className="flex flex-wrap items-center gap-1.5">
                            {f.targets.map((target) => {
                              const isExternal =
                                target.endsWith("@gmail.com") ||
                                target.endsWith("@googlemail.com") ||
                                target.endsWith("@outlook.com") ||
                                target.endsWith("@yahoo.com") ||
                                !target.toLowerCase().endsWith(`@${f.domainName.toLowerCase()}`)

                              return (
                                <span
                                  key={target}
                                  className={cn(
                                    "inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px]",
                                    isExternal
                                      ? "bg-primary/10 text-primary border border-primary/20 font-medium"
                                      : "bg-muted text-muted-foreground"
                                  )}
                                >
                                  {isExternal ? (
                                    <ExternalLink className="size-2.5 shrink-0 opacity-70" />
                                  ) : null}
                                  {target}
                                </span>
                              )
                            })}
                          </div>
                          <span className="text-[10px] text-muted-foreground font-sans">
                            {f.keepLocalCopy !== false
                              ? "✓ Keeps copy in local mailbox"
                              : "✕ Redirect only (no local copy)"}
                          </span>
                        </div>
                      </TableCell>

                      {/* Backend */}
                      <TableCell className="align-top py-3">
                        <Badge
                          variant="outline"
                          className={cn(
                            "font-mono text-[10px]",
                            f.backend === "sieve"
                              ? "border-emerald-500/30 text-emerald-500 bg-emerald-500/5"
                              : f.backend === "sieve-pending"
                                ? "border-amber-500/30 text-amber-500 bg-amber-500/5"
                                : "text-muted-foreground"
                          )}
                        >
                          {f.backend}
                        </Badge>
                      </TableCell>

                      {/* Status Toggle */}
                      <TableCell className="align-top py-3">
                        <button
                          type="button"
                          disabled={actionPendingId === f.id}
                          onClick={() => toggleStatus(f)}
                          className={cn(
                            "inline-flex items-center gap-1 rounded-md px-2 py-0.5 font-mono text-[10px] transition-colors cursor-pointer border",
                            f.enabled
                              ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500/20"
                              : "border-border text-muted-foreground bg-muted/30 hover:bg-muted"
                          )}
                        >
                          <span className={cn("size-1.5 rounded-full", f.enabled ? "bg-emerald-500" : "bg-muted-foreground")} />
                          {f.enabled ? "active" : "paused"}
                        </button>
                      </TableCell>

                      {/* Actions: Edit & Delete */}
                      <TableCell className="align-top py-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            className="h-8 w-8 p-0"
                            title="Edit forward rule"
                            disabled={actionPendingId === f.id}
                            onClick={() => startEdit(f)}
                          >
                            <Edit2 className="size-3.5" />
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            className="h-8 w-8 p-0 text-destructive hover:text-destructive"
                            title="Delete forward rule"
                            disabled={actionPendingId === f.id}
                            onClick={() => deleteRule(f.id)}
                          >
                            <Trash2 className="size-3.5" />
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
      </div>
    </section>
  )
}

"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useMemo, useState, useTransition } from "react"
import { ExternalLink, Plus, Trash2 } from "lucide-react"

import {
  destroyForwardingRuleAction,
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
import { cn } from "@/lib/utils"
import type {
  CatchAllMode,
  ForwardingRule,
  MailExchangerMode,
  StalwartAccount,
  StalwartDomain,
} from "@/lib/stalwart/types"

function catchAllModeOf(d: StalwartDomain): CatchAllMode {
  if (d.catchAllMode === "blackhole" && !d.catchAllAddress) return "blackhole"
  if (d.catchAllAddress) return "address"
  return "bounce"
}

export function RoutingClient({
  domains,
  accounts,
  forwards,
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
    <div className="space-y-10">
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

      <ForwardsSection
        domains={domains}
        accounts={accounts}
        forwards={forwards}
        source={source}
        adminUiUrl={adminUiUrl}
        pending={pending}
        startTransition={startTransition}
        onDone={() => router.refresh()}
      />
    </div>
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
    <section className="space-y-3">
      <div>
        <h2 className="text-sm font-medium">Catch-alls &amp; MX posture</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Unknown recipients: deliver to a mailbox, bounce, or blackhole
          (mock). Mail exchanger maps to Stalwart{" "}
          <code className="font-mono text-[11px]">allowRelaying</code>.
        </p>
      </div>
      <div className="overflow-hidden rounded-xl border border-border/80">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="font-mono text-[10px] uppercase tracking-[0.14em]">
                Domain
              </TableHead>
              <TableHead className="font-mono text-[10px] uppercase tracking-[0.14em]">
                Catch-all
              </TableHead>
              <TableHead className="font-mono text-[10px] uppercase tracking-[0.14em]">
                MX
              </TableHead>
              <TableHead className="font-mono text-[10px] uppercase tracking-[0.14em] text-right">
                Edit
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {domains.map((d) => {
              const mode = catchAllModeOf(d)
              const mailboxes = accounts.filter((a) => a.domainId === d.id)
              return (
                <TableRow key={d.id}>
                  <TableCell>
                    <Link
                      href={`/dashboard/domains/${d.id}`}
                      className="font-mono text-[13px] underline-offset-4 hover:underline"
                    >
                      {d.name}
                    </Link>
                    {d.isEnabled === false ? (
                      <Badge
                        variant="outline"
                        className="ml-2 font-mono text-[10px] text-destructive"
                      >
                        suspended
                      </Badge>
                    ) : null}
                  </TableCell>
                  <TableCell>
                    <CatchAllInline
                      domain={d}
                      mailboxes={mailboxes}
                      mode={mode}
                      pending={pending}
                      startTransition={startTransition}
                      onDone={onDone}
                    />
                  </TableCell>
                  <TableCell>
                    <MxInline
                      domain={d}
                      pending={pending}
                      startTransition={startTransition}
                      onDone={onDone}
                    />
                  </TableCell>
                  <TableCell className="text-right">
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
    <div className="flex min-w-[12rem] flex-col gap-1.5">
      <Select
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
          <SelectItem value="address">address</SelectItem>
          <SelectItem value="bounce">bounce</SelectItem>
          <SelectItem value="blackhole">blackhole</SelectItem>
        </SelectContent>
      </Select>
      {localMode === "address" ? (
        <Select
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
        <SelectItem value="local">local</SelectItem>
        <SelectItem value="backup">backup</SelectItem>
        <SelectItem value="remote">remote</SelectItem>
      </SelectContent>
    </Select>
  )
}

function ForwardsSection({
  domains,
  forwards,
  source,
  adminUiUrl,
  pending,
  startTransition,
  onDone,
}: {
  domains: StalwartDomain[]
  accounts: StalwartAccount[]
  forwards: ForwardingRule[]
  source: "live" | "mock"
  adminUiUrl: string
  pending: boolean
  startTransition: (fn: () => void) => void
  onDone: () => void
}) {
  const [scope, setScope] = useState<"user" | "domain">("user")
  const [domainId, setDomainId] = useState(domains[0]?.id ?? "")
  const [sourceAddr, setSourceAddr] = useState("")
  const [targets, setTargets] = useState("")
  const [keepLocal, setKeepLocal] = useState(false)

  const domain = domains.find((d) => d.id === domainId)

  function create() {
    startTransition(() => {
      void (async () => {
        const result = await upsertForwardingRuleAction({
          scope,
          domainId,
          source: sourceAddr,
          targets: targets.split(/[\s,;]+/).filter(Boolean),
          keepLocalCopy: keepLocal,
          enabled: true,
        })
        if (
          !toastActionResult(result, {
            success: result.ok
              ? `Forward saved (${result.data.backend}).`
              : "",
          })
        ) {
          return
        }
        setSourceAddr("")
        setTargets("")
        onDone()
      })()
    })
  }

  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-sm font-medium">Forwarding</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          {source === "mock"
            ? "Mock store supports full forward CRUD. Live maps domain→catch-all and free local-part→alias; external redirects need Sieve."
            : "Live: domain forwards become catch-alls; free local-parts become aliases on the target mailbox. External redirects → Filters / ManageSieve."}
        </p>
      </div>

      <div className="grid gap-3 rounded-xl border border-border/80 p-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="grid gap-1.5">
          <Label className="text-[11px] text-muted-foreground">Scope</Label>
          <Select
            value={scope}
            onValueChange={(v) => setScope((v as "user" | "domain") ?? "user")}
            disabled={pending}
          >
            <SelectTrigger className="font-mono text-[13px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="user">user</SelectItem>
              <SelectItem value="domain">domain (*@)</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-1.5">
          <Label className="text-[11px] text-muted-foreground">Domain</Label>
          <Select
            value={domainId}
            onValueChange={(v) => setDomainId(v ?? "")}
            disabled={pending}
          >
            <SelectTrigger className="font-mono text-[13px]">
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
        <div className="grid gap-1.5">
          <Label className="text-[11px] text-muted-foreground">
            Source {scope === "domain" ? "(auto *@domain)" : ""}
          </Label>
          <Input
            value={scope === "domain" ? `*@${domain?.name ?? ""}` : sourceAddr}
            disabled={pending || scope === "domain"}
            onChange={(e) => setSourceAddr(e.target.value)}
            className="font-mono text-[13px]"
            placeholder="info or info@example.com"
          />
        </div>
        <div className="grid gap-1.5">
          <Label className="text-[11px] text-muted-foreground">
            Targets (comma-separated)
          </Label>
          <Input
            value={targets}
            disabled={pending}
            onChange={(e) => setTargets(e.target.value)}
            className="font-mono text-[13px]"
            placeholder="user@example.com"
          />
        </div>
        <div className="flex flex-wrap items-end gap-2 sm:col-span-2 lg:col-span-4">
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            <input
              type="checkbox"
              checked={keepLocal}
              disabled={pending || scope === "domain"}
              onChange={(e) => setKeepLocal(e.target.checked)}
              className="size-3.5 accent-foreground"
            />
            Keep local copy
          </label>
          <Button type="button" size="sm" disabled={pending} onClick={create}>
            <Plus data-icon="inline-start" />
            Add forward
          </Button>
          {source === "live" ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              nativeButton={false}
              render={
                <a href={adminUiUrl} target="_blank" rel="noreferrer" />
              }
            >
              <ExternalLink data-icon="inline-start" />
              Stalwart Admin
            </Button>
          ) : null}
        </div>
      </div>

      {forwards.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border/70 px-4 py-6 font-mono text-[12px] text-muted-foreground">
          No forwarding rules.
        </p>
      ) : (
        <div className="overflow-hidden rounded-xl border border-border/80">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="font-mono text-[10px] uppercase tracking-[0.14em]">
                  Source
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
                <TableHead className="w-12" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {forwards.map((f) => (
                <TableRow key={f.id}>
                  <TableCell className="font-mono text-[13px]">
                    {f.source}
                  </TableCell>
                  <TableCell className="font-mono text-[12px] text-muted-foreground">
                    {f.targets.join(", ")}
                    {f.keepLocalCopy ? (
                      <span className="ml-1 text-[10px]">(+local)</span>
                    ) : null}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="font-mono text-[10px]">
                      {f.backend}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant="outline"
                      className={cn(
                        "font-mono text-[10px]",
                        f.enabled
                          ? "border-success/40 text-success"
                          : "text-muted-foreground"
                      )}
                    >
                      {f.enabled ? "on" : "off"}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      disabled={pending}
                      onClick={() => {
                        startTransition(() => {
                          void (async () => {
                            const result = await destroyForwardingRuleAction(
                              f.id
                            )
                            if (
                              !toastActionResult(result, {
                                success: "Forward removed.",
                              })
                            ) {
                              return
                            }
                            onDone()
                          })()
                        })
                      }}
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </section>
  )
}

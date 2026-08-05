"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useMemo, useState, useTransition } from "react"
import { ExternalLink, Plus, Trash2 } from "lucide-react"

import {
  destroyAutoresponderAction,
  destroyFilterRuleAction,
  updateSpamSettingsAction,
  upsertAutoresponderAction,
  upsertFilterRuleAction,
} from "@/lib/actions/mail"
import { toastActionResult } from "@/lib/action-toast"
import {
  buildFilterSieve,
  buildVacationSieve,
  parseAddressListText,
  summarizeFilter,
} from "@/lib/stalwart/filters-utils"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
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
  Autoresponder,
  FilterActionType,
  FilterConditionField,
  FilterConditionOp,
  FilterRule,
  FilterScope,
  SpamSettings,
  StalwartAccount,
  StalwartDomain,
} from "@/lib/stalwart/types"

const textareaClass =
  "flex min-h-[88px] w-full rounded-lg border border-input bg-transparent px-2.5 py-2 text-sm outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-input/30"

export function FiltersClient({
  accounts,
  autoresponders,
  filterRules,
  spam,
  sieveAvailable,
  sieveNote,
  adminUiUrl,
  source,
}: {
  accounts: StalwartAccount[]
  domains: StalwartDomain[]
  autoresponders: Autoresponder[]
  filterRules: FilterRule[]
  spam: SpamSettings
  sieveAvailable: boolean
  sieveNote: string
  adminUiUrl: string
  source: "live" | "mock"
}) {
  const enabledAccounts = useMemo(
    () =>
      [...accounts]
        .filter((a) => a.isEnabled !== false)
        .sort((a, b) => a.email.localeCompare(b.email)),
    [accounts]
  )

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3 rounded-xl border border-border/80 px-4 py-3">
        <div className="min-w-0 space-y-1">
          <p className="text-xs text-muted-foreground">{sieveNote}</p>
          <div className="flex flex-wrap gap-2">
            <Badge variant="outline" className="font-mono text-[10px]">
              sieve {sieveAvailable ? "probe-ok" : "manage-sieve"}
            </Badge>
            <Badge variant="outline" className="font-mono text-[10px]">
              spam {spam.backend}
            </Badge>
            <Badge variant="outline" className="font-mono text-[10px]">
              {source}
            </Badge>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            size="sm"
            nativeButton={false}
            render={
              <a href={adminUiUrl} target="_blank" rel="noreferrer" />
            }
          >
            Stalwart Admin
            <ExternalLink data-icon="inline-end" className="size-3.5" />
          </Button>
        </div>
      </div>

      <Tabs defaultValue="autoresponders">
        <TabsList variant="line" className="w-full justify-start sm:w-auto">
          <TabsTrigger value="autoresponders">Autoresponders</TabsTrigger>
          <TabsTrigger value="filters">Filters</TabsTrigger>
          <TabsTrigger value="spam">Spam</TabsTrigger>
        </TabsList>

        <TabsContent value="autoresponders" className="mt-5 space-y-6">
          <AutorespondersSection
            accounts={enabledAccounts}
            autoresponders={autoresponders}
          />
        </TabsContent>

        <TabsContent value="filters" className="mt-5 space-y-6">
          <FiltersSection
            accounts={enabledAccounts}
            filterRules={filterRules}
          />
        </TabsContent>

        <TabsContent value="spam" className="mt-5 space-y-6">
          <SpamSection spam={spam} adminUiUrl={adminUiUrl} />
        </TabsContent>
      </Tabs>
    </div>
  )
}

function AutorespondersSection({
  accounts,
  autoresponders,
}: {
  accounts: StalwartAccount[]
  autoresponders: Autoresponder[]
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? "")
  const [subject, setSubject] = useState("Out of office")
  const [body, setBody] = useState(
    "Thanks for your message. I am away and will reply when I return."
  )
  const [startAt, setStartAt] = useState("")
  const [endAt, setEndAt] = useState("")
  const [daysBetween, setDaysBetween] = useState("7")
  const [enabled, setEnabled] = useState(true)
  const [previewId, setPreviewId] = useState<string | null>(null)

  const preview = autoresponders.find((a) => a.id === previewId)

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-sm font-medium">Vacation / out-of-office</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Per-mailbox scheduled replies. Mock mode stores rules in-memory; live
          mode deep-links to ManageSieve when JMAP cannot sync vacation.
        </p>
      </div>

      {autoresponders.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border/70 px-4 py-6 font-mono text-[12px] text-muted-foreground">
          No autoresponders configured.
        </p>
      ) : (
        <div className="overflow-hidden rounded-xl border border-border/80">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="font-mono text-[10px] uppercase tracking-[0.14em]">
                  Mailbox
                </TableHead>
                <TableHead className="font-mono text-[10px] uppercase tracking-[0.14em]">
                  Schedule
                </TableHead>
                <TableHead className="font-mono text-[10px] uppercase tracking-[0.14em]">
                  Subject
                </TableHead>
                <TableHead className="font-mono text-[10px] uppercase tracking-[0.14em]">
                  Status
                </TableHead>
                <TableHead className="w-24" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {autoresponders.map((ar) => (
                <TableRow key={ar.id}>
                  <TableCell className="font-mono text-[13px]">
                    <button
                      type="button"
                      className="underline-offset-2 hover:underline"
                      onClick={() =>
                        setPreviewId((id) => (id === ar.id ? null : ar.id))
                      }
                    >
                      {ar.email}
                    </button>
                  </TableCell>
                  <TableCell className="font-mono text-[12px] text-muted-foreground">
                    {ar.startAt || ar.endAt
                      ? `${ar.startAt?.slice(0, 10) ?? "…"} → ${ar.endAt?.slice(0, 10) ?? "…"}`
                      : "always"}
                  </TableCell>
                  <TableCell className="max-w-[14rem] truncate text-[13px]">
                    {ar.subject}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={ar.enabled ? "secondary" : "outline"}
                      className="font-mono text-[10px]"
                    >
                      {ar.enabled ? "on" : "off"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        disabled={pending}
                        aria-label={`Open ${ar.email} in Roundcube`}
                        nativeButton={false}
                        render={
                          <Link
                            href={`/api/webmail/sso?email=${encodeURIComponent(ar.email)}`}
                          />
                        }
                      >
                        <ExternalLink className="size-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        disabled={pending}
                        aria-label={`Delete autoresponder for ${ar.email}`}
                        onClick={() => {
                          startTransition(async () => {
                            const result = await destroyAutoresponderAction(
                              ar.id
                            )
                            if (
                              !toastActionResult(result, {
                                success: "Autoresponder removed.",
                              })
                            ) {
                              return
                            }
                            router.refresh()
                          })
                        }}
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {preview ? (
        <pre className="overflow-x-auto rounded-xl border border-border/70 bg-muted/30 p-4 font-mono text-[11px] leading-relaxed text-muted-foreground">
          {buildVacationSieve(preview)}
        </pre>
      ) : null}

      <section className="space-y-4 rounded-xl border border-border/80 p-4 sm:p-5">
        <div className="flex items-center gap-2">
          <Plus className="size-4 text-muted-foreground" />
          <h3 className="text-sm font-medium">Add or replace vacation</h3>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2 sm:col-span-2">
            <Label>Mailbox</Label>
            <Select
              value={accountId}
              onValueChange={(v) => setAccountId(v ?? "")}
              disabled={pending || accounts.length === 0}
            >
              <SelectTrigger className="font-mono text-[13px]">
                <SelectValue placeholder="Select mailbox" />
              </SelectTrigger>
              <SelectContent>
                {accounts.map((a) => (
                  <SelectItem key={a.id} value={a.id} className="font-mono">
                    {a.email}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="ar-subject">Subject</Label>
            <Input
              id="ar-subject"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              disabled={pending}
            />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="ar-body">Body</Label>
            <textarea
              id="ar-body"
              className={textareaClass}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              disabled={pending}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="ar-start">Starts</Label>
            <Input
              id="ar-start"
              type="date"
              value={startAt}
              onChange={(e) => setStartAt(e.target.value)}
              disabled={pending}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="ar-end">Ends</Label>
            <Input
              id="ar-end"
              type="date"
              value={endAt}
              onChange={(e) => setEndAt(e.target.value)}
              disabled={pending}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="ar-days">Days between replies</Label>
            <Input
              id="ar-days"
              type="number"
              min={0}
              max={365}
              value={daysBetween}
              onChange={(e) => setDaysBetween(e.target.value)}
              disabled={pending}
            />
          </div>
          <div className="flex items-end gap-2 pb-1">
            <Checkbox
              id="ar-enabled"
              checked={enabled}
              onCheckedChange={(v) => setEnabled(v === true)}
              disabled={pending}
            />
            <Label htmlFor="ar-enabled" className="font-normal">
              Enabled
            </Label>
          </div>
        </div>
        <Button
          type="button"
          size="sm"
          disabled={pending || !accountId || !subject.trim() || !body.trim()}
          onClick={() => {
            startTransition(async () => {
              const result = await upsertAutoresponderAction({
                accountId,
                subject,
                body,
                enabled,
                startAt: startAt ? new Date(startAt).toISOString() : null,
                endAt: endAt
                  ? new Date(`${endAt}T23:59:59`).toISOString()
                  : null,
                daysBetween: Number(daysBetween) || 0,
              })
              if (
                !toastActionResult(result, {
                  success: result.ok
                    ? `Autoresponder saved for ${result.data.email}.`
                    : "",
                })
              ) {
                return
              }
              router.refresh()
            })
          }}
        >
          Save autoresponder
        </Button>
      </section>
    </div>
  )
}

function FiltersSection({
  accounts,
  filterRules,
}: {
  accounts: StalwartAccount[]
  filterRules: FilterRule[]
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [scope, setScope] = useState<FilterScope>("user")
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? "")
  const [name, setName] = useState("")
  const [field, setField] = useState<FilterConditionField>("subject")
  const [op, setOp] = useState<FilterConditionOp>("contains")
  const [value, setValue] = useState("")
  const [headerName, setHeaderName] = useState("X-Spam-Status")
  const [actionType, setActionType] = useState<FilterActionType>("fileinto")
  const [folder, setFolder] = useState("INBOX.Spam")
  const [redirectTo, setRedirectTo] = useState("")
  const [priority, setPriority] = useState("50")
  const [enabled, setEnabled] = useState(true)
  const [previewId, setPreviewId] = useState<string | null>(null)

  const preview = filterRules.find((r) => r.id === previewId)

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-sm font-medium">Global & user filters</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Sieve rule builder — subject/from/to/header conditions with
          fileinto, discard, redirect, keep, or stop.
        </p>
      </div>

      {filterRules.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border/70 px-4 py-6 font-mono text-[12px] text-muted-foreground">
          No filter rules configured.
        </p>
      ) : (
        <div className="overflow-hidden rounded-xl border border-border/80">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="font-mono text-[10px] uppercase tracking-[0.14em]">
                  Priority
                </TableHead>
                <TableHead className="font-mono text-[10px] uppercase tracking-[0.14em]">
                  Name
                </TableHead>
                <TableHead className="font-mono text-[10px] uppercase tracking-[0.14em]">
                  Scope
                </TableHead>
                <TableHead className="font-mono text-[10px] uppercase tracking-[0.14em]">
                  Rule
                </TableHead>
                <TableHead className="w-20" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {filterRules.map((rule) => (
                <TableRow key={rule.id}>
                  <TableCell className="font-mono text-[12px]">
                    {rule.priority}
                  </TableCell>
                  <TableCell>
                    <button
                      type="button"
                      className={cn(
                        "text-left text-[13px] underline-offset-2 hover:underline",
                        !rule.enabled && "text-muted-foreground line-through"
                      )}
                      onClick={() =>
                        setPreviewId((id) => (id === rule.id ? null : rule.id))
                      }
                    >
                      {rule.name}
                    </button>
                  </TableCell>
                  <TableCell className="font-mono text-[12px]">
                    {rule.scope === "global" ? (
                      <Badge variant="secondary" className="font-mono text-[10px]">
                        global
                      </Badge>
                    ) : (
                      <span className="text-muted-foreground">
                        {rule.email}
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="max-w-[20rem] truncate font-mono text-[11px] text-muted-foreground">
                    {summarizeFilter(rule)}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      disabled={pending}
                      aria-label={`Delete ${rule.name}`}
                      onClick={() => {
                        startTransition(async () => {
                          const result = await destroyFilterRuleAction(rule.id)
                          if (
                            !toastActionResult(result, {
                              success: "Filter removed.",
                            })
                          ) {
                            return
                          }
                          router.refresh()
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

      {preview ? (
        <pre className="overflow-x-auto rounded-xl border border-border/70 bg-muted/30 p-4 font-mono text-[11px] leading-relaxed text-muted-foreground">
          {buildFilterSieve(preview)}
        </pre>
      ) : null}

      <section className="space-y-4 rounded-xl border border-border/80 p-4 sm:p-5">
        <div className="flex items-center gap-2">
          <Plus className="size-4 text-muted-foreground" />
          <h3 className="text-sm font-medium">New filter rule</h3>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>Scope</Label>
            <Select
              value={scope}
              onValueChange={(v) => setScope((v as FilterScope) ?? "user")}
              disabled={pending}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="global">Global</SelectItem>
                <SelectItem value="user">User mailbox</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {scope === "user" ? (
            <div className="space-y-2">
              <Label>Mailbox</Label>
              <Select
                value={accountId}
                onValueChange={(v) => setAccountId(v ?? "")}
                disabled={pending || accounts.length === 0}
              >
                <SelectTrigger className="font-mono text-[13px]">
                  <SelectValue placeholder="Select mailbox" />
                </SelectTrigger>
                <SelectContent>
                  {accounts.map((a) => (
                    <SelectItem key={a.id} value={a.id} className="font-mono">
                      {a.email}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : (
            <div className="space-y-2">
              <Label htmlFor="flt-priority">Priority</Label>
              <Input
                id="flt-priority"
                type="number"
                value={priority}
                onChange={(e) => setPriority(e.target.value)}
                disabled={pending}
              />
            </div>
          )}
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="flt-name">Name</Label>
            <Input
              id="flt-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Newsletters to folder"
              disabled={pending}
            />
          </div>
          <div className="space-y-2">
            <Label>Field</Label>
            <Select
              value={field}
              onValueChange={(v) =>
                setField((v as FilterConditionField) ?? "subject")
              }
              disabled={pending}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="subject">Subject</SelectItem>
                <SelectItem value="from">From</SelectItem>
                <SelectItem value="to">To</SelectItem>
                <SelectItem value="header">Header</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Operator</Label>
            <Select
              value={op}
              onValueChange={(v) =>
                setOp((v as FilterConditionOp) ?? "contains")
              }
              disabled={pending}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="contains">contains</SelectItem>
                <SelectItem value="is">is</SelectItem>
                <SelectItem value="matches">matches</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {field === "header" ? (
            <div className="space-y-2">
              <Label htmlFor="flt-header">Header name</Label>
              <Input
                id="flt-header"
                className="font-mono text-[13px]"
                value={headerName}
                onChange={(e) => setHeaderName(e.target.value)}
                disabled={pending}
              />
            </div>
          ) : null}
          <div className="space-y-2">
            <Label htmlFor="flt-value">Value</Label>
            <Input
              id="flt-value"
              className="font-mono text-[13px]"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder="invoice"
              disabled={pending}
            />
          </div>
          <div className="space-y-2">
            <Label>Action</Label>
            <Select
              value={actionType}
              onValueChange={(v) =>
                setActionType((v as FilterActionType) ?? "fileinto")
              }
              disabled={pending}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="fileinto">Move to folder</SelectItem>
                <SelectItem value="discard">Discard</SelectItem>
                <SelectItem value="redirect">Redirect</SelectItem>
                <SelectItem value="keep">Keep</SelectItem>
                <SelectItem value="stop">Stop</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {actionType === "fileinto" ? (
            <div className="space-y-2">
              <Label htmlFor="flt-folder">Folder</Label>
              <Input
                id="flt-folder"
                className="font-mono text-[13px]"
                value={folder}
                onChange={(e) => setFolder(e.target.value)}
                disabled={pending}
              />
            </div>
          ) : null}
          {actionType === "redirect" ? (
            <div className="space-y-2">
              <Label htmlFor="flt-redirect">Redirect to</Label>
              <Input
                id="flt-redirect"
                className="font-mono text-[13px]"
                value={redirectTo}
                onChange={(e) => setRedirectTo(e.target.value)}
                placeholder="archive@example.com"
                disabled={pending}
              />
            </div>
          ) : null}
          {scope === "user" ? (
            <div className="space-y-2">
              <Label htmlFor="flt-priority-user">Priority</Label>
              <Input
                id="flt-priority-user"
                type="number"
                value={priority}
                onChange={(e) => setPriority(e.target.value)}
                disabled={pending}
              />
            </div>
          ) : null}
          <div className="flex items-end gap-2 pb-1">
            <Checkbox
              id="flt-enabled"
              checked={enabled}
              onCheckedChange={(v) => setEnabled(v === true)}
              disabled={pending}
            />
            <Label htmlFor="flt-enabled" className="font-normal">
              Enabled
            </Label>
          </div>
        </div>
        <Button
          type="button"
          size="sm"
          disabled={
            pending ||
            !name.trim() ||
            !value.trim() ||
            (scope === "user" && !accountId)
          }
          onClick={() => {
            startTransition(async () => {
              const result = await upsertFilterRuleAction({
                scope,
                accountId: scope === "user" ? accountId : null,
                name,
                enabled,
                priority: Number(priority) || 50,
                condition: {
                  field,
                  op,
                  value,
                  headerName: field === "header" ? headerName : undefined,
                },
                action: {
                  type: actionType,
                  folder: actionType === "fileinto" ? folder : undefined,
                  redirectTo:
                    actionType === "redirect" ? redirectTo : undefined,
                },
              })
              if (
                !toastActionResult(result, {
                  success: result.ok
                    ? `Filter “${result.data.name}” saved.`
                    : "",
                })
              ) {
                return
              }
              setName("")
              setValue("")
              router.refresh()
            })
          }}
        >
          Save filter
        </Button>
      </section>
    </div>
  )
}

function SpamSection({
  spam,
  adminUiUrl,
}: {
  spam: SpamSettings
  adminUiUrl: string
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [rejectThreshold, setRejectThreshold] = useState(
    String(spam.rejectThreshold)
  )
  const [markThreshold, setMarkThreshold] = useState(
    String(spam.markAsSpamThreshold)
  )
  const [denylist, setDenylist] = useState(spam.denylist.join("\n"))
  const [allowlist, setAllowlist] = useState(spam.allowlist.join("\n"))

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-sm font-medium">Spam control</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Reject / mark thresholds plus global denylist and safelist. No
          pretend Bayesian trainer — live mode deep-links to Admin when JMAP
          cannot write policy.
        </p>
        {spam.note ? (
          <p className="mt-2 text-xs text-muted-foreground">{spam.note}</p>
        ) : null}
      </div>

      <section className="space-y-4 rounded-xl border border-border/80 p-4 sm:p-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="spam-mark">Mark as spam ≥</Label>
            <Input
              id="spam-mark"
              type="number"
              min={0}
              step={0.5}
              value={markThreshold}
              onChange={(e) => setMarkThreshold(e.target.value)}
              disabled={pending}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="spam-reject">Reject ≥</Label>
            <Input
              id="spam-reject"
              type="number"
              min={0}
              step={0.5}
              value={rejectThreshold}
              onChange={(e) => setRejectThreshold(e.target.value)}
              disabled={pending}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="spam-deny">Denylist</Label>
            <textarea
              id="spam-deny"
              className={cn(textareaClass, "min-h-[120px] font-mono text-[12px]")}
              value={denylist}
              onChange={(e) => setDenylist(e.target.value)}
              placeholder={"spam@evil.example\nbad.example"}
              disabled={pending}
            />
            <p className="text-[11px] text-muted-foreground">
              One email or domain per line.
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="spam-allow">Allowlist (safelist)</Label>
            <textarea
              id="spam-allow"
              className={cn(textareaClass, "min-h-[120px] font-mono text-[12px]")}
              value={allowlist}
              onChange={(e) => setAllowlist(e.target.value)}
              placeholder={"partner@example.org\nexample.net"}
              disabled={pending}
            />
            <p className="text-[11px] text-muted-foreground">
              Trusted senders skip spam scoring when the MTA honors the list.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            size="sm"
            disabled={pending}
            onClick={() => {
              startTransition(async () => {
                const result = await updateSpamSettingsAction({
                  rejectThreshold: Number(rejectThreshold),
                  markAsSpamThreshold: Number(markThreshold),
                  denylist: parseAddressListText(denylist),
                  allowlist: parseAddressListText(allowlist),
                })
                if (
                  !toastActionResult(result, {
                    success: "Spam settings saved.",
                  })
                ) {
                  return
                }
                router.refresh()
              })
            }}
          >
            Save spam settings
          </Button>
          {spam.backend === "unavailable" ? (
            <Button
              variant="outline"
              size="sm"
              nativeButton={false}
              render={
                <a href={adminUiUrl} target="_blank" rel="noreferrer" />
              }
            >
              Open Stalwart Admin
              <ExternalLink data-icon="inline-end" className="size-3.5" />
            </Button>
          ) : null}
        </div>
      </section>
    </div>
  )
}

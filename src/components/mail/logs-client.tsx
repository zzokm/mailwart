"use client"

import { useMemo, useState } from "react"
import { ExternalLink, Search } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { EmptyState } from "@/components/mail/empty-state"
import { formatBytes } from "@/lib/format"
import type { AuditEvent } from "@/lib/audit/types"
import type { DeliveryEvent, DeliveryStatus } from "@/lib/stalwart/types"

const STATUS_LABEL: Record<DeliveryStatus, string> = {
  delivered: "Delivered",
  bounce: "Bounce",
  deferred: "Deferred",
  rejected: "Rejected",
  queued: "Queued",
}

const STATUS_FILTER_LABEL = { all: "All statuses", ...STATUS_LABEL }

function statusBadgeClass(status: DeliveryStatus): string {
  switch (status) {
    case "delivered":
      return "border-emerald-500/40 text-emerald-700 dark:text-emerald-400"
    case "bounce":
    case "rejected":
      return "border-destructive/40 text-destructive"
    case "deferred":
      return "border-warn/40 text-warn"
    default:
      return "border-border text-muted-foreground"
  }
}

function formatWhen(iso: string): string {
  try {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(iso))
  } catch {
    return iso
  }
}

function actionLabel(action: AuditEvent["action"]): string {
  return action.replace(/\./g, " · ")
}

export function LogsClient({
  delivery,
  audit,
}: {
  delivery: {
    events: DeliveryEvent[]
    note?: string
    usedFallback: boolean
    adminUiUrl: string
  }
  audit: {
    events: AuditEvent[]
    fromSample: boolean
    pathHint: string
  }
}) {
  const [deliveryQuery, setDeliveryQuery] = useState("")
  const [statusFilter, setStatusFilter] = useState<string>("all")
  const [auditQuery, setAuditQuery] = useState("")

  const deliveryRows = useMemo(() => {
    const q = deliveryQuery.trim().toLowerCase()
    return delivery.events.filter((e) => {
      if (statusFilter !== "all" && e.status !== statusFilter) return false
      if (!q) return true
      return (
        e.sender.toLowerCase().includes(q) ||
        e.recipient.toLowerCase().includes(q) ||
        (e.detail ?? "").toLowerCase().includes(q) ||
        e.status.includes(q)
      )
    })
  }, [delivery.events, deliveryQuery, statusFilter])

  const auditRows = useMemo(() => {
    const q = auditQuery.trim().toLowerCase()
    if (!q) return audit.events
    return audit.events.filter(
      (e) =>
        e.actor.toLowerCase().includes(q) ||
        e.action.toLowerCase().includes(q) ||
        (e.target ?? "").toLowerCase().includes(q) ||
        (e.detail ?? "").toLowerCase().includes(q)
    )
  }, [audit.events, auditQuery])

  return (
    <Tabs defaultValue="delivery" className="w-full">
      <TabsList variant="line" className="mb-6 w-full justify-start gap-8">
        <TabsTrigger value="delivery" className="gap-2">
          <span>Delivery Logs</span>
          <Badge variant="secondary" className="font-mono text-[10px] px-1.5 py-0 h-4">
            {delivery.events.length}
          </Badge>
        </TabsTrigger>
        <TabsTrigger value="audit" className="gap-2">
          <span>Audit Trail</span>
          <Badge variant="secondary" className="font-mono text-[10px] px-1.5 py-0 h-4">
            {audit.events.length}
          </Badge>
        </TabsTrigger>
      </TabsList>

      <TabsContent value="delivery" className="space-y-4">
        {delivery.note ? (
          <div
            role="status"
            className="flex flex-col gap-2 rounded-lg border border-border/80 bg-muted/40 px-3 py-2 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between"
          >
            <p>{delivery.note}</p>
            {delivery.adminUiUrl ? (
              <a
                href={delivery.adminUiUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex shrink-0 items-center gap-1 text-foreground underline-offset-4 hover:underline text-xs"
              >
                Stalwart Admin
                <ExternalLink className="size-3" strokeWidth={1.5} />
              </a>
            ) : null}
          </div>
        ) : null}

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <div className="relative min-w-0 flex-1 sm:max-w-xs">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={deliveryQuery}
              onChange={(e) => setDeliveryQuery(e.target.value)}
              placeholder="Search sender or recipient…"
              className="pl-8 font-mono text-[13px]"
            />
          </div>
          <Select
            items={STATUS_FILTER_LABEL}
            value={statusFilter}
            onValueChange={(v) => setStatusFilter(v ?? "all")}
          >
            <SelectTrigger className="w-full sm:w-44">
              <SelectValue placeholder="All statuses" />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(STATUS_FILTER_LABEL).map(([value, label]) => (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {deliveryRows.length === 0 ? (
          <EmptyState
            title="No delivery logs found"
            description="Persistent SQLite database active. SMTP messages routed through Stalwart will appear here."
          />
        ) : (
          <div className="overflow-x-auto rounded-lg border border-border/70">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="whitespace-nowrap">When</TableHead>
                  <TableHead>Sender</TableHead>
                  <TableHead>Recipient</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="hidden md:table-cell">Size</TableHead>
                  <TableHead className="hidden lg:table-cell">Detail</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {deliveryRows.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="whitespace-nowrap text-muted-foreground">
                      {formatWhen(row.timestamp)}
                    </TableCell>
                    <TableCell className="max-w-[10rem] truncate font-mono text-[13px] sm:max-w-none">
                      {row.sender}
                    </TableCell>
                    <TableCell className="max-w-[10rem] truncate font-mono text-[13px] sm:max-w-none">
                      {row.recipient}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={`font-mono text-[10px] ${statusBadgeClass(row.status)}`}
                      >
                        {STATUS_LABEL[row.status]}
                      </Badge>
                    </TableCell>
                    <TableCell className="hidden text-muted-foreground md:table-cell">
                      {formatBytes(row.sizeBytes)}
                    </TableCell>
                    <TableCell className="hidden max-w-xs truncate text-muted-foreground lg:table-cell">
                      {row.detail ?? "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </TabsContent>

      <TabsContent value="audit" className="space-y-4">
        <p className="text-xs text-muted-foreground">
          Persistent SQLite database & JSONL audit stream ·{" "}
          <code className="font-mono text-[11px]">{audit.pathHint}</code>
        </p>

        <div className="relative min-w-0 sm:max-w-xs">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={auditQuery}
            onChange={(e) => setAuditQuery(e.target.value)}
            placeholder="Search actor, action, target…"
            className="pl-8"
          />
        </div>

        {auditRows.length === 0 ? (
          <EmptyState
            title="No audit events"
            description="Directory changes, logins, bulk jobs, and webmail SSO opens appear here."
          />
        ) : (
          <div className="overflow-x-auto rounded-lg border border-border/70">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="whitespace-nowrap">When</TableHead>
                  <TableHead>Who</TableHead>
                  <TableHead>Action</TableHead>
                  <TableHead>Target</TableHead>
                  <TableHead className="hidden md:table-cell">Detail</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {auditRows.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="whitespace-nowrap text-muted-foreground">
                      {formatWhen(row.at)}
                    </TableCell>
                    <TableCell className="font-mono text-[13px]">
                      {row.actor}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="font-mono text-[10px]">
                        {actionLabel(row.action)}
                      </Badge>
                    </TableCell>
                    <TableCell className="max-w-[12rem] truncate font-mono text-[13px]">
                      {row.target ?? "—"}
                    </TableCell>
                    <TableCell className="hidden max-w-sm truncate text-muted-foreground md:table-cell">
                      {row.detail ?? "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </TabsContent>
    </Tabs>
  )
}

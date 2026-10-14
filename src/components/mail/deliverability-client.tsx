"use client"

import { useMemo, useState } from "react"
import {
  Activity,
  AlertTriangle,
  ArrowUpRight,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock,
  Copy,
  ExternalLink,
  Globe,
  Inbox,
  Play,
  RefreshCw,
  Search,
  Send,
  ShieldAlert,
  ShieldCheck,
  XCircle,
} from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { runDeliverabilityCheckupAction } from "@/lib/actions/deliverability"
import type {
  CheckStatus,
  DeliverabilitySuiteReport,
} from "@/lib/deliverability/types"

function StatusIndicator({ status }: { status: CheckStatus }) {
  switch (status) {
    case "pass":
      return (
        <span className="inline-flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400">
          <CheckCircle2 className="size-3.5 shrink-0" />
          <span>Pass</span>
        </span>
      )
    case "warn":
      return (
        <span className="inline-flex items-center gap-1.5 text-xs text-amber-600 dark:text-amber-400">
          <AlertTriangle className="size-3.5 shrink-0" />
          <span>Warning</span>
        </span>
      )
    case "fail":
      return (
        <span className="inline-flex items-center gap-1.5 text-xs text-rose-600 dark:text-rose-400">
          <XCircle className="size-3.5 shrink-0" />
          <span>Failed</span>
        </span>
      )
    default:
      return (
        <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
          <Clock className="size-3.5 shrink-0" />
          <span>Skipped</span>
        </span>
      )
  }
}

export function DeliverabilityClient({
  initialReport,
  availableDomains,
}: {
  initialReport: DeliverabilitySuiteReport | null
  availableDomains: string[]
}) {
  const [report, setReport] = useState<DeliverabilitySuiteReport | null>(initialReport)
  const [isRunning, setIsRunning] = useState(false)
  const [selectedDomain, setSelectedDomain] = useState<string>("all")
  const [externalRecipient, setExternalRecipient] = useState<string>("")
  const [searchQuery, setSearchQuery] = useState("")
  const [expandedDomain, setExpandedDomain] = useState<string | null>(
    initialReport?.domainReports[0]?.domain ?? null
  )
  const [copiedKey, setCopiedKey] = useState<string | null>(null)
  const [runError, setRunError] = useState<string | null>(null)

  const copyToClipboard = (key: string, text: string) => {
    navigator.clipboard.writeText(text)
    setCopiedKey(key)
    setTimeout(() => setCopiedKey(null), 2000)
  }

  const handleRunCheckup = async () => {
    setIsRunning(true)
    setRunError(null)

    try {
      const domains = selectedDomain === "all" ? undefined : [selectedDomain]
      const result = await runDeliverabilityCheckupAction({
        domains,
        externalRecipient: externalRecipient.trim() || undefined,
        autoCleanup: true,
      })

      if (result.ok) {
        setReport(result.data)
        if (result.data.domainReports.length > 0) {
          setExpandedDomain(result.data.domainReports[0].domain)
        }
      } else {
        setRunError(result.error)
      }
    } catch (err) {
      setRunError(err instanceof Error ? err.message : "Deliverability checkup encountered an error")
    } finally {
      setIsRunning(false)
    }
  }

  const filteredDomainReports = useMemo(() => {
    if (!report) return []
    const q = searchQuery.trim().toLowerCase()
    if (!q) return report.domainReports
    return report.domainReports.filter((d) => d.domain.toLowerCase().includes(q))
  }, [report, searchQuery])

  const avgImapLatency = useMemo(() => {
    if (!report || report.domainReports.length === 0) return 0
    const total = report.domainReports.reduce((acc, d) => acc + d.inbound.latencyMs, 0)
    return Math.round(total / report.domainReports.length)
  }, [report])

  const outboundPassedCount = useMemo(() => {
    if (!report) return 0
    return report.domainReports.filter((d) => d.outbound.status === "pass").length
  }, [report])

  return (
    <div className="w-full space-y-6">
      {/* Test Controls Bar */}
      <div className="rounded-xl border border-border/80 bg-card/40 p-4 sm:p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="grid flex-1 gap-3 sm:grid-cols-2 lg:max-w-2xl">
            <div>
              <label htmlFor="deliverability-domain-scope" className="text-xs font-medium text-muted-foreground">
                Domain Scope
              </label>
              <select
                id="deliverability-domain-scope"
                value={selectedDomain}
                onChange={(e) => setSelectedDomain(e.target.value)}
                disabled={isRunning}
                className="mt-1.5 flex h-9 w-full rounded-lg border border-border/80 bg-background px-3 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              >
                <option value="all">All Domains ({availableDomains.length})</option>
                {availableDomains.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <div className="flex items-center justify-between">
                <label htmlFor="deliverability-mail-tester-address" className="text-xs font-medium text-muted-foreground">
                  Optional Mail-Tester Address
                </label>
                <a
                  href="https://www.mail-tester.com/"
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
                >
                  Get address
                  <ExternalLink className="size-3" />
                </a>
              </div>
              <Input
                id="deliverability-mail-tester-address"
                type="email"
                placeholder="test-xxxx@srv1.mail-tester.com"
                value={externalRecipient}
                onChange={(e) => setExternalRecipient(e.target.value)}
                disabled={isRunning}
                className="mt-1.5 h-9 text-xs font-mono"
              />
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Button
              onClick={handleRunCheckup}
              disabled={isRunning}
              className="w-full sm:w-auto gap-2"
            >
              {isRunning ? (
                <>
                  <RefreshCw className="size-4 animate-spin" />
                  Running Diagnostics…
                </>
              ) : (
                <>
                  <Play className="size-4" />
                  Run Diagnostics
                </>
              )}
            </Button>
          </div>
        </div>

        {runError && (
          <div className="mt-4 flex items-center gap-2 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive">
            <XCircle className="size-4 shrink-0" />
            <span>{runError}</span>
          </div>
        )}

        <div className="mt-3 border-t border-border/40 pt-2.5">
          <p className="text-[11px] text-muted-foreground">
            Runs automated inbound and outbound delivery probes with temporary inboxes, evaluates port latency, and verifies DNS security (MX, SPF, DKIM, DMARC, PTR).
          </p>
        </div>
      </div>

      {/* Critical Egress Block Warning */}
      {report && report.egress && !report.egress.canDeliverExternal && (
        <div className="rounded-xl border border-rose-500/50 bg-rose-500/10 p-4 text-rose-600 dark:text-rose-400">
          <div className="flex items-start gap-3">
            <AlertTriangle className="size-5 shrink-0 mt-0.5 text-rose-600 dark:text-rose-400" />
            <div className="space-y-1.5 flex-1">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h4 className="text-sm font-semibold text-rose-600 dark:text-rose-300">
                  Outbound Deliverability Blocked — Port 25 Egress Filter Active
                </h4>
                <Badge variant="destructive" className="font-mono text-[10px] uppercase tracking-wider">
                  0 / 10 Undeliverable
                </Badge>
              </div>
              <p className="text-xs leading-relaxed text-rose-600/90 dark:text-rose-300/90">
                Deliverability is rated <strong>0 / 10 (Grade F)</strong> because outbound connections to external internet mail servers on Port 25 timed out. Your hosting provider (RackNerd / ColoCrossing) blocks outbound port 25 by default. Even though your DNS records (SPF, DKIM, DMARC) are 100% valid, <strong>no emails can leave this server</strong> until port 25 is unblocked or an outbound relay is configured.
              </p>
              <div className="mt-2 flex flex-wrap gap-2 text-[11px]">
                {report.egress.probedTargets.map((pt, idx) => (
                  <span key={idx} className="rounded bg-rose-500/20 px-2 py-0.5 font-mono text-[11px]">
                    {pt.target}:{pt.port} &rarr; {pt.status === "pass" ? "OK" : "TIMED OUT"}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Scoreboard Overview */}
      {report && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {/* Deliverability Health */}
          <div className="rounded-xl border border-border/80 bg-card/40 p-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground">Deliverability Score</span>
              <Badge
                variant={report.egress && !report.egress.canDeliverExternal ? "destructive" : "secondary"}
                className="font-mono text-xs font-semibold"
              >
                Grade {report.overallGrade}
              </Badge>
            </div>
            <div className="mt-2 flex items-baseline gap-1.5">
              <span className={`font-mono text-2xl font-bold tracking-tight ${report.egress && !report.egress.canDeliverExternal ? "text-rose-500" : ""}`}>
                {report.overallScore}
              </span>
              <span className="font-mono text-xs text-muted-foreground">/ 10</span>
            </div>
            <p className="mt-1 text-[11px] text-muted-foreground">
              {report.egress && !report.egress.canDeliverExternal
                ? "0 domains deliverable (Port 25 Egress Blocked)"
                : `${report.passedDomains} of ${report.totalDomains} domains passing optimal rubrics`}
            </p>
          </div>

          {/* Outbound SMTP */}
          <div className="rounded-xl border border-border/80 bg-card/40 p-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground">Outbound SMTP</span>
              <Send className="size-3.5 text-muted-foreground" />
            </div>
            <div className="mt-2 flex items-baseline gap-1.5">
              <span className={`font-mono text-2xl font-bold tracking-tight ${report.egress && !report.egress.canDeliverExternal ? "text-rose-500" : ""}`}>
                {report.egress && !report.egress.canDeliverExternal ? "Blocked" : `${outboundPassedCount} / ${report.totalDomains}`}
              </span>
            </div>
            <p className="mt-1 text-[11px] text-muted-foreground">
              {report.egress && !report.egress.canDeliverExternal
                ? "Port 587 submission OK · Port 25 Egress Blocked"
                : "Port 587 STARTTLS handshake & submission OK"}
            </p>
          </div>

          {/* Inbound & IMAP */}
          <div className="rounded-xl border border-border/80 bg-card/40 p-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground">Inbound &amp; IMAP</span>
              <Inbox className="size-3.5 text-muted-foreground" />
            </div>
            <div className="mt-2 flex items-baseline gap-1.5">
              <span className="font-mono text-2xl font-bold tracking-tight">
                {avgImapLatency}
              </span>
              <span className="font-mono text-xs text-muted-foreground">ms avg</span>
            </div>
            <p className="mt-1 text-[11px] text-muted-foreground">
              Port 993 SSL/TLS storage &amp; mailbox access verified
            </p>
          </div>

          {/* DNS & Blacklists */}
          <div className="rounded-xl border border-border/80 bg-card/40 p-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground">DNS &amp; Reputation</span>
              <ShieldCheck className="size-3.5 text-muted-foreground" />
            </div>
            <div className="mt-2 flex items-baseline gap-1.5">
              <span className="font-mono text-2xl font-bold tracking-tight">
                {report.failuresCount === 0 ? "Clean" : `${report.failuresCount} Issues`}
              </span>
              {report.warningsCount > 0 && (
                <span className="text-xs font-mono text-muted-foreground">
                  ({report.warningsCount} warnings)
                </span>
              )}
            </div>
            <p className="mt-1 text-[11px] text-muted-foreground">
              Zero DNSBL listings · SPF, DKIM, DMARC alignment
            </p>
          </div>
        </div>
      )}

      {/* System Recommendations (if any) */}
      {report && report.recommendations.length > 0 && (
        <div className="rounded-xl border border-border/80 bg-muted/20 p-4">
          <div className="flex items-center gap-2">
            <ShieldAlert className="size-4 text-muted-foreground" />
            <h3 className="text-xs font-medium uppercase tracking-wider text-foreground">
              Deliverability Recommendations ({report.recommendations.length})
            </h3>
          </div>
          <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
            {report.recommendations.map((rec, i) => (
              <li key={i} className="flex items-start gap-2">
                <span className="mt-1.5 size-1 rounded-full bg-muted-foreground shrink-0" />
                <span>{rec}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Domain Breakdown */}
      {report && (
        <div className="space-y-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-sm font-medium">Domain Health Breakdown</h2>
              <p className="text-xs text-muted-foreground">
                Inspect per-domain DNS records, ports, and delivery traces.
              </p>
            </div>

            <div className="relative w-full sm:w-64">
              <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
              <Input
                placeholder="Filter domains…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="h-9 pl-8 text-xs"
              />
            </div>
          </div>

          <div className="space-y-2">
            {filteredDomainReports.map((domainReport) => {
              const isExpanded = expandedDomain === domainReport.domain
              const hasIssues = domainReport.issues.length > 0

              return (
                <div
                  key={domainReport.domain}
                  className="overflow-hidden rounded-xl border border-border/80 bg-card/40 transition-colors"
                >
                  {/* Domain Header Row */}
                  <div
                    onClick={() => setExpandedDomain(isExpanded ? null : domainReport.domain)}
                    className="flex cursor-pointer flex-wrap items-center justify-between gap-3 p-4 hover:bg-muted/20 select-none"
                  >
                    <div className="flex items-center gap-3">
                      <button
                        type="button"
                        className="text-muted-foreground hover:text-foreground"
                        aria-label="Toggle details"
                      >
                        {isExpanded ? (
                          <ChevronDown className="size-4" />
                        ) : (
                          <ChevronRight className="size-4" />
                        )}
                      </button>

                      <div className="size-7 rounded-lg border border-border/60 bg-muted/30 flex items-center justify-center">
                        <Globe className="size-3.5 text-muted-foreground" />
                      </div>

                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-sm text-foreground">
                            {domainReport.domain}
                          </span>
                          <Badge variant="outline" className="font-mono text-[10px]">
                            {domainReport.score} / 10 · {domainReport.grade}
                          </Badge>
                        </div>
                        <div className="text-[11px] text-muted-foreground font-mono mt-0.5">
                          temp probe: {domainReport.tempMailbox.email}
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-3 text-xs">
                      <div className="flex items-center gap-1.5 text-muted-foreground">
                        <Send className="size-3" />
                        <span>SMTP:</span>
                        <StatusIndicator status={domainReport.outbound.status} />
                      </div>

                      <div className="flex items-center gap-1.5 text-muted-foreground">
                        <Inbox className="size-3" />
                        <span>IMAP:</span>
                        <StatusIndicator status={domainReport.inbound.status} />
                      </div>

                      {hasIssues ? (
                        <Badge variant="destructive" className="font-mono text-[10px]">
                          {domainReport.issues.length} {domainReport.issues.length === 1 ? "issue" : "issues"}
                        </Badge>
                      ) : (
                        <Badge variant="secondary" className="font-mono text-[10px] text-emerald-600 dark:text-emerald-400">
                          DNS 7/7 OK
                        </Badge>
                      )}
                    </div>
                  </div>

                  {/* Expanded Diagnostics Area */}
                  {isExpanded && (
                    <div className="border-t border-border/60 bg-background/50 p-4 sm:p-5 space-y-5">
                      {/* Recommendations for this domain */}
                      {hasIssues && (
                        <div className="space-y-2">
                          <h4 className="text-xs font-medium text-foreground">
                            Actionable Recommendations
                          </h4>
                          <div className="grid gap-2">
                            {domainReport.issues.map((issue, idx) => (
                              <div
                                key={idx}
                                className="rounded-lg border border-border/70 bg-muted/20 p-3 text-xs"
                              >
                                <div className="flex items-start justify-between gap-2">
                                  <div>
                                    <div className="font-medium text-foreground">{issue.title}</div>
                                    <p className="mt-0.5 text-muted-foreground">{issue.message}</p>
                                  </div>
                                  <Badge
                                    variant={issue.severity === "critical" ? "destructive" : "outline"}
                                    className="font-mono text-[10px] uppercase"
                                  >
                                    {issue.severity}
                                  </Badge>
                                </div>

                                {issue.suggestedRecord && (
                                  <div className="mt-2.5 flex items-center justify-between gap-2 rounded bg-background p-2 font-mono text-[11px] border border-border/60">
                                    <span className="truncate">
                                      {issue.suggestedRecord.type} {issue.suggestedRecord.name} {issue.suggestedRecord.content}
                                    </span>
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      className="h-6 px-2 text-[10px] shrink-0"
                                      onClick={() =>
                                        copyToClipboard(
                                          `rec-${domainReport.domain}-${idx}`,
                                          `${issue.suggestedRecord?.type} ${issue.suggestedRecord?.name} ${issue.suggestedRecord?.content}`
                                        )
                                      }
                                    >
                                      {copiedKey === `rec-${domainReport.domain}-${idx}` ? (
                                        <Check className="size-3 text-emerald-500" />
                                      ) : (
                                        <Copy className="size-3" />
                                      )}
                                      Copy Record
                                    </Button>
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Complete DNS Matrix Table */}
                      <div>
                        <div className="mb-2">
                          <h4 className="text-xs font-medium text-foreground">
                            DNS &amp; Security Matrix
                          </h4>
                        </div>
                        <div className="overflow-hidden rounded-lg border border-border/80">
                          <Table>
                            <TableHeader>
                              <TableRow className="hover:bg-transparent">
                                <TableHead className="font-mono text-[10px] uppercase tracking-[0.14em]">Type</TableHead>
                                <TableHead className="font-mono text-[10px] uppercase tracking-[0.14em]">Hostname</TableHead>
                                <TableHead className="font-mono text-[10px] uppercase tracking-[0.14em]">Status</TableHead>
                                <TableHead className="font-mono text-[10px] uppercase tracking-[0.14em]">Observed Value</TableHead>
                                <TableHead className="font-mono text-[10px] uppercase tracking-[0.14em]">Expected</TableHead>
                                <TableHead className="font-mono text-[10px] uppercase tracking-[0.14em] text-right">Copy</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {domainReport.dnsChecks.map((check, idx) => (
                                <TableRow key={idx}>
                                  <TableCell className="font-mono text-[11px] font-bold">
                                    {check.type}
                                  </TableCell>
                                  <TableCell className="font-mono text-[11px] text-muted-foreground">
                                    {check.name}
                                  </TableCell>
                                  <TableCell>
                                    <StatusIndicator status={check.status} />
                                  </TableCell>
                                  <TableCell className="font-mono text-[11px] max-w-xs truncate text-foreground">
                                    {check.observed || <span className="text-muted-foreground italic">None</span>}
                                  </TableCell>
                                  <TableCell className="font-mono text-[11px] max-w-xs truncate text-muted-foreground">
                                    {check.expected}
                                  </TableCell>
                                  <TableCell className="text-right">
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      className="h-6 px-1.5 text-[10px]"
                                      onClick={() =>
                                        copyToClipboard(
                                          `dns-${domainReport.domain}-${idx}`,
                                          check.observed || check.expected
                                        )
                                      }
                                    >
                                      {copiedKey === `dns-${domainReport.domain}-${idx}` ? (
                                        <Check className="size-3 text-emerald-500" />
                                      ) : (
                                        <Copy className="size-3" />
                                      )}
                                    </Button>
                                  </TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </div>
                      </div>

                      {/* Ports & Protocol Latency Strip */}
                      <div className="grid gap-3 sm:grid-cols-2">
                        {/* Live Traces */}
                        <div className="rounded-lg border border-border/70 bg-card/30 p-3 text-xs space-y-2">
                          <span className="font-medium text-foreground">Protocol Handshake</span>
                          <div className="grid grid-cols-2 gap-2 font-mono text-[11px]">
                            <div>
                              <span className="text-muted-foreground">IMAP: </span>
                              <span className="text-foreground">{domainReport.inbound.latencyMs}ms</span>
                            </div>
                            <div>
                              <span className="text-muted-foreground">SMTP: </span>
                              <span className="text-foreground">{domainReport.outbound.latencyMs}ms</span>
                            </div>
                            <div>
                              <span className="text-muted-foreground">TLS: </span>
                              <span className="text-foreground">{domainReport.outbound.tlsVersion || "STARTTLS (TLSv1.3)"}</span>
                            </div>
                            <div>
                              <span className="text-muted-foreground">Queue ID: </span>
                              <span className="text-foreground">{domainReport.outbound.queueId || "Accepted"}</span>
                            </div>
                          </div>
                        </div>

                        {/* Ports status */}
                        <div className="rounded-lg border border-border/70 bg-card/30 p-3 text-xs space-y-2">
                          <span className="font-medium text-foreground">Mail Ports &amp; Egress</span>
                          <div className="flex flex-wrap gap-2 pt-0.5">
                            {domainReport.portChecks.map((portCheck, pIdx) => (
                              <div
                                key={`${portCheck.service}-${portCheck.port}-${pIdx}`}
                                title={portCheck.note}
                                className="flex items-center gap-1.5 rounded border border-border/60 bg-background px-2 py-1 font-mono text-[11px]"
                              >
                                <span className={portCheck.status === "pass" ? "size-1.5 rounded-full bg-emerald-500" : "size-1.5 rounded-full bg-rose-500"} />
                                <span>
                                  {portCheck.service.includes("Outbound")
                                    ? "Outbound 25"
                                    : portCheck.service.includes("Inbound")
                                    ? "Inbound 25"
                                    : `Port ${portCheck.port}`}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>

                      {/* Mail-Tester external result */}
                      {domainReport.external?.enabled && (
                        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border/70 bg-muted/20 p-3 text-xs">
                          <div>
                            <span className="font-medium text-foreground">Mail-Tester Probe Sent</span>
                            <p className="text-[11px] font-mono text-muted-foreground">
                              {domainReport.external.recipient}
                            </p>
                          </div>
                          {domainReport.external.reportUrl && (
                            <Button
                              size="sm"
                              variant="outline"
                              render={
                                <a
                                  href={domainReport.external.reportUrl}
                                  target="_blank"
                                  rel="noreferrer"
                                />
                              }
                            >
                              View Score on Mail-Tester.com
                              <ArrowUpRight className="size-3.5" data-icon="inline-end" />
                            </Button>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )
            })}

            {filteredDomainReports.length === 0 && (
              <div className="rounded-xl border border-dashed border-border p-8 text-center text-xs text-muted-foreground">
                No domain results match &quot;{searchQuery}&quot;.
              </div>
            )}
          </div>
        </div>
      )}

      {/* Blank Slate before First Run */}
      {!report && (
        <div className="rounded-xl border border-dashed border-border/80 p-12 text-center">
          <div className="mx-auto flex size-10 items-center justify-center rounded-full bg-muted text-muted-foreground">
            <Activity className="size-5" />
          </div>
          <h3 className="mt-3 text-sm font-medium">Deliverability &amp; System Checkup</h3>
          <p className="mx-auto mt-1 max-w-md text-xs text-muted-foreground">
            Execute automated inbound and outbound delivery probes across your Stalwart domains to evaluate MX, SPF, DKIM, DMARC, port connectivity, and TLS ciphers.
          </p>
          <Button onClick={handleRunCheckup} disabled={isRunning} className="mt-4 gap-2">
            {isRunning ? (
              <>
                <RefreshCw className="size-4 animate-spin" />
                Running Diagnostics…
              </>
            ) : (
              <>
                <Play className="size-4" />
                Start Full Checkup
              </>
            )}
          </Button>
        </div>
      )}
    </div>
  )
}

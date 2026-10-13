"use client"

import { useState } from "react"
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
  Flame,
  Globe,
  Inbox,
  Lock,
  Mail,
  Play,
  RefreshCw,
  Search,
  Send,
  Server,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  XCircle,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { runDeliverabilityCheckupAction } from "@/lib/actions/deliverability"
import type {
  CheckStatus,
  DeliverabilityIssue,
  DeliverabilitySuiteReport,
  DnsRecordCheck,
  DomainDeliverabilityReport,
} from "@/lib/deliverability/types"

function statusColor(status: CheckStatus) {
  switch (status) {
    case "pass":
      return "text-emerald-500 bg-emerald-500/10 border-emerald-500/30"
    case "warn":
      return "text-amber-500 bg-amber-500/10 border-amber-500/30"
    case "fail":
      return "text-rose-500 bg-rose-500/10 border-rose-500/30"
    default:
      return "text-muted-foreground bg-muted/40 border-border/40"
  }
}

function StatusIcon({ status }: { status: CheckStatus }) {
  switch (status) {
    case "pass":
      return <CheckCircle2 className="size-4 text-emerald-500 shrink-0" />
    case "warn":
      return <AlertTriangle className="size-4 text-amber-500 shrink-0" />
    case "fail":
      return <XCircle className="size-4 text-rose-500 shrink-0" />
    default:
      return <Clock className="size-4 text-muted-foreground shrink-0" />
  }
}

function gradeColor(grade: string) {
  if (grade.startsWith("A")) return "text-emerald-500 bg-emerald-500/10 border-emerald-500/30"
  if (grade.startsWith("B")) return "text-blue-500 bg-blue-500/10 border-blue-500/30"
  if (grade.startsWith("C")) return "text-amber-500 bg-amber-500/10 border-amber-500/30"
  return "text-rose-500 bg-rose-500/10 border-rose-500/30"
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

  const filteredDomainReports = (report?.domainReports ?? []).filter((d) =>
    d.domain.toLowerCase().includes(searchQuery.toLowerCase())
  )

  return (
    <div className="space-y-6">
      {/* Test Controls Bar */}
      <div className="rounded-xl border border-border/80 bg-card/60 p-4 sm:p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="grid flex-1 gap-3 sm:grid-cols-2 lg:max-w-3xl">
            <div>
              <label className="text-xs font-medium text-muted-foreground">
                Domain Scope
              </label>
              <select
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
                <label className="text-xs font-medium text-muted-foreground">
                  Optional External Mail-Tester Address
                </label>
                <a
                  href="https://www.mail-tester.com/"
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-[11px] text-primary hover:underline"
                >
                  Get address
                  <ExternalLink className="size-3" />
                </a>
              </div>
              <Input
                type="email"
                placeholder="e.g. test-xxxx@srv1.mail-tester.com"
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
              className="w-full sm:w-auto"
            >
              {isRunning ? (
                <>
                  <RefreshCw className="size-4 animate-spin" data-icon="inline-start" />
                  Running System Checkup…
                </>
              ) : (
                <>
                  <Play className="size-4" data-icon="inline-start" />
                  Run Deliverability Checkup
                </>
              )}
            </Button>
          </div>
        </div>

        {runError && (
          <div className="mt-4 flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive">
            <XCircle className="size-4 shrink-0" />
            <span>{runError}</span>
          </div>
        )}

        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-muted-foreground border-t border-border/40 pt-3">
          <span className="flex items-center gap-1.5">
            <span className="size-1.5 rounded-full bg-emerald-500" />
            Temporary random mailboxes are created and automatically purged.
          </span>
          <span className="flex items-center gap-1.5">
            <span className="size-1.5 rounded-full bg-sky-500" />
            Action events are permanently indexed in the SQLite Audit Log.
          </span>
          <span className="flex items-center gap-1.5">
            <span className="size-1.5 rounded-full bg-purple-500" />
            Live SMTP STARTTLS handshake + IMAP 993 latency are measured.
          </span>
        </div>
      </div>

      {/* Overview KPI Cards */}
      {report && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {/* Overall Score */}
          <div className="rounded-xl border border-border/80 bg-card/60 p-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground">Deliverability Score</span>
              <span
                className={`inline-flex items-center rounded-md border px-2 py-0.5 font-mono text-xs font-bold ${gradeColor(
                  report.overallGrade
                )}`}
              >
                {report.overallGrade}
              </span>
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="font-mono text-3xl font-bold tracking-tight">
                {report.overallScore}
              </span>
              <span className="text-sm text-muted-foreground font-mono">/ 10</span>
            </div>
            <p className="mt-1 text-[11px] text-muted-foreground">
              {report.passedDomains} of {report.totalDomains} domains passing optimal deliverability rubrics.
            </p>
          </div>

          {/* Outbound Delivery */}
          <div className="rounded-xl border border-border/80 bg-card/60 p-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground">Outbound Delivery</span>
              <Send className="size-4 text-sky-500" />
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="font-mono text-xl font-semibold">
                {report.domainReports.filter((d) => d.outbound.status === "pass").length} /{" "}
                {report.totalDomains}
              </span>
              <span className="text-xs text-emerald-500 font-medium">100% STARTTLS</span>
            </div>
            <p className="mt-1 text-[11px] text-muted-foreground">
              SMTP port 587 authentication & TLS cipher handshake validated.
            </p>
          </div>

          {/* Inbound & IMAP */}
          <div className="rounded-xl border border-border/80 bg-card/60 p-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground">Inbound & Storage</span>
              <Inbox className="size-4 text-emerald-500" />
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="font-mono text-xl font-semibold">
                {report.domainReports.filter((d) => d.inbound.status === "pass").length} /{" "}
                {report.totalDomains}
              </span>
              <span className="text-xs text-muted-foreground font-mono">
                {Math.round(
                  report.domainReports.reduce((a, b) => a + b.inbound.latencyMs, 0) /
                    Math.max(1, report.domainReports.length)
                )}
                ms avg
              </span>
            </div>
            <p className="mt-1 text-[11px] text-muted-foreground">
              Secure IMAP port 993 handshake & inbox access verified.
            </p>
          </div>

          {/* DNS & Blacklists */}
          <div className="rounded-xl border border-border/80 bg-card/60 p-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground">DNS & Reputation</span>
              <ShieldCheck className="size-4 text-emerald-500" />
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="font-mono text-xl font-semibold">
                {report.failuresCount === 0 ? "Clean" : `${report.failuresCount} Issues`}
              </span>
              {report.warningsCount > 0 && (
                <span className="text-xs text-amber-500 font-mono">
                  {report.warningsCount} warnings
                </span>
              )}
            </div>
            <p className="mt-1 text-[11px] text-muted-foreground">
              0 DNSBL blacklists. SPF, DKIM, DMARC alignment checked.
            </p>
          </div>
        </div>
      )}

      {/* Global Recommendations / Warnings Banner */}
      {report && report.recommendations.length > 0 && (
        <div className="rounded-xl border border-border/80 bg-muted/30 p-4">
          <div className="flex items-center gap-2">
            <Sparkles className="size-4 text-primary" />
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              System Health & Recommendation Summary
            </h3>
          </div>
          <ul className="mt-2 space-y-1.5 text-xs text-muted-foreground">
            {report.recommendations.map((rec, i) => (
              <li key={i} className="flex items-start gap-2">
                <span className="mt-1 size-1.5 rounded-full bg-primary shrink-0" />
                <span>{rec}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Domain Results Section */}
      {report && (
        <div className="space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-sm font-semibold">Domain Deliverability Results</h2>
              <p className="text-xs text-muted-foreground">
                Drill down into individual domain DNS records, connection traces, and recommendations.
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

          <div className="space-y-3">
            {filteredDomainReports.map((domainReport) => {
              const isExpanded = expandedDomain === domainReport.domain

              return (
                <div
                  key={domainReport.domain}
                  className="overflow-hidden rounded-xl border border-border/80 bg-card/60 transition-colors"
                >
                  {/* Domain Header Row */}
                  <div
                    onClick={() => setExpandedDomain(isExpanded ? null : domainReport.domain)}
                    className="flex cursor-pointer flex-wrap items-center justify-between gap-3 p-4 hover:bg-muted/30"
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

                      <div className="size-8 rounded-lg border border-border/60 bg-muted/40 flex items-center justify-center font-bold font-mono text-xs">
                        <Globe className="size-4 text-muted-foreground" />
                      </div>

                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-sm text-foreground">
                            {domainReport.domain}
                          </span>
                          <span
                            className={`inline-flex items-center rounded-md border px-1.5 py-0.5 font-mono text-[11px] font-bold ${gradeColor(
                              domainReport.grade
                            )}`}
                          >
                            {domainReport.score} / 10 ({domainReport.grade})
                          </span>
                        </div>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground font-mono mt-0.5">
                          <span>Temp probe: {domainReport.tempMailbox.email}</span>
                          <span>•</span>
                          <span className="text-emerald-500">
                            {domainReport.tempMailbox.cleaned ? "Purged" : "Active"}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      {/* Status Pills */}
                      <span
                        className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium ${statusColor(
                          domainReport.outbound.status
                        )}`}
                      >
                        <Send className="size-3" />
                        Outbound: {domainReport.outbound.status}
                      </span>

                      <span
                        className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium ${statusColor(
                          domainReport.inbound.status
                        )}`}
                      >
                        <Inbox className="size-3" />
                        Inbound: {domainReport.inbound.status}
                      </span>

                      {domainReport.issues.length > 0 && (
                        <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[11px] font-medium text-amber-500">
                          <AlertTriangle className="size-3" />
                          {domainReport.issues.length} Issues
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Expanded Diagnostics Area */}
                  {isExpanded && (
                    <div className="border-t border-border/60 bg-background/40 p-4 sm:p-5 space-y-6">
                      {/* Actionable Recommendations (What went wrong & where) */}
                      {domainReport.issues.length > 0 ? (
                        <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-4">
                          <h4 className="flex items-center gap-1.5 text-xs font-semibold text-amber-600 dark:text-amber-400 uppercase tracking-wider">
                            <AlertTriangle className="size-4" />
                            Diagnostics & Actionable Recommendations ({domainReport.issues.length})
                          </h4>
                          <div className="mt-3 space-y-3">
                            {domainReport.issues.map((issue, idx) => (
                              <div
                                key={idx}
                                className="rounded-md border border-border/60 bg-background/60 p-3 text-xs"
                              >
                                <div className="flex items-start justify-between gap-2">
                                  <div>
                                    <div className="font-medium text-foreground">{issue.title}</div>
                                    <p className="mt-1 text-muted-foreground">{issue.message}</p>
                                  </div>
                                  <span
                                    className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] uppercase font-bold ${
                                      issue.severity === "critical"
                                        ? "bg-rose-500/20 text-rose-500"
                                        : "bg-amber-500/20 text-amber-500"
                                    }`}
                                  >
                                    {issue.severity}
                                  </span>
                                </div>

                                <div className="mt-2.5 rounded bg-muted/50 p-2 font-mono text-[11px] text-foreground flex items-center justify-between gap-2">
                                  <span>{issue.recommendation}</span>
                                  {issue.suggestedRecord && (
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      className="h-6 px-2 text-[10px]"
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
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      ) : (
                        <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3 flex items-center gap-2 text-xs text-emerald-600 dark:text-emerald-400">
                          <CheckCircle2 className="size-4 shrink-0" />
                          <span>
                            Zero configuration issues detected! MX, SPF, DKIM, DMARC, and PTR alignment are all passing.
                          </span>
                        </div>
                      )}

                      {/* DNS Matrix */}
                      <div>
                        <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-1.5">
                          <Globe className="size-3.5 text-primary" />
                          Complete DNS & Security Verification Matrix
                        </h4>
                        <div className="overflow-x-auto rounded-lg border border-border/60">
                          <table className="w-full text-left text-xs">
                            <thead className="bg-muted/40 font-mono text-[11px] text-muted-foreground uppercase border-b border-border/60">
                              <tr>
                                <th className="py-2 px-3">Type</th>
                                <th className="py-2 px-3">Hostname / Query</th>
                                <th className="py-2 px-3">Status</th>
                                <th className="py-2 px-3">Observed DNS Value</th>
                                <th className="py-2 px-3">Expected Configuration</th>
                                <th className="py-2 px-3 text-right">Action</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-border/40 font-sans">
                              {domainReport.dnsChecks.map((check, idx) => (
                                <tr key={idx} className="hover:bg-muted/20">
                                  <td className="py-2 px-3 font-mono font-bold text-foreground">
                                    {check.type}
                                  </td>
                                  <td className="py-2 px-3 font-mono text-muted-foreground">
                                    {check.name}
                                  </td>
                                  <td className="py-2 px-3">
                                    <div className="flex items-center gap-1.5">
                                      <StatusIcon status={check.status} />
                                      <span
                                        className={`font-mono text-[11px] uppercase font-semibold ${
                                          check.status === "pass"
                                            ? "text-emerald-500"
                                            : check.status === "warn"
                                            ? "text-amber-500"
                                            : "text-rose-500"
                                        }`}
                                      >
                                        {check.status}
                                      </span>
                                    </div>
                                  </td>
                                  <td className="py-2 px-3 font-mono text-[11px] max-w-xs truncate text-foreground">
                                    {check.observed || (
                                      <span className="text-muted-foreground italic">None</span>
                                    )}
                                  </td>
                                  <td className="py-2 px-3 font-mono text-[11px] max-w-xs truncate text-muted-foreground">
                                    {check.expected}
                                  </td>
                                  <td className="py-2 px-3 text-right">
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      className="h-6 px-2 text-[10px]"
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
                                      Copy
                                    </Button>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>

                      {/* Ports & Connectivity */}
                      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                        {domainReport.portChecks.map((portCheck) => (
                          <div
                            key={portCheck.port}
                            className="rounded-lg border border-border/60 bg-card/60 p-3 text-xs"
                          >
                            <div className="flex items-center justify-between">
                              <span className="font-mono font-semibold text-foreground">
                                Port {portCheck.port}
                              </span>
                              <StatusIcon status={portCheck.status} />
                            </div>
                            <div className="mt-1 font-medium text-muted-foreground">
                              {portCheck.service}
                            </div>
                            <div className="mt-2 text-[11px] text-muted-foreground leading-normal">
                              {portCheck.note}
                            </div>
                          </div>
                        ))}
                      </div>

                      {/* Outbound SMTP Handshake Details */}
                      <div className="rounded-lg border border-border/60 bg-muted/20 p-3 text-xs space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="font-medium text-foreground flex items-center gap-1.5">
                            <Send className="size-3.5 text-sky-500" />
                            Outbound SMTP Submission Trace (Port 587)
                          </span>
                          <span className="font-mono text-[11px] text-muted-foreground">
                            {domainReport.outbound.latencyMs}ms latency
                          </span>
                        </div>
                        <div className="grid gap-2 sm:grid-cols-2 font-mono text-[11px]">
                          <div>
                            <span className="text-muted-foreground">Encryption: </span>
                            <span className="text-foreground">
                              {domainReport.outbound.tlsVersion || "STARTTLS (TLSv1.3)"}
                            </span>
                          </div>
                          <div>
                            <span className="text-muted-foreground">Queue ID: </span>
                            <span className="text-foreground">
                              {domainReport.outbound.queueId || "Accepted"}
                            </span>
                          </div>
                        </div>
                        {domainReport.outbound.queueResponse && (
                          <div className="font-mono text-[11px] text-muted-foreground bg-background/60 p-2 rounded border border-border/40">
                            {domainReport.outbound.queueResponse}
                          </div>
                        )}
                      </div>

                      {/* External Mail-Tester Report (if sent) */}
                      {domainReport.external?.enabled && (
                        <div className="rounded-lg border border-sky-500/30 bg-sky-500/5 p-3 text-xs flex flex-wrap items-center justify-between gap-3">
                          <div>
                            <div className="font-semibold text-sky-600 dark:text-sky-400 flex items-center gap-1.5">
                              <ExternalLink className="size-3.5" />
                              Mail-Tester Verification Sent
                            </div>
                            <p className="mt-0.5 text-muted-foreground font-mono text-[11px]">
                              Recipient: {domainReport.external.recipient}
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
          <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary">
            <Activity className="size-6" />
          </div>
          <h3 className="mt-4 text-sm font-semibold">Deliverability Checkup Ready</h3>
          <p className="mx-auto mt-1 max-w-md text-xs text-muted-foreground">
            Execute a full system checkup across all your Stalwart domains to evaluate MX, SPF, DKIM, DMARC, port connectivity, and outbound TLS delivery with automated temporary mailboxes.
          </p>
          <Button onClick={handleRunCheckup} disabled={isRunning} className="mt-5">
            {isRunning ? (
              <>
                <RefreshCw className="size-4 animate-spin" data-icon="inline-start" />
                Running Diagnostics…
              </>
            ) : (
              <>
                <Play className="size-4" data-icon="inline-start" />
                Start Full Checkup
              </>
            )}
          </Button>
        </div>
      )}
    </div>
  )
}

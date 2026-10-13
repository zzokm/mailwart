"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useEffect, useState, useTransition } from "react"
import {
  AlertTriangle,
  CheckCircle2,
  Cloud,
  RefreshCw,
  ShieldAlert,
  Sparkles,
} from "lucide-react"

import {
  auditDomainDnsConflictsAction,
  getCloudflareStatusAction,
  provisionCloudflareDnsAction,
} from "@/lib/actions/cloudflare"
import { toastActionResult } from "@/lib/action-toast"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
import type {
  CloudflareProvisionResult,
  CloudflareStatus,
  ZoneMailAudit,
} from "@/lib/cloudflare/types"
import { cn } from "@/lib/utils"

export function CloudflareDnsPanel({ domainName }: { domainName: string }) {
  const router = useRouter()
  const [cfStatus, setCfStatus] = useState<CloudflareStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [forceOverwrite, setForceOverwrite] = useState(false)
  const [lastResult, setLastResult] = useState<CloudflareProvisionResult | null>(null)
  const [audit, setAudit] = useState<ZoneMailAudit | null>(null)
  const [pending, startTransition] = useTransition()

  useEffect(() => {
    Promise.all([
      getCloudflareStatusAction(),
      auditDomainDnsConflictsAction({ domain: domainName }),
    ])
      .then(([statusRes, auditRes]) => {
        if (statusRes.ok) setCfStatus(statusRes.data)
        if (auditRes.ok) setAudit(auditRes.data)
      })
      .finally(() => setLoading(false))
  }, [domainName])

  function onProvision() {
    startTransition(async () => {
      const res = await provisionCloudflareDnsAction({
        domain: domainName,
        forceOverwrite,
      })
      if (!res.ok) {
        toastActionResult(res, { success: "" })
        return
      }

      setLastResult(res.data)
      // Re-audit to update conflicts state
      const auditRes = await auditDomainDnsConflictsAction({ domain: domainName })
      if (auditRes.ok) setAudit(auditRes.data)

      toastActionResult(res, {
        success: `Cloudflare DNS synchronized for ${domainName}. Dedicated mail target: mail.${domainName}.`,
      })
      router.refresh()
    })
  }

  if (loading) {
    return (
      <div className="rounded-xl border border-border/60 p-4">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <RefreshCw className="size-4 animate-spin" />
          Checking Cloudflare connection and DNS records...
        </div>
      </div>
    )
  }

  if (!cfStatus?.configured) {
    return (
      <div className="rounded-xl border border-dashed border-border/80 p-4 sm:p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <Cloud className="size-5 shrink-0 text-muted-foreground" />
            <div>
              <h3 className="text-sm font-medium">Cloudflare DNS Automation</h3>
              <p className="mt-1 text-xs text-muted-foreground">
                Connect your Cloudflare API token in Settings to enable automated 1-click provisioning of MX, SPF, DKIM, and DMARC records across your accounts.
              </p>
            </div>
          </div>
          <Button
            size="sm"
            variant="outline"
            nativeButton={false}
            render={<Link href="/dashboard/settings" />}
          >
            Configure in Settings
          </Button>
        </div>
      </div>
    )
  }

  const hasConflicts = audit?.hasConflicts ?? false

  return (
    <div className="rounded-xl border border-border/80 bg-card/40 p-4 sm:p-5 space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <Cloud className="size-4 text-amber-500" />
          <h3 className="text-sm font-medium">Cloudflare Automated DNS</h3>
          <Badge variant="outline" className="gap-1 border-amber-500/30 text-[10px] text-amber-600 dark:text-amber-400">
            Active ({cfStatus.accounts.length} account{cfStatus.accounts.length === 1 ? "" : "s"})
          </Badge>
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            onClick={onProvision}
            disabled={pending || (hasConflicts && !forceOverwrite)}
            className="gap-1.5"
          >
            {pending ? (
              <RefreshCw className="size-3.5 animate-spin" />
            ) : (
              <Sparkles className="size-3.5" />
            )}
            {pending
              ? "Syncing DNS..."
              : hasConflicts && forceOverwrite
              ? "Overwrite & Provision"
              : "Auto-Provision / Sync DNS"}
          </Button>
        </div>
      </div>

      <p className="text-xs text-muted-foreground leading-relaxed">
        Provisions dedicated mail records (<code className="font-mono text-[11px]">A</code> and <code className="font-mono text-[11px]">MX</code> pointing to dedicated host <code className="font-mono text-[11px]">mail.{domainName}</code>, <code className="font-mono text-[11px]">SPF</code>, real Stalwart <code className="font-mono text-[11px]">DKIM</code> keys, and <code className="font-mono text-[11px]">DMARC</code>) in your Cloudflare account with DNS-only proxy.
      </p>

      {/* Detection of older / conflicting mail records */}
      {hasConflicts && (
        <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3.5 space-y-2.5">
          <div className="flex items-start gap-2.5 text-amber-600 dark:text-amber-400">
            <AlertTriangle className="size-4 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <h4 className="text-xs font-semibold">
                Older Mail Service Records Detected ({audit?.olderRecords.length} record{audit?.olderRecords.length === 1 ? "" : "s"})
              </h4>
              <p className="text-[11px] text-muted-foreground leading-relaxed">
                Found existing mail records pointing to other providers or legacy exchangers. mailwart will not overwrite or replace them without your explicit permission.
              </p>
            </div>
          </div>

          <div className="space-y-1.5 font-mono text-[11px] pt-1">
            {audit?.olderRecords.map((r, i) => (
              <div
                key={i}
                className="flex flex-wrap items-center justify-between gap-1 rounded bg-background/80 px-2 py-1 border border-border/40 text-[10px]"
              >
                <div>
                  <span className="font-semibold text-foreground">{r.type}</span>{" "}
                  <span className="text-amber-600 dark:text-amber-400">({r.providerDetected || r.category})</span>:{" "}
                  <span className="text-foreground">{r.content}</span>
                </div>
                <span className="text-muted-foreground">{r.reason}</span>
              </div>
            ))}
          </div>

          <div className="flex items-center gap-2 pt-1 border-t border-amber-500/20">
            <Checkbox
              id="cf-permit-overwrite"
              checked={forceOverwrite}
              onCheckedChange={(c) => setForceOverwrite(c === true)}
              disabled={pending}
            />
            <Label
              htmlFor="cf-permit-overwrite"
              className="cursor-pointer text-xs font-medium text-foreground flex items-center gap-1.5"
            >
              <ShieldAlert className="size-3.5 text-amber-500" />
              I permit overwriting and replacing older mail service records for {domainName}
            </Label>
          </div>
        </div>
      )}

      {/* Optional regeneration switch if no external conflicts */}
      {!hasConflicts && (
        <div className="flex items-center gap-2 pt-1">
          <Checkbox
            id="cf-force-dkim"
            checked={forceOverwrite}
            onCheckedChange={(c) => setForceOverwrite(c === true)}
            disabled={pending}
          />
          <Label
            htmlFor="cf-force-dkim"
            className="cursor-pointer text-xs text-muted-foreground"
          >
            Force rewrite existing mailwart DKIM / SPF records
          </Label>
        </div>
      )}

      {lastResult && (
        <div className="rounded-lg border border-border/60 bg-muted/40 p-3 space-y-2 mt-3">
          <div className="flex items-center gap-1.5 text-xs font-medium text-foreground">
            <CheckCircle2 className="size-3.5 text-success" />
            Provisioning results for {lastResult.zoneName}:
          </div>
          <div className="grid gap-1.5 font-mono text-[11px]">
            {lastResult.records.map((r, i) => (
              <div
                key={i}
                className="flex flex-wrap items-center justify-between gap-2 rounded bg-background/80 px-2 py-1 border border-border/40"
              >
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-foreground">{r.type}</span>
                  <span className="text-muted-foreground">{r.name}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Badge
                    variant="outline"
                    className={cn(
                      "text-[9px] uppercase",
                      r.action === "created"
                        ? "border-success/40 text-success"
                        : r.action === "updated"
                        ? "border-amber-500/40 text-amber-500"
                        : r.action === "deleted"
                        ? "border-destructive/40 text-destructive"
                        : "border-border text-muted-foreground"
                    )}
                  >
                    {r.action}
                  </Badge>
                  {r.detail && (
                    <span className="text-[10px] text-muted-foreground hidden sm:inline">
                      {r.detail}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

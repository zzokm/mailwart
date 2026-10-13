"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useEffect, useState, useTransition } from "react"
import { CheckCircle2, Cloud, ExternalLink, RefreshCw, Sparkles } from "lucide-react"

import {
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
} from "@/lib/cloudflare/types"
import { cn } from "@/lib/utils"

export function CloudflareDnsPanel({ domainName }: { domainName: string }) {
  const router = useRouter()
  const [cfStatus, setCfStatus] = useState<CloudflareStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [forceOverwrite, setForceOverwrite] = useState(false)
  const [lastResult, setLastResult] = useState<CloudflareProvisionResult | null>(null)
  const [pending, startTransition] = useTransition()

  useEffect(() => {
    getCloudflareStatusAction()
      .then((res) => {
        if (res.ok) setCfStatus(res.data)
      })
      .finally(() => setLoading(false))
  }, [])

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
      toastActionResult(res, {
        success: `Cloudflare DNS synchronized for ${domainName}.`,
      })
      router.refresh()
    })
  }

  if (loading) {
    return (
      <div className="rounded-xl border border-border/60 p-4">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <RefreshCw className="size-4 animate-spin" />
          Checking Cloudflare connection...
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
                Connect your Cloudflare API token in Settings to enable automated 1-click provisioning of MX, SPF, DKIM, and DMARC records.
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

  return (
    <div className="rounded-xl border border-border/80 bg-card/40 p-4 sm:p-5 space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <Cloud className="size-4 text-amber-500" />
          <h3 className="text-sm font-medium">Cloudflare Automated DNS</h3>
          <Badge variant="outline" className="gap-1 border-amber-500/30 text-[10px] text-amber-600 dark:text-amber-400">
            Active
          </Badge>
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            onClick={onProvision}
            disabled={pending}
            className="gap-1.5"
          >
            {pending ? (
              <RefreshCw className="size-3.5 animate-spin" />
            ) : (
              <Sparkles className="size-3.5" />
            )}
            {pending ? "Syncing DNS..." : "Auto-Provision / Sync to Cloudflare"}
          </Button>
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        Automatically creates or updates the required mail records (<code className="font-mono text-[11px]">MX</code> to <code className="font-mono text-[11px]">{cfStatus.defaultMailHost}</code>, <code className="font-mono text-[11px]">SPF</code>, <code className="font-mono text-[11px]">DKIM</code>, and <code className="font-mono text-[11px]">DMARC</code>) in your Cloudflare account with DNS-only proxy.
      </p>

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
          Regenerate and overwrite existing DKIM keypair if already present in Cloudflare
        </Label>
      </div>

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

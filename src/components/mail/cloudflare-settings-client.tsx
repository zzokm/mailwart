"use client"

import { useState, useTransition } from "react"
import {
  AlertTriangle,
  CheckCircle2,
  Cloud,
  Eye,
  EyeOff,
  Globe,
  Key,
  Plus,
  RefreshCw,
  ShieldAlert,
  Trash2,
} from "lucide-react"

import {
  addCloudflareAccountAction,
  auditNewCloudflareTokenAction,
  removeCloudflareAccountAction,
  testCloudflareAccountAction,
} from "@/lib/actions/cloudflare"
import { toastActionResult } from "@/lib/action-toast"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import type {
  CloudflareAccountSummary,
  CloudflareStatus,
  ZoneMailAudit,
} from "@/lib/cloudflare/types"
import { cn } from "@/lib/utils"

export function CloudflareSettingsClient({
  initial,
}: {
  initial: CloudflareStatus
}) {
  const [status, setStatus] = useState<CloudflareStatus>(initial)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [tokenInput, setTokenInput] = useState("")
  const [accountNameInput, setAccountNameInput] = useState("")
  const [showToken, setShowToken] = useState(false)
  const [overwriteMode, setOverwriteMode] = useState<"overwrite" | "keep">("keep")

  // Audit state during onboarding
  const [auditStep, setAuditStep] = useState<"input" | "review">("input")
  const [auditResult, setAuditResult] = useState<{
    ok: boolean
    accountName: string
    accountId?: string
    totalZonesCount: number
    zonesAudits: ZoneMailAudit[]
    conflictsCount: number
  } | null>(null)

  const [pending, startTransition] = useTransition()
  const [testingId, setTestingId] = useState<string | null>(null)
  const [removingId, setRemovingId] = useState<string | null>(null)

  function openAddDialog() {
    setTokenInput("")
    setAccountNameInput("")
    setShowToken(false)
    setAuditStep("input")
    setAuditResult(null)
    setOverwriteMode("keep")
    setDialogOpen(true)
  }

  function onAuditToken() {
    if (!tokenInput.trim()) return
    startTransition(async () => {
      const res = await auditNewCloudflareTokenAction({
        apiToken: tokenInput.trim(),
      })
      if (!res.ok) {
        toastActionResult(res, { success: "" })
        return
      }

      setAuditResult(res.data)
      setAccountNameInput((prev) => prev.trim() || res.data.accountName)
      setAuditStep("review")

      if (res.data.conflictsCount > 0) {
        toastActionResult(
          {
            ok: true,
            data: null,
            source: res.source,
          },
          {
            success: `Verified! Found ${res.data.totalZonesCount} zone(s). Older mail records detected on ${res.data.conflictsCount} domain(s).`,
          }
        )
      } else {
        toastActionResult(
          {
            ok: true,
            data: null,
            source: res.source,
          },
          {
            success: `Token verified! Found ${res.data.totalZonesCount} clean zone(s).`,
          }
        )
      }
    })
  }

  function onConfirmAddAccount() {
    if (!tokenInput.trim()) return
    startTransition(async () => {
      const res = await addCloudflareAccountAction({
        apiToken: tokenInput.trim(),
        accountName: accountNameInput.trim() || undefined,
        overwriteConflicts: overwriteMode === "overwrite",
      })

      if (!res.ok) {
        toastActionResult(res, { success: "" })
        return
      }

      setStatus(res.data.status)
      setDialogOpen(false)

      const replacedMsg =
        res.data.overwrittenDomains.length > 0
          ? ` Overwrote older mail records on: ${res.data.overwrittenDomains.join(", ")}.`
          : ""

      toastActionResult(res, {
        success: `Cloudflare account connected and domains pooled into mailwart.${replacedMsg}`,
      })
    })
  }

  function onTestAccount(acc: CloudflareAccountSummary) {
    setTestingId(acc.id)
    startTransition(async () => {
      const res = await testCloudflareAccountAction({ accountId: acc.id })
      setTestingId(null)
      if (!res.ok) {
        toastActionResult(res, { success: "" })
        return
      }

      toastActionResult(res, {
        success: `Connection verified for "${res.data.accountName}" (${res.data.zonesCount} active zones pooled).`,
      })
    })
  }

  function onRemoveAccount(acc: CloudflareAccountSummary) {
    if (!confirm(`Are you sure you want to disconnect Cloudflare account "${acc.accountName}"? Pooled domains from this account will no longer auto-sync.`)) {
      return
    }

    setRemovingId(acc.id)
    startTransition(async () => {
      const res = await removeCloudflareAccountAction({ accountId: acc.id })
      setRemovingId(null)
      if (!res.ok) {
        toastActionResult(res, { success: "" })
        return
      }

      setStatus(res.data)
      toastActionResult(res, {
        success: `Cloudflare account "${acc.accountName}" removed.`,
      })
    })
  }

  const conflictingZones = (auditResult?.zonesAudits || []).filter((z) => z.hasConflicts)

  return (
    <div className="space-y-4">
      {/* Overview header */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/40 pb-3">
        <div className="flex items-center gap-2.5">
          <Cloud className="size-4 text-amber-500" />
          <span className="font-medium text-sm">Cloudflare Accounts</span>
          {status.accounts.length > 0 ? (
            <Badge variant="outline" className="border-success/40 text-success gap-1 text-[11px]">
              <CheckCircle2 className="size-3" />
              {status.accounts.length} Connected ({status.totalZonesCount} pooled domains)
            </Badge>
          ) : (
            <Badge variant="outline" className="border-muted-foreground/40 text-muted-foreground text-[11px]">
              No Accounts Connected
            </Badge>
          )}
        </div>

        <Button size="sm" onClick={openAddDialog} className="gap-1.5 text-xs">
          <Plus className="size-3.5" />
          Add Cloudflare Account
        </Button>
      </div>

      {/* Connected Accounts List */}
      {status.accounts.length > 0 ? (
        <div className="space-y-3">
          {status.accounts.map((acc) => (
            <div
              key={acc.id}
              className="rounded-lg border border-border/70 bg-card/60 p-4 space-y-3 transition-colors hover:border-border"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span
                    className={cn(
                      "size-2 shrink-0 rounded-full",
                      acc.status === "active" ? "bg-success" : "bg-destructive"
                    )}
                    aria-hidden
                  />
                  <span className="font-medium text-sm">{acc.accountName}</span>
                  {acc.isEnv && (
                    <Badge variant="secondary" className="font-mono text-[10px] uppercase">
                      env
                    </Badge>
                  )}
                </div>

                <div className="flex items-center gap-1.5">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => onTestAccount(acc)}
                    disabled={pending || testingId === acc.id}
                    className="h-7 text-xs gap-1"
                  >
                    <RefreshCw className={cn("size-3", testingId === acc.id && "animate-spin")} />
                    Test &amp; Sync
                  </Button>
                  {!acc.isEnv && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => onRemoveAccount(acc)}
                      disabled={pending || removingId === acc.id}
                      className="h-7 px-2 text-destructive hover:bg-destructive/10"
                      title="Remove Account"
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  )}
                </div>
              </div>

              <dl className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1 border-t border-border/30 text-xs">
                <div>
                  <dt className="text-muted-foreground text-[11px]">API Token</dt>
                  <dd className="font-mono text-foreground text-xs mt-0.5">{acc.tokenMasked}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground text-[11px]">Pooled Domains</dt>
                  <dd className="font-medium text-foreground text-xs mt-0.5 flex items-center gap-1">
                    <Globe className="size-3 text-muted-foreground" />
                    {acc.zonesCount} zone{acc.zonesCount === 1 ? "" : "s"}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground text-[11px]">Last Verified</dt>
                  <dd className="text-muted-foreground font-mono text-[11px] mt-0.5">
                    {acc.lastVerifiedAt ? new Date(acc.lastVerifiedAt).toLocaleString() : "Never"}
                  </dd>
                </div>
              </dl>

              {acc.errorMessage && (
                <div className="rounded bg-destructive/10 px-2.5 py-1.5 text-[11px] text-destructive">
                  {acc.errorMessage}
                </div>
              )}
            </div>
          ))}
        </div>
      ) : (
        <div className="rounded-lg border border-dashed border-border/70 p-6 text-center space-y-3">
          <Cloud className="size-8 text-muted-foreground/60 mx-auto" />
          <div className="space-y-1">
            <h3 className="text-sm font-medium">No Cloudflare Accounts Connected</h3>
            <p className="text-xs text-muted-foreground max-w-md mx-auto">
              Add your Cloudflare API tokens to pool all your domains, inspect DNS, and enable 1-click dedicated mail provisioning.
            </p>
          </div>
          <Button size="sm" onClick={openAddDialog} className="gap-1.5 text-xs">
            <Plus className="size-3.5" />
            Add First Cloudflare Account
          </Button>
        </div>
      )}

      {/* Onboarding Modal */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Cloud className="size-4 text-amber-500" />
              Add Cloudflare Account / Organization
            </DialogTitle>
            <DialogDescription>
              Connect an API token to discover zones and pool domains into mailwart.
            </DialogDescription>
          </DialogHeader>

          {auditStep === "input" ? (
            <div className="space-y-4 py-2">
              <div className="grid gap-2">
                <Label htmlFor="cf-account-name" className="text-xs">
                  Account / Organization Name (Optional)
                </Label>
                <Input
                  id="cf-account-name"
                  value={accountNameInput}
                  onChange={(e) => setAccountNameInput(e.target.value)}
                  placeholder="e.g. Personal, Work, or Organization"
                  className="text-xs"
                  disabled={pending}
                />
                <p className="text-[11px] text-muted-foreground">
                  If left blank, the account name will be auto-detected from your Cloudflare profile.
                </p>
              </div>

              <div className="grid gap-2">
                <Label htmlFor="cf-new-token" className="text-xs">
                  Cloudflare API Token
                </Label>
                <div className="relative">
                  <Input
                    id="cf-new-token"
                    type={showToken ? "text" : "password"}
                    value={tokenInput}
                    onChange={(e) => setTokenInput(e.target.value)}
                    placeholder="Enter Cloudflare API token with DNS:Edit and Zone:Read"
                    className="font-mono text-xs pr-10"
                    disabled={pending}
                  />
                  <button
                    type="button"
                    onClick={() => setShowToken(!showToken)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    {showToken ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                  </button>
                </div>
              </div>

              {/* Permissions helper */}
              <div className="rounded-lg border border-border/40 bg-muted/30 p-3 text-xs space-y-2 text-muted-foreground">
                <div className="font-medium text-foreground text-[11px]">
                  Required Cloudflare Token Permissions:
                </div>
                <div className="grid grid-cols-2 gap-2 font-mono text-[11px]">
                  <div className="rounded bg-background/80 p-1.5 border border-border/40 flex justify-between">
                    <span>Zone &rarr; Zone</span>
                    <span className="text-primary font-semibold">Read</span>
                  </div>
                  <div className="rounded bg-background/80 p-1.5 border border-border/40 flex justify-between">
                    <span>Zone &rarr; DNS</span>
                    <span className="text-primary font-semibold">Edit</span>
                  </div>
                </div>
                <p className="text-[10px] text-muted-foreground leading-normal">
                  In Cloudflare &rarr; <strong>My Profile &rarr; API Tokens &rarr; Create Custom Token</strong>, under <strong>DNS &amp; Zones</strong>, select <strong>Zone: Read</strong> and <strong>DNS: Edit</strong>, and set Zone Resources to <strong>Include &rarr; All zones</strong>.
                </p>
              </div>

              <DialogFooter className="pt-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setDialogOpen(false)}
                  disabled={pending}
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  onClick={onAuditToken}
                  disabled={pending || !tokenInput.trim()}
                  className="gap-1.5"
                >
                  {pending ? (
                    <RefreshCw className="size-3.5 animate-spin" />
                  ) : (
                    <Key className="size-3.5" />
                  )}
                  {pending ? "Inspecting Zones..." : "Verify & Inspect Zones"}
                </Button>
              </DialogFooter>
            </div>
          ) : (
            <div className="space-y-4 py-2">
              {auditResult && (
                <>
                  <div className="rounded-lg border border-border/60 bg-muted/30 p-3 space-y-1 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">Detected Account:</span>
                      <strong className="text-foreground">{auditResult.accountName}</strong>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">Accessible Zones:</span>
                      <span className="font-mono">{auditResult.totalZonesCount} domain(s)</span>
                    </div>
                  </div>

                  {conflictingZones.length > 0 ? (
                    <div className="space-y-3">
                      <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3.5 space-y-2">
                        <div className="flex items-start gap-2.5 text-amber-600 dark:text-amber-400">
                          <AlertTriangle className="size-4 shrink-0 mt-0.5" />
                          <div className="space-y-1">
                            <h4 className="text-xs font-semibold">
                              Previous Mail Service Records Detected ({conflictingZones.length} domain{conflictingZones.length === 1 ? "" : "s"})
                            </h4>
                            <p className="text-[11px] text-muted-foreground leading-relaxed">
                              We scanned your zones and identified existing mail records (e.g. Google Workspace, Microsoft 365, or previous mail servers). mailwart will never overwrite your records without explicit permission.
                            </p>
                          </div>
                        </div>

                        {/* List of conflicting records */}
                        <div className="max-h-48 overflow-y-auto space-y-2 pt-1 font-mono text-[11px]">
                          {conflictingZones.map((z) => (
                            <div
                              key={z.zoneId}
                              className="rounded border border-amber-500/20 bg-background/90 p-2.5 space-y-1"
                            >
                              <div className="flex items-center justify-between font-semibold text-foreground">
                                <span>{z.zoneName}</span>
                                <Badge variant="outline" className="border-amber-500/40 text-[10px] text-amber-600 dark:text-amber-400">
                                  {z.olderRecords.length} record{z.olderRecords.length === 1 ? "" : "s"} found
                                </Badge>
                              </div>
                              {z.olderRecords.map((r, i) => (
                                <div
                                  key={i}
                                  className="text-[10px] text-muted-foreground flex flex-wrap items-center justify-between gap-1 border-t border-border/20 pt-1"
                                >
                                  <div>
                                    <span className="font-semibold text-foreground">{r.type}</span>{" "}
                                    <span className="text-amber-600 dark:text-amber-400">({r.providerDetected || r.category})</span>:{" "}
                                    <span className="text-foreground">{r.content}</span>
                                  </div>
                                </div>
                              ))}
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Interactive permission choice */}
                      <div className="space-y-2 rounded-lg border border-border/80 bg-card p-3">
                        <div className="text-xs font-medium text-foreground">
                          Choose how to handle existing mail records:
                        </div>
                        <div className="space-y-2 pt-1 text-xs">
                          <label
                            className={cn(
                              "flex items-start gap-2.5 rounded-md border p-2.5 cursor-pointer transition-colors",
                              overwriteMode === "overwrite"
                                ? "border-amber-500/60 bg-amber-500/5 text-foreground"
                                : "border-border/60 hover:bg-muted/40 text-muted-foreground"
                            )}
                          >
                            <input
                              type="radio"
                              name="overwrite-choice"
                              value="overwrite"
                              checked={overwriteMode === "overwrite"}
                              onChange={() => setOverwriteMode("overwrite")}
                              className="mt-0.5"
                            />
                            <div className="space-y-0.5">
                              <span className="font-semibold text-foreground flex items-center gap-1.5">
                                <ShieldAlert className="size-3.5 text-amber-500" />
                                Overwrite &amp; replace older mail records with mailwart
                              </span>
                              <p className="text-[11px] text-muted-foreground leading-normal">
                                Replaces older MX and updates SPF to point to dedicated <code className="font-mono text-[10px]">mail.&lt;domain&gt;</code> DNS-only records. Mail delivery will switch to this mailwart server.
                              </p>
                            </div>
                          </label>

                          <label
                            className={cn(
                              "flex items-start gap-2.5 rounded-md border p-2.5 cursor-pointer transition-colors",
                              overwriteMode === "keep"
                                ? "border-primary/60 bg-primary/5 text-foreground"
                                : "border-border/60 hover:bg-muted/40 text-muted-foreground"
                            )}
                          >
                            <input
                              type="radio"
                              name="overwrite-choice"
                              value="keep"
                              checked={overwriteMode === "keep"}
                              onChange={() => setOverwriteMode("keep")}
                              className="mt-0.5"
                            />
                            <div className="space-y-0.5">
                              <span className="font-semibold text-foreground">
                                Keep existing records (Do not touch)
                              </span>
                              <p className="text-[11px] text-muted-foreground leading-normal">
                                Pools all domains into mailwart, but leaves all existing MX, SPF, and DNS records completely untouched until you manually review or provision each domain.
                              </p>
                            </div>
                          </label>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="rounded-lg border border-success/30 bg-success/5 p-3.5 flex items-start gap-2.5 text-xs text-success">
                      <CheckCircle2 className="size-4 shrink-0 mt-0.5" />
                      <div>
                        <strong>All zones are clean!</strong> No conflicting or older mail service records found across {auditResult.totalZonesCount} accessible domain(s).
                      </div>
                    </div>
                  )}

                  <DialogFooter className="pt-3">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setAuditStep("input")}
                      disabled={pending}
                    >
                      Back
                    </Button>
                    <Button
                      type="button"
                      onClick={onConfirmAddAccount}
                      disabled={pending}
                      className="gap-1.5"
                    >
                      {pending ? (
                        <RefreshCw className="size-3.5 animate-spin" />
                      ) : (
                        <CheckCircle2 className="size-3.5" />
                      )}
                      {pending
                        ? "Saving & Pooling..."
                        : overwriteMode === "overwrite"
                        ? "Confirm & Replace Records"
                        : "Connect & Pool Domains"}
                    </Button>
                  </DialogFooter>
                </>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}

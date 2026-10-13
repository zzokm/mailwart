"use client"

import { useState, useTransition } from "react"
import { CheckCircle2, Cloud, Eye, EyeOff, Key, RefreshCw, Trash2 } from "lucide-react"

import {
  clearCloudflareSettingsAction,
  saveCloudflareSettingsAction,
  testCloudflareTokenAction,
} from "@/lib/actions/cloudflare"
import { toastActionResult } from "@/lib/action-toast"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import type { CloudflareStatus } from "@/lib/cloudflare/types"

export function CloudflareSettingsClient({
  initial,
}: {
  initial: CloudflareStatus
}) {
  const [status, setStatus] = useState<CloudflareStatus>(initial)
  const [tokenInput, setTokenInput] = useState("")
  const [mailHostInput, setMailHostInput] = useState(initial.defaultMailHost || "mail.yehia.dev")
  const [showToken, setShowToken] = useState(false)
  const [editing, setEditing] = useState(!initial.configured)
  const [testResult, setTestResult] = useState<{
    ok: boolean
    accountName?: string
    zonesCount?: number
    error?: string
  } | null>(null)

  const [pending, startTransition] = useTransition()

  function onTest() {
    startTransition(async () => {
      setTestResult(null)
      const res = await testCloudflareTokenAction({
        token: tokenInput.trim() || undefined,
      })
      if (!res.ok) {
        setTestResult({ ok: false, error: res.error })
        toastActionResult(res, { success: "" })
        return
      }

      setTestResult({
        ok: true,
        accountName: res.data.accountName,
        zonesCount: res.data.accessibleZonesCount,
      })
      toastActionResult(res, {
        success: `Cloudflare token valid! Found ${res.data.accessibleZonesCount} accessible zone(s).`,
      })
    })
  }

  function onSave() {
    if (!tokenInput.trim() && !status.configured) return
    startTransition(async () => {
      const res = await saveCloudflareSettingsAction({
        apiToken: tokenInput.trim(),
        defaultMailHost: mailHostInput.trim() || undefined,
      })
      if (!res.ok) {
        toastActionResult(res, { success: "" })
        return
      }

      setStatus(res.data)
      setEditing(false)
      setTokenInput("")
      setTestResult(null)
      toastActionResult(res, {
        success: "Cloudflare DNS settings saved successfully.",
      })
    })
  }

  function onClear() {
    startTransition(async () => {
      const res = await clearCloudflareSettingsAction()
      if (!res.ok) {
        toastActionResult(res, { success: "" })
        return
      }

      setStatus({
        configured: false,
        source: "none",
        defaultMailHost: mailHostInput,
      })
      setEditing(true)
      setTokenInput("")
      setTestResult(null)
      toastActionResult(res, {
        success: "Cloudflare token removed.",
      })
    })
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/40 pb-3">
        <div className="flex items-center gap-2">
          <Cloud className="size-4 text-amber-500" />
          <span className="font-medium text-sm">Status</span>
        </div>
        <div>
          {status.configured ? (
            <Badge variant="outline" className="border-success/40 text-success gap-1 text-[11px]">
              <CheckCircle2 className="size-3" />
              Connected ({status.source})
            </Badge>
          ) : (
            <Badge variant="outline" className="border-muted-foreground/40 text-muted-foreground text-[11px]">
              Not Configured
            </Badge>
          )}
        </div>
      </div>

      {status.configured && !editing ? (
        <div className="space-y-3">
          <dl className="grid gap-2 text-xs">
            <div className="flex justify-between border-b border-border/30 pb-2">
              <dt className="text-muted-foreground">API Token</dt>
              <dd className="font-mono">{status.tokenMasked}</dd>
            </div>
            {status.accountName && (
              <div className="flex justify-between border-b border-border/30 pb-2">
                <dt className="text-muted-foreground">Account Name</dt>
                <dd className="font-medium">{status.accountName}</dd>
              </div>
            )}
            <div className="flex justify-between border-b border-border/30 pb-2">
              <dt className="text-muted-foreground">Default Mail Target</dt>
              <dd className="font-mono">{status.defaultMailHost}</dd>
            </div>
            {status.lastVerifiedAt && (
              <div className="flex justify-between pb-1">
                <dt className="text-muted-foreground">Last Verified</dt>
                <dd className="text-muted-foreground font-mono">
                  {new Date(status.lastVerifiedAt).toLocaleString()}
                </dd>
              </div>
            )}
          </dl>

          <div className="flex flex-wrap items-center gap-2 pt-2">
            <Button
              size="sm"
              variant="outline"
              onClick={onTest}
              disabled={pending}
              className="gap-1.5"
            >
              {pending ? (
                <RefreshCw className="size-3.5 animate-spin" />
              ) : (
                <RefreshCw className="size-3.5" />
              )}
              Test Connection
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setEditing(true)}
              disabled={pending}
            >
              Edit Token
            </Button>
            {status.source === "settings" && (
              <Button
                size="sm"
                variant="destructive"
                onClick={onClear}
                disabled={pending}
                className="gap-1.5"
              >
                <Trash2 className="size-3.5" />
                Remove
              </Button>
            )}
          </div>
        </div>
      ) : (
        <div className="space-y-4 pt-1">
          <div className="grid gap-2">
            <Label htmlFor="cf-token" className="text-xs">
              Cloudflare API Token
            </Label>
            <div className="relative">
              <Input
                id="cf-token"
                type={showToken ? "text" : "password"}
                value={tokenInput}
                onChange={(e) => setTokenInput(e.target.value)}
                placeholder="Enter API token with DNS:Edit and Zone:Read permissions"
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

          <div className="grid gap-2">
            <Label htmlFor="cf-mail-host" className="text-xs">
              Default Mail Server MX Target
            </Label>
            <Input
              id="cf-mail-host"
              value={mailHostInput}
              onChange={(e) => setMailHostInput(e.target.value)}
              placeholder="mail.yehia.dev"
              className="font-mono text-xs"
              disabled={pending}
            />
            <p className="text-[11px] text-muted-foreground">
              Hostname pointed by auto-provisioned MX records (priority 10).
            </p>
          </div>

          {testResult && (
            <div
              className={`rounded-lg p-3 text-xs border ${
                testResult.ok
                  ? "border-success/30 bg-success/5 text-success"
                  : "border-destructive/30 bg-destructive/5 text-destructive"
              }`}
            >
              {testResult.ok ? (
                <div>
                  Token valid! Account: <strong>{testResult.accountName || "Verified"}</strong> ({testResult.zonesCount} zones found).
                </div>
              ) : (
                <div>Error: {testResult.error}</div>
              )}
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2 pt-2">
            <Button
              size="sm"
              variant="outline"
              onClick={onTest}
              disabled={pending || (!tokenInput.trim() && !status.configured)}
              className="gap-1.5"
            >
              {pending ? (
                <RefreshCw className="size-3.5 animate-spin" />
              ) : (
                <Key className="size-3.5" />
              )}
              Test Token
            </Button>

            <Button
              size="sm"
              onClick={onSave}
              disabled={pending || !tokenInput.trim()}
            >
              Save Settings
            </Button>

            {status.configured && (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setEditing(false)
                  setTokenInput("")
                  setTestResult(null)
                }}
                disabled={pending}
              >
                Cancel
              </Button>
            )}
          </div>

          <div className="rounded-lg border border-border/40 bg-muted/30 p-3.5 text-xs space-y-2 text-muted-foreground">
            <div className="font-medium text-foreground">Required Cloudflare Token Permissions (New Cloudflare UI):</div>
            <p className="text-[11px] leading-relaxed">
              In Cloudflare &rarr; <strong>My Profile &rarr; API Tokens &rarr; Create Custom Token</strong>:
            </p>
            <div className="rounded-md border border-border/60 bg-background/80 p-2.5 space-y-1.5 font-mono text-[11px]">
              <div className="flex items-center justify-between text-foreground">
                <span className="font-semibold">Category: DNS &amp; Zones</span>
                <span className="text-[10px] text-muted-foreground font-sans">Permissions</span>
              </div>
              <div className="flex items-center justify-between pl-2 border-l-2 border-primary/60">
                <span>DNS</span>
                <span className="text-primary font-semibold">Edit</span>
              </div>
              <div className="flex items-center justify-between pl-2 border-l-2 border-primary/60">
                <span>Zone</span>
                <span className="text-primary font-semibold">Read</span>
              </div>
            </div>
            <div className="text-[11px] space-y-1 pt-0.5">
              <div className="text-amber-600 dark:text-amber-400 font-medium">
                ⚠️ Important: Do NOT select &ldquo;DNS View&rdquo; or &ldquo;Account DNS Settings&rdquo;.
              </div>
              <p className="text-[10px] text-muted-foreground leading-normal">
                &ldquo;DNS View&rdquo; is for internal Gateway views. To manage public email records (MX, SPF, DKIM, DMARC), scroll down in the <strong>DNS &amp; Zones</strong> list to find <strong>DNS</strong> and select <strong>Edit</strong>, and <strong>Zone</strong> and select <strong>Read</strong>.
              </p>
              <div className="pt-1">
                <strong>Zone Resources:</strong> Set to <code className="font-mono text-[10px]">Include &rarr; All zones</code> (or select specific domains).
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

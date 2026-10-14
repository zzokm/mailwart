"use client"

import { useState } from "react"
import {
  Mail,
  Send,
  Sparkles,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Settings2,
} from "lucide-react"

import { toast } from "sonner"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import type { SystemEmailSenderConfig } from "@/lib/db/system-settings"
import {
  setupNoreplyEmailAction,
  saveSystemEmailSenderAction,
} from "@/lib/actions/users"

interface SystemOutboundSettingsClientProps {
  initialConfig: SystemEmailSenderConfig | null
  availableDomains: string[]
  availableMailboxes: string[]
  isPrimaryAdmin: boolean
}

export function SystemOutboundSettingsClient({
  initialConfig,
  availableDomains,
  availableMailboxes,
  isPrimaryAdmin,
}: SystemOutboundSettingsClientProps) {
  const [config, setConfig] = useState<SystemEmailSenderConfig | null>(
    initialConfig
  )

  // 1-Click Setup state
  const [selectedDomain, setSelectedDomain] = useState<string>(
    availableDomains[0] || ""
  )
  const [isNoreplySettingUp, setIsNoreplySettingUp] = useState(false)

  // Custom / Existing mailbox form state
  const [showCustomForm, setShowCustomForm] = useState(false)
  const [selectedMailbox, setSelectedMailbox] = useState<string>(
    availableMailboxes[0] || ""
  )
  const [customPassword, setCustomPassword] = useState("")
  const [customHost, setCustomHost] = useState("")
  const [customPort, setCustomPort] = useState(587)
  const [customFromName, setCustomFromName] = useState("mailwart")
  const [isSavingCustom, setIsSavingCustom] = useState(false)

  // Handle 1-click noreply setup
  async function handleSetupNoreply() {
    if (!selectedDomain) {
      toast.error("Please select a domain.")
      return
    }

    setIsNoreplySettingUp(true)
    try {
      const res = await setupNoreplyEmailAction(selectedDomain)
      if (!res.ok) {
        toast.error(res.error || "Failed to configure noreply mailbox.")
        return
      }
      if (!res.data) {
        toast.error("Failed to receive mailer configuration.")
        return
      }

      setConfig(res.data)
      toast.success(
        `Noreply mailbox 'noreply@${selectedDomain}' provisioned and set as system sender!`
      )

    } catch {
      toast.error("An unexpected error occurred while setting up noreply.")
    } finally {
      setIsNoreplySettingUp(false)
    }
  }

  // Handle mailbox select change
  function handleMailboxSelect(mailbox: string) {
    setSelectedMailbox(mailbox)
    const parts = mailbox.split("@")
    if (parts.length === 2) {
      setCustomHost(`mail.${parts[1]}`)
    }
  }

  // Save custom / existing mailbox config
  async function handleSaveCustom(e: React.FormEvent) {
    e.preventDefault()
    if (!selectedMailbox || !customPassword) {
      toast.error("Mailbox address and password are required.")
      return
    }

    const domainPart = selectedMailbox.split("@")[1] || ""
    const host = customHost || `mail.${domainPart}`

    setIsSavingCustom(true)
    try {
      const newConfig: SystemEmailSenderConfig = {
        mailboxEmail: selectedMailbox.trim().toLowerCase(),
        domain: domainPart,
        password: customPassword,
        host,
        port: Number(customPort) || 587,
        secure: Number(customPort) === 465,
        fromName: customFromName || "mailwart",
        isNoreply: selectedMailbox.startsWith("noreply@"),
        configuredAt: new Date().toISOString(),
      }

      const res = await saveSystemEmailSenderAction(newConfig)
      if (!res.ok) {
        toast.error(res.error || "Failed to save mailer configuration.")
        return
      }

      setConfig(newConfig)
      toast.success(`System sender updated to '${selectedMailbox}'.`)
      setShowCustomForm(false)
      setCustomPassword("")
    } catch {
      toast.error("Failed to save mailer configuration.")
    } finally {
      setIsSavingCustom(false)
    }
  }

  return (
    <div className="rounded-xl border border-border/80 bg-card/40 p-5 sm:p-6 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Send className="size-4 text-primary" />
            <h2 className="text-sm font-medium">System Outbound Mailer</h2>
            {config ? (
              <Badge
                variant="outline"
                className="border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-mono text-[10px]"
              >
                Active
              </Badge>
            ) : (
              <Badge
                variant="outline"
                className="border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400 text-[10px]"
              >
                Not Configured
              </Badge>
            )}
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Dispatches transactional system emails such as 6-digit OTP verification codes and password reset links.
          </p>
        </div>

        {isPrimaryAdmin && (
          <Button
            size="sm"
            variant="outline"
            onClick={() => setShowCustomForm((p) => !p)}
            className="text-xs gap-1.5 self-start sm:self-auto"
          >
            <Settings2 className="size-3.5" />
            {showCustomForm ? "Hide Custom Setup" : "Manual / Existing Mailbox"}
          </Button>
        )}
      </div>

      {/* Current Configuration Summary */}
      {config ? (
        <div className="rounded-lg border border-border/70 bg-background/60 p-4 space-y-2">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="size-4 text-emerald-500 shrink-0" />
              <span className="font-mono text-xs font-semibold text-foreground">
                {config.mailboxEmail}
              </span>
              <Badge variant="secondary" className="text-[10px]">
                {config.isNoreply ? "Dedicated noreply" : "Custom Mailbox"}
              </Badge>
            </div>
            <span className="text-[11px] text-muted-foreground font-mono">
              SMTP: {config.host}:{config.port} (STARTTLS)
            </span>
          </div>
          <p className="text-[11px] text-muted-foreground">
            From name: &quot;{config.fromName || "mailwart"}&quot; &bull; Configured on{" "}
            {config.configuredAt
              ? new Date(config.configuredAt).toLocaleDateString(undefined, {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                })
              : "Recently"}
          </p>

        </div>
      ) : (
        <div className="rounded-lg border border-amber-500/25 bg-amber-500/5 p-4 flex items-start gap-3">
          <AlertCircle className="size-4 text-amber-500 shrink-0 mt-0.5" />
          <div className="text-xs space-y-1">
            <p className="font-medium text-amber-700 dark:text-amber-300">
              No system outbound sender configured
            </p>
            <p className="text-muted-foreground">
              Users cannot receive password reset verification OTPs until a system sender mailbox is configured. Use the 1-click noreply setup below to provision one instantly.
            </p>
          </div>
        </div>
      )}

      {/* 1-Click Noreply Setup Section */}
      {isPrimaryAdmin && availableDomains.length > 0 && (
        <div className="rounded-lg border border-primary/20 bg-primary/[0.03] p-4 sm:p-5 space-y-3">
          <div className="flex items-center gap-2">
            <Sparkles className="size-4 text-primary" />
            <h3 className="text-xs font-semibold text-foreground">
              1-Click Setup Noreply Mailbox
            </h3>
          </div>
          <p className="text-xs text-muted-foreground">
            Instantly creates <code className="font-mono text-foreground">noreply@&lt;domain&gt;</code> on Stalwart, securely stores credentials in PostgreSQL, and configures STARTTLS SMTP transport for outbound OTP codes.
          </p>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 pt-1">
            <div className="w-full sm:w-64">
              <select
                value={selectedDomain}
                onChange={(e) => setSelectedDomain(e.target.value)}
                disabled={isNoreplySettingUp}
                className="w-full h-8 px-2.5 text-xs font-mono rounded-md border border-border bg-background text-foreground outline-none focus:border-primary focus:ring-1 focus:ring-primary"
              >
                {availableDomains.map((d) => (
                  <option key={d} value={d}>
                    @{d}
                  </option>
                ))}
              </select>
            </div>
            <Button
              type="button"
              size="sm"
              onClick={handleSetupNoreply}
              disabled={isNoreplySettingUp || !selectedDomain}
              className="gap-1.5"
            >
              {isNoreplySettingUp ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <Sparkles className="size-3.5" />
              )}
              Setup Noreply on @{selectedDomain || "domain"}
            </Button>
          </div>
        </div>
      )}

      {/* Custom / Existing Mailbox Form */}
      {showCustomForm && isPrimaryAdmin && (
        <form
          onSubmit={handleSaveCustom}
          className="rounded-lg border border-border/80 bg-background/50 p-4 sm:p-5 space-y-4"
        >
          <div className="flex items-center gap-2">
            <Mail className="size-4 text-muted-foreground" />
            <h3 className="text-xs font-semibold text-foreground">
              Choose Existing Mailbox or Custom SMTP
            </h3>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="custom-mailbox-select">Mailbox Email</Label>
              {availableMailboxes.length > 0 ? (
                <select
                  id="custom-mailbox-select"
                  value={selectedMailbox}
                  onChange={(e) => handleMailboxSelect(e.target.value)}
                  disabled={isSavingCustom}
                  className="w-full h-9 px-2.5 text-xs font-mono rounded-md border border-border bg-background text-foreground outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                >
                  {availableMailboxes.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
              ) : (
                <Input
                  id="custom-mailbox-select"
                  placeholder="admin@domain.com"
                  value={selectedMailbox}
                  onChange={(e) => setSelectedMailbox(e.target.value)}
                  disabled={isSavingCustom}
                  required
                />
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="custom-mailbox-password">Mailbox Password</Label>
              <Input
                id="custom-mailbox-password"
                type="password"
                placeholder="••••••••••••"
                value={customPassword}
                onChange={(e) => setCustomPassword(e.target.value)}
                disabled={isSavingCustom}
                required
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="custom-smtp-host">SMTP Host</Label>
              <Input
                id="custom-smtp-host"
                placeholder="mail.domain.com"
                value={customHost}
                onChange={(e) => setCustomHost(e.target.value)}
                disabled={isSavingCustom}
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1.5">
                <Label htmlFor="custom-smtp-port">Port</Label>
                <Input
                  id="custom-smtp-port"
                  type="number"
                  value={customPort}
                  onChange={(e) => setCustomPort(Number(e.target.value))}
                  disabled={isSavingCustom}
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="custom-from-name">From Name</Label>
                <Input
                  id="custom-from-name"
                  placeholder="mailwart"
                  value={customFromName}
                  onChange={(e) => setCustomFromName(e.target.value)}
                  disabled={isSavingCustom}
                />
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 pt-2">
            <Button
              type="submit"
              size="sm"
              disabled={isSavingCustom || !selectedMailbox || !customPassword}
            >
              {isSavingCustom ? (
                <Loader2 className="size-3.5 animate-spin mr-1.5" />
              ) : null}
              Save Configuration
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => setShowCustomForm(false)}
              disabled={isSavingCustom}
            >
              Cancel
            </Button>
          </div>
        </form>
      )}
    </div>
  )
}

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
  ArrowRightLeft,
  RefreshCw,
  MailCheck,
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
  changeNoreplyDomainAction,
  sendTestVerificationEmailAction,
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

  // 1-Click Setup state (shown only when no config exists)
  const [selectedDomain, setSelectedDomain] = useState<string>(
    availableDomains[0] || ""
  )
  const [isNoreplySettingUp, setIsNoreplySettingUp] = useState(false)

  // Domain Migration state (switch noreply domain on existing configuration)
  const otherDomains = availableDomains.filter(
    (d) => !config || d.toLowerCase() !== config.domain.toLowerCase()
  )
  const [showDomainMigrate, setShowDomainMigrate] = useState(false)
  const [migrateDomain, setMigrateDomain] = useState<string>(
    otherDomains[0] || availableDomains[0] || ""
  )
  const [isMigratingDomain, setIsMigratingDomain] = useState(false)

  // Test Outbound deliverability & verification sample state
  const [testTargetEmail, setTestTargetEmail] = useState("yyehia.elzokm@gmail.com")
  const [testCode, setTestCode] = useState(() =>
    Math.floor(100000 + Math.random() * 900000).toString()
  )
  const [isSendingTest, setIsSendingTest] = useState(false)
  const [testResult, setTestResult] = useState<{
    success: boolean
    messageId?: string
    to?: string
    code?: string
    senderEmail?: string
    host?: string
    error?: string
  } | null>(null)

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
      // Update migrateDomain default
      const remaining = availableDomains.filter(
        (d) => d.toLowerCase() !== res.data!.domain.toLowerCase()
      )
      if (remaining.length > 0) {
        setMigrateDomain(remaining[0])
      }
      toast.success(
        `Noreply mailbox 'noreply@${selectedDomain}' provisioned and set as system sender!`
      )
    } catch {
      toast.error("An unexpected error occurred while setting up noreply.")
    } finally {
      setIsNoreplySettingUp(false)
    }
  }

  // Handle domain migration
  async function handleMigrateDomain() {
    if (!migrateDomain) {
      toast.error("Please select a target domain.")
      return
    }

    setIsMigratingDomain(true)
    try {
      const res = await changeNoreplyDomainAction(migrateDomain)
      if (!res.ok) {
        toast.error(res.error || "Failed to migrate noreply domain.")
        return
      }
      if (!res.data) {
        toast.error("Failed to receive updated mailer configuration.")
        return
      }

      setConfig(res.data)
      setShowDomainMigrate(false)
      const remaining = availableDomains.filter(
        (d) => d.toLowerCase() !== res.data!.domain.toLowerCase()
      )
      if (remaining.length > 0) {
        setMigrateDomain(remaining[0])
      }
      toast.success(
        `Noreply mailbox migrated to 'noreply@${migrateDomain}'! Old mailbox removed.`
      )
    } catch {
      toast.error("An unexpected error occurred while changing domain.")
    } finally {
      setIsMigratingDomain(false)
    }
  }

  // Randomize 6-digit test code
  function generateNewRandomCode() {
    const newCode = Math.floor(100000 + Math.random() * 900000).toString()
    setTestCode(newCode)
  }

  // Handle live test verification email
  async function handleSendTestEmail() {
    if (!testTargetEmail || !testTargetEmail.includes("@")) {
      toast.error("Please enter a valid recipient email address.")
      return
    }

    if (!testCode || testCode.length !== 6) {
      toast.error("Verification code must be exactly 6 digits.")
      return
    }

    setIsSendingTest(true)
    setTestResult(null)
    try {
      const res = await sendTestVerificationEmailAction({
        to: testTargetEmail,
        code: testCode,
      })

      if (!res.ok) {
        setTestResult({
          success: false,
          error: res.error || "Failed to dispatch test verification email.",
        })
        toast.error(res.error || "Failed to send test email.")
        return
      }

      const data = res.data!
      setTestResult({
        success: true,
        messageId: data.messageId,
        to: data.to,
        code: data.code,
        senderEmail: data.senderEmail,
        host: data.host,
      })
      toast.success(`Verification email sent to ${testTargetEmail}!`)
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to dispatch test email."
      setTestResult({
        success: false,
        error: msg,
      })
      toast.error(msg)
    } finally {
      setIsSendingTest(false)
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
        <div className="rounded-lg border border-border/70 bg-background/60 p-4 space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div className="flex items-center gap-2 flex-wrap">
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

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-[11px] text-muted-foreground">
            <p>
              From name: &quot;{config.fromName || "mailwart"}&quot; &bull; Configured on{" "}
              {config.configuredAt
                ? new Date(config.configuredAt).toLocaleDateString(undefined, {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  })
                : "Recently"}
            </p>

            {isPrimaryAdmin && otherDomains.length > 0 && (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => setShowDomainMigrate((p) => !p)}
                className="h-7 text-xs gap-1.5 px-2 self-start sm:self-auto text-primary hover:text-primary hover:bg-primary/10"
              >
                <ArrowRightLeft className="size-3.5" />
                {showDomainMigrate ? "Cancel Edit" : "Change Domain"}
              </Button>
            )}
          </div>

          {/* Inline Noreply Domain Migration */}
          {showDomainMigrate && isPrimaryAdmin && (
            <div className="pt-3 border-t border-border/60 mt-2 space-y-2.5">
              <div className="flex items-center gap-1.5 text-xs font-medium text-foreground">
                <ArrowRightLeft className="size-3.5 text-primary" />
                <span>Change Noreply Domain</span>
              </div>
              <p className="text-[11px] text-muted-foreground">
                Removes the mailbox on <code className="font-mono text-foreground">{config.domain}</code>, provisions <code className="font-mono text-foreground">noreply@&lt;newDomain&gt;</code> on Stalwart using the same abstracted credentials, and updates the outbound sender.
              </p>

              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 pt-1">
                <select
                  value={migrateDomain}
                  onChange={(e) => setMigrateDomain(e.target.value)}
                  disabled={isMigratingDomain}
                  className="w-full sm:w-60 h-8 px-2.5 text-xs font-mono rounded-md border border-border bg-background text-foreground outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                >
                  {otherDomains.map((d) => (
                    <option key={d} value={d}>
                      @{d}
                    </option>
                  ))}
                </select>
                <Button
                  type="button"
                  size="sm"
                  onClick={handleMigrateDomain}
                  disabled={isMigratingDomain || !migrateDomain}
                  className="gap-1.5 h-8 text-xs"
                >
                  {isMigratingDomain ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    <ArrowRightLeft className="size-3.5" />
                  )}
                  Migrate to @{migrateDomain}
                </Button>
              </div>
            </div>
          )}
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

      {/* 1-Click Noreply Setup Section: Automatically removed/hidden once a mailbox is configured */}
      {isPrimaryAdmin && !config && availableDomains.length > 0 && (
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

      {/* Deliverability & Verification Sample Test Section */}
      {isPrimaryAdmin && (
        <div className="rounded-lg border border-border/80 bg-background/50 p-4 sm:p-5 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <MailCheck className="size-4 text-primary" />
              <h3 className="text-xs font-semibold text-foreground">
                Deliverability & Verification Code Test
              </h3>
            </div>
            <Badge variant="outline" className="text-[10px] self-start sm:self-auto font-mono">
              Live SMTP Dispatch
            </Badge>
          </div>

          <p className="text-xs text-muted-foreground">
            Test outbound deliverability and inbox placement of transactional OTP verification emails. Enter any target email address and 6-digit code to simulate live dispatch through Stalwart.
          </p>

          <div className="grid gap-4 lg:grid-cols-12 items-start">
            {/* Input Controls Form */}
            <div className="lg:col-span-6 space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="test-target-email" className="text-xs">
                  Target Recipient Email
                </Label>
                <div className="flex gap-2">
                  <Input
                    id="test-target-email"
                    type="email"
                    placeholder="yyehia.elzokm@gmail.com"
                    value={testTargetEmail}
                    onChange={(e) => setTestTargetEmail(e.target.value)}
                    disabled={isSendingTest}
                    className="text-xs font-mono h-9"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setTestTargetEmail("yyehia.elzokm@gmail.com")}
                    disabled={isSendingTest}
                    className="text-[11px] h-9 px-2.5 shrink-0"
                    title="Set to primary email"
                  >
                    Primary Email
                  </Button>
                </div>
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label htmlFor="test-code" className="text-xs">
                    6-Digit Verification Code
                  </Label>
                  <button
                    type="button"
                    onClick={generateNewRandomCode}
                    disabled={isSendingTest}
                    className="text-[11px] text-primary hover:underline flex items-center gap-1 font-sans"
                  >
                    <RefreshCw className="size-3" />
                    Randomize
                  </button>
                </div>
                <Input
                  id="test-code"
                  type="text"
                  maxLength={6}
                  placeholder="654321"
                  value={testCode}
                  onChange={(e) => {
                    const cleaned = e.target.value.replace(/[^0-9]/g, "").slice(0, 6)
                    setTestCode(cleaned)
                  }}
                  disabled={isSendingTest}
                  className="text-base font-mono tracking-widest text-center font-bold h-9"
                />
              </div>

              <Button
                type="button"
                onClick={handleSendTestEmail}
                disabled={isSendingTest || !testTargetEmail || !testCode || !config}
                className="w-full gap-2 text-xs"
              >
                {isSendingTest ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <Send className="size-3.5" />
                )}
                {isSendingTest ? "Dispatching via SMTP..." : "Send Test Verification Email"}
              </Button>

              {!config && (
                <p className="text-[11px] text-amber-500">
                  Configure a system outbound mailbox above to enable live test dispatch.
                </p>
              )}

              {/* Delivery Result Feedback */}
              {testResult && (
                <div
                  className={`rounded-lg border p-3 text-xs space-y-1.5 ${
                    testResult.success
                      ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                      : "border-destructive/30 bg-destructive/10 text-destructive"
                  }`}
                >
                  <div className="flex items-center gap-1.5 font-medium">
                    {testResult.success ? (
                      <CheckCircle2 className="size-4 shrink-0 text-emerald-500" />
                    ) : (
                      <AlertCircle className="size-4 shrink-0 text-destructive" />
                    )}
                    <span>
                      {testResult.success
                        ? "Email Dispatched Successfully!"
                        : "Email Dispatch Failed"}
                    </span>
                  </div>
                  {testResult.success ? (
                    <div className="text-[11px] space-y-0.5 opacity-90 font-mono">
                      <p>Recipient: {testResult.to}</p>
                      <p>Code: {testResult.code}</p>
                      <p>Sender: {testResult.senderEmail}</p>
                      {testResult.messageId && (
                        <p className="truncate">Message ID: {testResult.messageId}</p>
                      )}
                      <p className="font-sans text-[10px] mt-1 text-muted-foreground">
                        Dispatched via STARTTLS SMTP. Please check your inbox (and spam folder if SPF/DKIM was newly added).
                      </p>
                    </div>
                  ) : (
                    <p className="text-[11px]">{testResult.error}</p>
                  )}
                </div>
              )}
            </div>

            {/* Interactive Email Preview Sample */}
            <div className="lg:col-span-6 space-y-2">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span className="font-medium">Live Email Preview Sample</span>
                <span className="font-mono text-[10px]">HTML Mockup</span>
              </div>

              <div className="rounded-lg border border-border bg-card p-4 text-card-foreground shadow-sm space-y-3 font-sans">
                <div className="flex items-center justify-between border-b border-border/60 pb-2">
                  <div className="flex items-center gap-1.5">
                    <span className="font-bold text-sm tracking-tight text-foreground">
                      mailwart
                    </span>
                    <Badge variant="outline" className="text-[9px] px-1.5 py-0 border-primary/40 text-primary">
                      Security
                    </Badge>
                  </div>
                  <span className="text-[10px] text-muted-foreground font-mono">
                    {config?.mailboxEmail || "noreply@domain.com"}
                  </span>
                </div>

                <div className="space-y-1">
                  <p className="text-xs font-semibold text-foreground">
                    Password Reset Verification Code
                  </p>
                  <p className="text-[11px] text-muted-foreground leading-relaxed">
                    Hello, you requested a one-time verification code to update your account password. Use the verification code below to proceed:
                  </p>
                </div>

                {/* Big Verification Code Box */}
                <div className="my-2 rounded-md border border-primary/30 bg-primary/5 p-3 text-center">
                  <div className="font-mono text-xl font-bold tracking-[0.25em] text-primary">
                    {testCode ? testCode.split("").join(" ") : "• • • • • •"}
                  </div>
                  <p className="text-[10px] text-muted-foreground mt-1">
                    Valid for 15 minutes &bull; Do not share this code
                  </p>
                </div>

                <p className="text-[10px] text-muted-foreground">
                  If you didn&apos;t request this verification code, you can safely ignore this email.
                </p>

                <div className="border-t border-border/60 pt-2 text-[10px] text-muted-foreground/80 flex items-center justify-between">
                  <span>Sent to: {testTargetEmail || "recipient@example.com"}</span>
                  <span>mailwart System Service</span>
                </div>
              </div>
            </div>
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

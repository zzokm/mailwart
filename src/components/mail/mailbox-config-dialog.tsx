"use client"

import { useState } from "react"
import { Check, Copy, ExternalLink, Globe, Lock, Mail, Server, ShieldCheck } from "lucide-react"
import { toast } from "sonner"

import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { formatBytes, quotaSummary } from "@/lib/format"
import { buildRoundcubeUrl } from "@/lib/roundcube-client"
import type { StalwartAccount } from "@/lib/stalwart/types"

function ConfigFieldBox({
  label,
  value,
  helper,
  displayValue,
}: {
  label: string
  value: string
  helper?: string
  displayValue?: string
}) {
  const [copied, setCopied] = useState(false)

  const handleCopy = async (e?: React.MouseEvent) => {
    e?.stopPropagation()
    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)
      toast.success(`Copied ${label} to clipboard`, {
        description: value,
      })
      setTimeout(() => setCopied(false), 2000)
    } catch {
      toast.error("Failed to copy to clipboard")
    }
  }

  return (
    <div
      onClick={handleCopy}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault()
          handleCopy()
        }
      }}
      className="group relative flex cursor-pointer items-center justify-between gap-3 rounded-lg border border-border/80 bg-muted/20 px-3 py-2.5 transition-all hover:border-primary/50 hover:bg-muted/40 active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      title={`Click anywhere to copy ${label}`}
    >
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] font-semibold tracking-wider text-muted-foreground uppercase">
            {label}
          </span>
          {copied ? (
            <span className="font-mono text-[10px] font-medium text-emerald-600 dark:text-emerald-400">
              Copied!
            </span>
          ) : null}
        </div>
        <span className="truncate font-mono text-[13px] font-medium text-foreground select-all">
          {displayValue ?? value}
        </span>
        {helper ? (
          <span className="text-[11px] text-muted-foreground/80">{helper}</span>
        ) : null}
      </div>
      <Button
        type="button"
        size="icon-xs"
        variant="ghost"
        onClick={handleCopy}
        className="size-7 shrink-0 text-muted-foreground transition-colors group-hover:text-foreground"
        title="Copy to clipboard"
      >
        {copied ? (
          <Check className="size-3.5 text-emerald-500 scale-110 transition-transform" />
        ) : (
          <Copy className="size-3.5 transition-transform group-hover:scale-105" />
        )}
      </Button>
    </div>
  )
}

export function MailboxConfigDialog({
  account,
  open,
  onOpenChange,
}: {
  account: StalwartAccount | null
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  if (!account) return null

  const domain =
    account.domainName ??
    (account.email.includes("@") ? account.email.split("@")[1] : "")
  const mailHost = `mail.${domain}`
  const summary = quotaSummary(account.quotas)
  const roundcubeUrl = buildRoundcubeUrl(account.email)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[88dvh] sm:max-w-4xl lg:max-w-5xl flex flex-col p-0 overflow-hidden gap-0 border border-border/80 shadow-2xl">
        {/* Fixed Landscape Header with Actions */}
        <div className="sticky top-0 z-20 flex shrink-0 items-center justify-between border-b border-border/80 bg-background/95 px-6 py-4 backdrop-blur-md">
          <div className="flex items-center gap-3">
            <div className="flex size-9 items-center justify-center rounded-lg border border-border bg-muted/30">
              <Mail className="size-4.5 text-foreground" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <DialogTitle className="text-base font-semibold leading-tight">
                  Mailbox Configuration
                </DialogTitle>
                <Badge
                  variant={account.isEnabled === false ? "destructive" : "outline"}
                  className="font-mono text-[10px]"
                >
                  {account.isEnabled === false ? "Suspended" : "Active"}
                </Badge>
              </div>
              <div className="font-mono text-xs text-muted-foreground">
                {account.email}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              nativeButton={false}
              render={
                <a
                  href={roundcubeUrl}
                  target="_blank"
                  rel="noreferrer"
                />
              }
            >
              <ExternalLink className="size-3.5" data-icon="inline-start" />
              Open Webmail
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => onOpenChange(false)}
            >
              Done
            </Button>
          </div>
        </div>

        {/* Scrollable Landscape Body with 3-Column Layout */}
        <div className="flex-1 min-h-0 overflow-y-auto px-6 py-5 space-y-6">
          {/* Top 3-Column Landscape Grid */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {/* Column 1: General & Account Info */}
            <div className="space-y-2.5">
              <span className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                <Globe className="size-3.5" /> General & Account Info
              </span>
              <div className="space-y-2">
                <ConfigFieldBox
                  label="Email Address"
                  value={account.email}
                  helper="Primary mailbox address"
                />
                <ConfigFieldBox
                  label="Username / Login"
                  value={account.email}
                  helper="Always use full address to authenticate"
                />
                <ConfigFieldBox
                  label="Domain"
                  value={domain}
                  helper="Configured sending domain"
                />
                <ConfigFieldBox
                  label="Allocated Storage"
                  value={summary.label}
                  displayValue={`${formatBytes(summary.used)} / ${summary.label}`}
                  helper="Used storage / Total allocation"
                />
              </div>
            </div>

            {/* Column 2: Incoming Mail Server */}
            <div className="space-y-2.5">
              <span className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                <Server className="size-3.5" /> Incoming Mail (IMAP / POP3)
              </span>
              <div className="space-y-2">
                <ConfigFieldBox
                  label="IMAP Server Host"
                  value={mailHost}
                  helper="Encrypted incoming mail host"
                />
                <ConfigFieldBox
                  label="IMAP Port"
                  value="993"
                  helper="Security: SSL / TLS"
                />
                <ConfigFieldBox
                  label="POP3 Server Host"
                  value={mailHost}
                  helper="Optional POP3 retrieval host"
                />
                <ConfigFieldBox
                  label="POP3 Port"
                  value="995"
                  helper="Security: SSL / TLS"
                />
              </div>
            </div>

            {/* Column 3: Outgoing Mail Server */}
            <div className="space-y-2.5">
              <span className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                <Lock className="size-3.5" /> Outgoing Mail (SMTP)
              </span>
              <div className="space-y-2">
                <ConfigFieldBox
                  label="SMTP Server Host"
                  value={mailHost}
                  helper="Outgoing submission host"
                />
                <ConfigFieldBox
                  label="SMTP Port (SSL/TLS)"
                  value="465"
                  helper="Recommended implicit TLS"
                />
                <ConfigFieldBox
                  label="SMTP Port (STARTTLS)"
                  value="587"
                  helper="Alternative explicit STARTTLS"
                />
                <ConfigFieldBox
                  label="SMTP Authentication"
                  value="Required"
                  helper="Same username & password as incoming"
                />
              </div>
            </div>
          </div>

          {/* Bottom 2-Column Row: Webmail & Security */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5 pt-1 border-t border-border/70">
            {/* Webmail & Protocols */}
            <div className="space-y-2.5">
              <span className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                <ExternalLink className="size-3.5" /> Webmail & Modern Protocols
              </span>
              <div className="space-y-2">
                <ConfigFieldBox
                  label="Webmail URL"
                  value={`https://${mailHost}`}
                  helper="Roundcube webmail login portal"
                />
                <ConfigFieldBox
                  label="JMAP Endpoint"
                  value={`https://${mailHost}/.well-known/jmap`}
                  helper="Modern JMAP protocol connection URL"
                />
              </div>
            </div>

            {/* Password & Security Notice Card */}
            <div className="space-y-2.5">
              <span className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                <ShieldCheck className="size-3.5" /> Password & Security
              </span>
              <div className="rounded-lg border border-border/80 bg-muted/15 p-3.5 h-[calc(100%-1.75rem)] flex flex-col justify-center">
                <div className="flex items-start gap-2.5">
                  <ShieldCheck className="mt-0.5 size-4.5 shrink-0 text-muted-foreground" />
                  <div className="space-y-1.5 text-xs text-muted-foreground">
                    <p className="font-medium text-foreground">
                      Encrypted Password Security
                    </p>
                    <p>
                      Passwords are cryptographically hashed and never stored or displayed in plaintext.
                      To change or reset the password for this mailbox, use the{" "}
                      <span className="font-semibold text-foreground">Edit</span> button
                      in the actions column.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between pt-1 border-t border-border/60 text-[11px] text-muted-foreground">
            <span>Tip: Click anywhere on any field box to copy its value immediately.</span>
            <span>All ports support standard SSL/TLS encryption.</span>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

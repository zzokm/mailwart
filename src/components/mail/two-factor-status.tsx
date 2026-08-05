"use client"

import { ExternalLink, ShieldCheck, ShieldOff, ShieldQuestion } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import type { TwoFactorStatus } from "@/lib/stalwart/types"

export function TwoFactorStatusPanel({
  status,
  adminUiUrl,
}: {
  status: TwoFactorStatus
  adminUiUrl: string
}) {
  const Icon =
    status.state === "enabled"
      ? ShieldCheck
      : status.state === "disabled"
        ? ShieldOff
        : ShieldQuestion

  const label =
    status.state === "enabled"
      ? "2FA enabled"
      : status.state === "disabled"
        ? "2FA off"
        : "2FA unknown"

  return (
    <section className="space-y-3 rounded-xl border border-border/80 p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-medium">Two-factor status</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Read-only probe of Password / OtpAuth credentials on this mailbox.
          </p>
        </div>
        <Badge
          variant={
            status.state === "enabled"
              ? "default"
              : status.state === "disabled"
                ? "outline"
                : "secondary"
          }
          className="font-mono text-[10px]"
        >
          <Icon data-icon="inline-start" />
          {label}
        </Badge>
      </div>

      {status.state === "unknown" ? (
        <div className="rounded-lg border border-dashed border-border/70 bg-muted/10 px-3 py-3 text-xs text-muted-foreground">
          <p>
            {status.note ??
              "TODO: Confirm live Account credentials OtpAuth shape before enabling manage actions."}
          </p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="mt-3"
            nativeButton={false}
            render={
              <a href={adminUiUrl} target="_blank" rel="noreferrer" />
            }
          >
            <ExternalLink data-icon="inline-start" />
            Open Stalwart Admin
          </Button>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">
          {status.state === "enabled"
            ? "TOTP is present on the primary password credential. Enrollment changes stay in Stalwart Admin / self-service."
            : "No OTP URI detected on the primary credential."}
        </p>
      )}
    </section>
  )
}

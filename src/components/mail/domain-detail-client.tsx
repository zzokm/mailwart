"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"
import {
  destroyDomainAction,
  updateCatchAllAction,
  updateDomainAction,
  updateMailExchangerAction,
} from "@/lib/actions/mail"
import { toastActionResult } from "@/lib/action-toast"
import { ConfirmDestroy } from "@/components/mail/confirm-destroy"
import { CloudflareDnsPanel } from "@/components/mail/cloudflare-dns-panel"
import { DnsHealthPanel } from "@/components/mail/dns-health-panel"
import { DnsRecordGenerator } from "@/components/mail/dns-record-generator"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  deriveCatchAllMode,
  deriveMailExchanger,
} from "@/lib/stalwart/routing-utils"
import type {
  CatchAllMode,
  DnsHealthSummary,
  MailExchangerMode,
  StalwartAccount,
  StalwartDomain,
} from "@/lib/stalwart/types"
import { cn } from "@/lib/utils"

const CATCH_ALL_MODE_LABEL: Record<CatchAllMode, string> = {
  address: "Deliver to address",
  bounce: "Bounce (fail)",
  blackhole: "Blackhole",
}

export function DomainDetailClient({
  domain,
  mailboxes,
  dns,
}: {
  domain: StalwartDomain
  mailboxes: StalwartAccount[]
  dns: DnsHealthSummary
}) {
  const router = useRouter()
  const [description, setDescription] = useState(domain.description ?? "")
  const [enabled, setEnabled] = useState(domain.isEnabled !== false)
  const [catchMode, setCatchMode] = useState<CatchAllMode>(() =>
    deriveCatchAllMode(domain)
  )
  const [catchAll, setCatchAll] = useState(domain.catchAllAddress ?? "")
  const [mxMode, setMxMode] = useState<MailExchangerMode>(() =>
    deriveMailExchanger(domain)
  )
  const [pending, startTransition] = useTransition()
  const [destroyOpen, setDestroyOpen] = useState(false)
  const [forceDestroy, setForceDestroy] = useState(false)

  function save() {
    startTransition(async () => {
      const descResult = await updateDomainAction(domain.id, {
        description: description.trim() || domain.name,
        isEnabled: enabled,
      })
      if (!toastActionResult(descResult, { success: "" })) {
        return
      }

      const catchResult = await updateCatchAllAction(domain.id, {
        mode: catchMode,
        address: catchMode === "address" ? catchAll || null : null,
      })
      if (!toastActionResult(catchResult, { success: "" })) {
        return
      }

      const mxResult = await updateMailExchangerAction(domain.id, mxMode)
      if (
        !toastActionResult(mxResult, {
          success: `Updated ${domain.name}.`,
          note: catchResult.ok ? catchResult.data.note : undefined,
        })
      ) {
        return
      }

      router.refresh()
    })
  }

  function toggleSuspend() {
    const next = !enabled
    setEnabled(next)
    startTransition(async () => {
      const result = await updateDomainAction(domain.id, {
        isEnabled: next,
      })
      if (
        !toastActionResult(result, {
          success: next
            ? `Enabled ${domain.name}.`
            : `Suspended ${domain.name}.`,
        })
      ) {
        setEnabled(!next)
        return
      }
      router.refresh()
    })
  }

  return (
    <div className="space-y-8">
      <div className="grid gap-8 lg:grid-cols-[1.2fr_1fr]">
        <section className="space-y-5 rounded-xl border border-border/80 p-4 sm:p-5">
          <div className="grid gap-2">
            <Label htmlFor="desc">Description</Label>
            <Input
              id="desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              disabled={pending}
            />
          </div>

          <div className="flex items-center justify-between gap-3 rounded-lg border border-border/60 px-3 py-2.5">
            <div>
              <div className="text-sm font-medium">
                {enabled ? "Active" : "Suspended"}
              </div>
              <div className="text-xs text-muted-foreground">
                Suspended domains stop accepting new routing.
              </div>
            </div>
            <Button
              type="button"
              size="sm"
              variant={enabled ? "outline" : "default"}
              disabled={pending}
              onClick={toggleSuspend}
            >
              {enabled ? "Suspend" : "Enable"}
            </Button>
          </div>

          <div className="grid gap-2">
            <Label>Catch-all (default address)</Label>
            <Select
              items={CATCH_ALL_MODE_LABEL}
              value={catchMode}
              onValueChange={(v) =>
                setCatchMode((v as CatchAllMode) ?? "bounce")
              }
              disabled={pending}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(CATCH_ALL_MODE_LABEL).map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              items={{
                __none__: "Select mailbox",
                ...Object.fromEntries(mailboxes.map((m) => [m.email, m.email])),
              }}
              value={catchAll || "__none__"}
              onValueChange={(v) => {
                setCatchAll(v === "__none__" ? "" : (v ?? ""))
                if (v && v !== "__none__") setCatchMode("address")
              }}
              disabled={pending || catchMode !== "address"}
            >
              <SelectTrigger className="w-full font-mono text-[13px]">
                <SelectValue placeholder="No catch-all" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">Select mailbox</SelectItem>
                {mailboxes.map((m) => (
                  <SelectItem key={m.id} value={m.email}>
                    {m.email}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Address mode requires an existing mailbox. Bounce rejects unknown
              recipients. Blackhole discards in mock; live clears catch-all
              (Stalwart has no discard-at-SMTP).
            </p>
          </div>

          <div className="grid gap-2">
            <Label>Mail exchanger</Label>
            <div className="grid gap-2 sm:grid-cols-3">
              {(
                [
                  ["local", "Local"],
                  ["backup", "Backup"],
                  ["remote", "Remote"],
                ] as const
              ).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  disabled={pending}
                  onClick={() => setMxMode(value)}
                  className={cn(
                    "rounded-lg border px-3 py-2 text-left text-sm transition-colors",
                    mxMode === value
                      ? "border-foreground/30 bg-muted/40"
                      : "border-border/70 hover:bg-muted/20"
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              Maps to{" "}
              <span className="font-mono text-[11px]">allowRelaying</span> —
              Local off, Backup/Remote on.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button type="button" onClick={save} disabled={pending}>
              Save changes
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              nativeButton={false}
              render={<Link href="/dashboard/routing" />}
            >
              Routing hub
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              nativeButton={false}
              render={
                <Link href={`/dashboard/mailboxes?domain=${domain.id}`} />
              }
            >
              Mailboxes
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={pending}
              onClick={() => {
                setForceDestroy(false)
                setDestroyOpen(true)
              }}
            >
              Destroy domain
            </Button>
          </div>
        </section>

        <DnsHealthPanel domainName={domain.name} initial={dns} />
      </div>

      <CloudflareDnsPanel domainName={domain.name} />

      <DnsRecordGenerator domainName={domain.name} />

      <ConfirmDestroy
        open={destroyOpen}
        onOpenChange={setDestroyOpen}
        title={`Destroy ${domain.name}?`}
        description={
          forceDestroy
            ? "Force destroy will remove the domain even if mailboxes remain in the directory. Type the domain name to confirm."
            : "Type the domain name to confirm. Blocked if mailboxes remain — enable force destroy below if you intend to proceed anyway."
        }
        confirmValue={domain.name}
        confirmLabel="Type domain name"
        pending={pending}
        onConfirm={() => {
          startTransition(async () => {
            const result = await destroyDomainAction(
              domain.id,
              domain.name,
              forceDestroy
            )
            if (!result.ok) {
              if (
                result.error.toLowerCase().includes("mailboxes remain") &&
                !forceDestroy
              ) {
                setForceDestroy(true)
              }
              toastActionResult(result, { success: "" })
              return
            }
            toastActionResult(result, {
              success: `Destroyed ${domain.name}.`,
            })
            router.push("/dashboard/domains")
            router.refresh()
          })
        }}
      />
      {destroyOpen && forceDestroy ? (
        <p className="text-center text-xs text-warn">
          Force destroy armed — mailboxes on this domain will be cleared in mock
          mode; live Stalwart may still reject destroy until accounts are gone.
        </p>
      ) : null}
    </div>
  )
}

"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"
import { toast } from "sonner"

import {
  destroyDomainAction,
  updateDomainAction,
} from "@/lib/actions/mail"
import { ConfirmDestroy } from "@/components/mail/confirm-destroy"
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
import type {
  DnsHealthSummary,
  StalwartAccount,
  StalwartDomain,
} from "@/lib/stalwart/types"

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
  const [catchAll, setCatchAll] = useState(domain.catchAllAddress ?? "")
  const [pending, startTransition] = useTransition()
  const [destroyOpen, setDestroyOpen] = useState(false)
  const [forceDestroy, setForceDestroy] = useState(false)

  function save() {
    startTransition(async () => {
      const result = await updateDomainAction(domain.id, {
        description: description.trim() || domain.name,
        isEnabled: enabled,
        catchAllAddress: catchAll.trim() ? catchAll.trim() : null,
      })
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      toast.success(`Updated ${domain.name}.`)
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
      if (!result.ok) {
        setEnabled(!next)
        toast.error(result.error)
        return
      }
      toast.success(
        next ? `Enabled ${domain.name}.` : `Suspended ${domain.name}.`
      )
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
            <Label>Catch-all address</Label>
            <Select
              value={catchAll || "__none__"}
              onValueChange={(v) =>
                setCatchAll(v === "__none__" ? "" : (v ?? ""))
              }
              disabled={pending}
            >
              <SelectTrigger className="w-full font-mono text-[13px]">
                <SelectValue placeholder="No catch-all" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">No catch-all</SelectItem>
                {mailboxes.map((m) => (
                  <SelectItem key={m.id} value={m.email}>
                    {m.email}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Target must already exist on this domain.
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
                toast.error(result.error)
                return
              }
              toast.error(result.error)
              return
            }
            toast.success(`Destroyed ${domain.name}.`)
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

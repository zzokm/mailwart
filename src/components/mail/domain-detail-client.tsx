"use client"

import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"
import { toast } from "sonner"

import {
  destroyDomainAction,
  updateDomainAction,
} from "@/lib/actions/mail"
import { ConfirmDestroy } from "@/components/mail/confirm-destroy"
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
import type { DnsCheckItem, StalwartAccount, StalwartDomain } from "@/lib/stalwart/types"
import { cn } from "@/lib/utils"

export function DomainDetailClient({
  domain,
  mailboxes,
  dns,
}: {
  domain: StalwartDomain
  mailboxes: StalwartAccount[]
  dns: DnsCheckItem[]
}) {
  const router = useRouter()
  const [description, setDescription] = useState(domain.description ?? "")
  const [enabled, setEnabled] = useState(domain.isEnabled !== false)
  const [catchAll, setCatchAll] = useState(domain.catchAllAddress ?? "")
  const [pending, startTransition] = useTransition()
  const [destroyOpen, setDestroyOpen] = useState(false)

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

  return (
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
            <div className="text-sm font-medium">Enabled</div>
            <div className="text-xs text-muted-foreground">
              Disabled domains stop accepting new routing.
            </div>
          </div>
          <Button
            type="button"
            size="sm"
            variant={enabled ? "default" : "outline"}
            disabled={pending}
            onClick={() => setEnabled((v) => !v)}
          >
            {enabled ? "On" : "Off"}
          </Button>
        </div>

        <div className="grid gap-2">
          <Label>Catch-all address</Label>
          <Select
            value={catchAll || "__none__"}
            onValueChange={(v) => setCatchAll(v === "__none__" ? "" : (v ?? ""))}
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
            variant="destructive"
            disabled={pending}
            onClick={() => setDestroyOpen(true)}
          >
            Destroy domain
          </Button>
        </div>
      </section>

      <section className="overflow-hidden rounded-xl border border-border/80">
        <div className="border-b border-border/60 px-4 py-2.5">
          <h2 className="font-mono text-[11px] tracking-wide text-muted-foreground">
            DNS verification checklist
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Read-only guide — live DNS lookups not wired in Phase 3.
          </p>
        </div>
        <ul className="divide-y divide-border/40">
          {dns.map((item) => (
            <li
              key={item.type}
              className="grid gap-1 px-4 py-3 sm:grid-cols-[4.5rem_1fr]"
            >
              <span className="font-mono text-[12px] text-[oklch(0.78_0.09_230)]">
                {item.type}
              </span>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm text-foreground">{item.label}</span>
                  <span
                    className={cn(
                      "font-mono text-[10px] uppercase tracking-wide",
                      item.status === "ok"
                        ? "text-[oklch(0.82_0.08_160)]"
                        : "text-muted-foreground"
                    )}
                  >
                    {item.status}
                  </span>
                </div>
                <div className="mt-1 truncate font-mono text-[11px] text-muted-foreground">
                  {item.expected}
                </div>
                {item.note ? (
                  <div className="mt-1 text-[11px] text-muted-foreground/90">
                    {item.note}
                  </div>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      </section>

      <ConfirmDestroy
        open={destroyOpen}
        onOpenChange={setDestroyOpen}
        title={`Destroy ${domain.name}?`}
        description="Type the domain name to confirm. Blocked if mailboxes remain unless you force from Settings later."
        confirmValue={domain.name}
        confirmLabel="Type domain name"
        pending={pending}
        onConfirm={() => {
          startTransition(async () => {
            const result = await destroyDomainAction(domain.id, domain.name)
            if (!result.ok) {
              toast.error(result.error)
              return
            }
            toast.success(`Destroyed ${domain.name}.`)
            router.push("/dashboard/domains")
            router.refresh()
          })
        }}
      />
    </div>
  )
}

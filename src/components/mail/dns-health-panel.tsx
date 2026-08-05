"use client"

import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"
import { RefreshCw } from "lucide-react"
import { toast } from "sonner"

import { refreshDomainDnsAction } from "@/lib/actions/mail"
import { CopyButton } from "@/components/mail/copy-button"
import {
  DnsHealthBadge,
  dnsStatusClass,
} from "@/components/mail/dns-health-badge"
import { Button } from "@/components/ui/button"
import type { DnsHealthSummary } from "@/lib/stalwart/types"
import { cn } from "@/lib/utils"

export function DnsHealthPanel({
  domainName,
  initial,
}: {
  domainName: string
  initial: DnsHealthSummary
}) {
  const router = useRouter()
  const [dns, setDns] = useState(initial)
  const [pending, startTransition] = useTransition()

  function refresh() {
    startTransition(async () => {
      const id = toast.loading("Re-checking DNS…")
      const result = await refreshDomainDnsAction(domainName)
      if (!result.ok) {
        toast.error(result.error, { id })
        return
      }
      setDns(result.data)
      toast.success("DNS checklist updated.", { id })
      router.refresh()
    })
  }

  return (
    <section className="overflow-hidden rounded-xl border border-border/80">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border/60 px-4 py-2.5">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="font-mono text-[11px] tracking-wide text-muted-foreground">
              DNS health
            </h2>
            <DnsHealthBadge status={dns.worst} />
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Checks use this server&apos;s resolver view
            {dns.fromCache ? " (cached)" : ""}. Public checkers may differ under
            split-horizon DNS.
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={pending}
          onClick={refresh}
        >
          <RefreshCw
            data-icon="inline-start"
            className={pending ? "animate-spin" : undefined}
          />
          Re-check
        </Button>
      </div>
      <ul className="divide-y divide-border/40">
        {dns.checks.map((item) => (
          <li
            key={item.type}
            className="grid gap-1 px-4 py-3 sm:grid-cols-[4.5rem_1fr]"
          >
            <span className="font-mono text-[12px] text-brand">{item.type}</span>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm text-foreground">{item.label}</span>
                <span
                  className={cn(
                    "rounded-full border px-1.5 py-px font-mono text-[10px] uppercase tracking-wide",
                    dnsStatusClass(item.status)
                  )}
                >
                  {item.status}
                </span>
              </div>
              <div className="mt-1 break-all font-mono text-[11px] text-muted-foreground">
                {item.expected}
              </div>
              {item.observed ? (
                <div className="mt-1.5 flex flex-wrap items-start gap-2">
                  <code className="min-w-0 flex-1 break-all rounded-md bg-muted/50 px-2 py-1 font-mono text-[11px] text-foreground/90">
                    {item.observed}
                  </code>
                  <CopyButton value={item.observed} label="Copy" size="xs" />
                </div>
              ) : null}
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
  )
}

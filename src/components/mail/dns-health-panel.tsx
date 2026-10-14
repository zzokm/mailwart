"use client"

import { useRouter } from "next/navigation"
import { useEffect, useState, useTransition } from "react"
import { RefreshCw } from "lucide-react"
import { toast } from "sonner"
import { refreshDomainDnsAction } from "@/lib/actions/mail"
import { toastActionResult } from "@/lib/action-toast"
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

  // Auto-poll when records are propagating until all records pass
  useEffect(() => {
    if (dns.worst !== "propagating") return

    let cancelled = false
    let attempts = 0
    const maxAttempts = 36 // poll for up to 3 minutes (every 5 seconds)

    const interval = setInterval(async () => {
      attempts++
      try {
        const result = await refreshDomainDnsAction(domainName)
        if (!cancelled && result.ok && result.data) {
          setDns(result.data)
          if (result.data.worst === "pass") {
            toast.success(`DNS propagation confirmed! All records for ${domainName} are active.`)
            clearInterval(interval)
            router.refresh()
          } else if (result.data.worst === "fail" && attempts >= maxAttempts) {
            clearInterval(interval)
          }
        }
      } catch {
        // silent retry on network hiccup
      }
    }, 5000)

    return () => {
      cancelled = true
      clearInterval(interval)
    }
  }, [domainName, dns.worst, router])

  function refresh() {
    startTransition(async () => {
      const id = toast.loading("Re-checking DNS…")
      const result = await refreshDomainDnsAction(domainName)
      if (
        !toastActionResult(result, {
          success: "DNS checklist updated.",
          id,
        })
      ) {
        return
      }
      setDns(result.data)
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
            <DnsHealthBadge
              status={dns.worst}
              passedCount={dns.passedCount}
              totalCount={dns.totalCount}
            />
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Checks use recursive public resolvers (1.1.1.1, 8.8.8.8)
            {dns.fromCache ? " (cached)" : ""}.
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

      {dns.worst === "propagating" && (
        <div className="flex items-center gap-2.5 bg-sky-500/10 border-b border-sky-500/20 px-4 py-2.5 text-xs text-sky-400">
          <RefreshCw className="size-3.5 animate-spin shrink-0" />
          <span>
            Records provisioned in Cloudflare. Propagating ({dns.passedCount ?? 0}/{dns.totalCount ?? 5} verified). Auto-validating in background every 4s...
          </span>
        </div>
      )}

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

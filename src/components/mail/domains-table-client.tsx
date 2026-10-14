"use client"

import Link from "next/link"
import { useEffect, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { RefreshCw } from "lucide-react"
import { toast } from "sonner"

import { DnsHealthBadge } from "@/components/mail/dns-health-badge"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { pollDomainsDnsAction } from "@/lib/actions/mail"
import { catchAllLabel } from "@/lib/stalwart/routing-utils"
import type { DomainListItem, DnsHealthSummary } from "@/lib/stalwart/types"
import { cn } from "@/lib/utils"

export function DomainsTableClient({
  initialDomains,
}: {
  initialDomains: DomainListItem[]
}) {
  const router = useRouter()
  const [domains, setDomains] = useState<DomainListItem[]>(initialDomains)
  const [isPending, startTransition] = useTransition()

  // Find any domains currently in "propagating" state
  const propagatingDomains = domains.filter(
    (d) => d.dnsSummary?.worst === "propagating"
  )
  const isAnyPropagating = propagatingDomains.length > 0
  const propagatingKey = propagatingDomains.map((d) => d.name).join(",")

  useEffect(() => {
    if (!isAnyPropagating) return

    let cancelled = false
    const domainNamesToPoll = propagatingKey.split(",").filter(Boolean)

    const interval = setInterval(async () => {
      try {
        const res = await pollDomainsDnsAction(domainNamesToPoll)
        if (cancelled || !res.ok || !res.data) return

        const summaries: Record<string, DnsHealthSummary> = res.data

        setDomains((prev) =>
          prev.map((dom) => {
            const updatedSummary = summaries[dom.name]
            if (!updatedSummary) return dom

            const wasPropagating = dom.dnsSummary?.worst === "propagating"
            const isNowPass = updatedSummary.worst === "pass"

            if (wasPropagating && isNowPass) {
              toast.success(
                `DNS propagation confirmed for ${dom.name}! Catch-all mailbox catch@${dom.name} provisioned.`
              )
              return {
                ...dom,
                dnsSummary: updatedSummary,
                catchAllAddress: `catch@${dom.name}`,
                catchAllMode: "address",
                mailboxCount: dom.mailboxCount + 1,
              }
            }

            return {
              ...dom,
              dnsSummary: updatedSummary,
            }
          })
        )
      } catch {
        // Silent retry on transient background network error
      }
    }, 4000)

    return () => {
      cancelled = true
      clearInterval(interval)
    }
  }, [isAnyPropagating, propagatingKey])

  function handleManualRefresh() {
    startTransition(async () => {
      const allNames = domains.map((d) => d.name)
      const res = await pollDomainsDnsAction(allNames)
      if (res.ok && res.data) {
        const summaries = res.data
        setDomains((prev) =>
          prev.map((dom) => {
            const updated = summaries[dom.name]
            if (!updated) return dom
            return { ...dom, dnsSummary: updated }
          })
        )
        toast.success("DNS health re-checked across all domains.")
        router.refresh()
      } else {
        toast.error("Could not refresh DNS records.")
      }
    })
  }

  return (
    <div className="space-y-3">
      {isAnyPropagating && (
        <div className="flex items-center justify-between gap-3 rounded-lg border border-sky-500/30 bg-sky-500/10 px-4 py-2.5 text-xs text-sky-400">
          <div className="flex items-center gap-2">
            <RefreshCw className="size-3.5 animate-spin shrink-0" />
            <span>
              Validating DNS propagation in real-time ({propagatingDomains.length}{" "}
              domain{propagatingDomains.length > 1 ? "s" : ""} propagating). Table auto-updates live as records propagate.
            </span>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs text-sky-300 hover:text-sky-100 hover:bg-sky-500/20"
            onClick={handleManualRefresh}
            disabled={isPending}
          >
            Check now
          </Button>
        </div>
      )}

      <div className="overflow-hidden rounded-xl border border-border/80">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="font-mono text-[10px] uppercase tracking-[0.14em]">
                Name
              </TableHead>
              <TableHead className="font-mono text-[10px] uppercase tracking-[0.14em]">
                Status
              </TableHead>
              <TableHead className="font-mono text-[10px] uppercase tracking-[0.14em]">
                DNS
              </TableHead>
              <TableHead className="hidden font-mono text-[10px] uppercase tracking-[0.14em] md:table-cell">
                Catch-all
              </TableHead>
              <TableHead className="font-mono text-[10px] uppercase tracking-[0.14em] text-right">
                Mailboxes
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {domains.map((d) => (
              <TableRow key={d.id}>
                <TableCell>
                  <Link
                    href={`/dashboard/domains/${d.id}`}
                    className="font-mono text-[13px] text-foreground underline-offset-4 hover:underline"
                  >
                    {d.name}
                  </Link>
                </TableCell>
                <TableCell>
                  <Badge
                    variant="outline"
                    className={cn(
                      "font-mono text-[10px]",
                      d.isEnabled === false
                        ? "border-destructive/40 text-destructive"
                        : "border-success/40 text-success"
                    )}
                  >
                    {d.isEnabled === false ? "suspended" : "active"}
                  </Badge>
                </TableCell>
                <TableCell>
                  {d.dnsSummary ? (
                    <DnsHealthBadge
                      status={d.dnsSummary.worst}
                      compact
                      passedCount={d.dnsSummary.passedCount}
                      totalCount={d.dnsSummary.totalCount}
                    />
                  ) : (
                    <span className="font-mono text-[10px] text-muted-foreground">
                      —
                    </span>
                  )}
                </TableCell>
                <TableCell className="hidden font-mono text-[12px] text-muted-foreground md:table-cell">
                  {catchAllLabel(d)}
                </TableCell>
                <TableCell className="text-right font-mono text-[12px] text-muted-foreground">
                  {d.mailboxCount}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}

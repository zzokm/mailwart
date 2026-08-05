import type { Metadata } from "next"
import Link from "next/link"

import { DASHBOARD_CRUMB } from "@/components/layout/breadcrumbs"
import { DataSourceBanner } from "@/components/layout/data-source-banner"
import { PageHeader } from "@/components/layout/page-header"
import { CreateDomainDialog } from "@/components/mail/create-domain-dialog"
import { DnsHealthBadge } from "@/components/mail/dns-health-badge"
import { EmptyState, ErrorState } from "@/components/mail/empty-state"
import { Badge } from "@/components/ui/badge"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { listDomainsAction } from "@/lib/actions/mail"
import { cn } from "@/lib/utils"

export const metadata: Metadata = { title: "Domains" }
export const runtime = "nodejs"

export default async function DomainsPage() {
  const result = await listDomainsAction()

  if (!result.ok) {
    return (
      <div>
        <PageHeader
          title="Domains"
          description="Stalwart domain directory."
          breadcrumbs={[DASHBOARD_CRUMB, { label: "Domains" }]}
        />
        <ErrorState title="Could not load domains" description={result.error} />
      </div>
    )
  }

  const domains = result.data

  return (
    <div>
      <PageHeader
        title="Domains"
        description="Add, suspend, or remove domains — and verify MX, SPF, DKIM, and DMARC."
        breadcrumbs={[DASHBOARD_CRUMB, { label: "Domains" }]}
        actions={<CreateDomainDialog />}
      />
      <DataSourceBanner source={result.source} />

      {domains.length === 0 ? (
        <EmptyState
          title="No domains yet"
          description="Create the first domain to start provisioning mailboxes."
          action={<CreateDomainDialog />}
        />
      ) : (
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
                      <DnsHealthBadge status={d.dnsSummary.worst} compact />
                    ) : (
                      <span className="font-mono text-[10px] text-muted-foreground">
                        —
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="hidden font-mono text-[12px] text-muted-foreground md:table-cell">
                    {d.catchAllAddress ?? "none"}
                  </TableCell>
                  <TableCell className="text-right font-mono text-[12px] text-muted-foreground">
                    {d.mailboxCount}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  )
}

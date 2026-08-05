import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"

import { DASHBOARD_CRUMB } from "@/components/layout/breadcrumbs"
import { DataSourceBanner } from "@/components/layout/data-source-banner"
import { PageHeader } from "@/components/layout/page-header"
import { DnsHealthBadge } from "@/components/mail/dns-health-badge"
import { DomainDetailClient } from "@/components/mail/domain-detail-client"
import { ErrorState } from "@/components/mail/empty-state"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { getDomainDetailAction } from "@/lib/actions/mail"
import { cn } from "@/lib/utils"

const DOMAINS_CRUMB = { label: "Domains", href: "/dashboard/domains" }

export const runtime = "nodejs"

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>
}): Promise<Metadata> {
  const { id } = await params
  const result = await getDomainDetailAction(id)
  return {
    title: result.ok ? result.data.domain.name : "Domain",
  }
}

export default async function DomainDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const result = await getDomainDetailAction(id)

  if (!result.ok) {
    if (result.error.toLowerCase().includes("not found")) notFound()
    return (
      <div>
        <PageHeader
          title="Domain"
          breadcrumbs={[DASHBOARD_CRUMB, DOMAINS_CRUMB, { label: "Detail" }]}
          back={{ href: "/dashboard/domains", label: "Domains" }}
        />
        <ErrorState title="Could not load domain" description={result.error} />
      </div>
    )
  }

  const { domain, mailboxes, dns } = result.data
  const suspended = domain.isEnabled === false

  return (
    <div>
      <PageHeader
        title={domain.name}
        description={
          domain.description ||
          "Catch-all, suspend, DNS health, and record generators."
        }
        breadcrumbs={[
          DASHBOARD_CRUMB,
          DOMAINS_CRUMB,
          { label: domain.name, mono: true },
        ]}
        back={{ href: "/dashboard/domains", label: "Domains" }}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Badge
              variant="outline"
              className={cn(
                "font-mono text-[10px]",
                suspended
                  ? "border-destructive/40 text-destructive"
                  : "border-success/40 text-success"
              )}
            >
              {suspended ? "suspended" : "active"}
            </Badge>
            <DnsHealthBadge status={dns.worst} />
            <Button
              variant="outline"
              size="sm"
              nativeButton={false}
              render={
                <Link href={`/dashboard/mailboxes?domain=${domain.id}`} />
              }
            >
              Mailboxes
            </Button>
          </div>
        }
      />
      <DataSourceBanner source={result.source} />
      <DomainDetailClient domain={domain} mailboxes={mailboxes} dns={dns} />
    </div>
  )
}

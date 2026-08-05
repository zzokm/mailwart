import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"

import { DataSourceBanner } from "@/components/layout/data-source-banner"
import { PageHeader } from "@/components/layout/page-header"
import { DomainDetailClient } from "@/components/mail/domain-detail-client"
import { ErrorState } from "@/components/mail/empty-state"
import { Button } from "@/components/ui/button"
import { getDomainDetailAction } from "@/lib/actions/mail"

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
        <PageHeader title="Domain" />
        <ErrorState title="Could not load domain" description={result.error} />
      </div>
    )
  }

  const { domain, mailboxes, dns } = result.data

  return (
    <div>
      <PageHeader
        title={domain.name}
        description={domain.description || "Domain detail, catch-all, DNS checklist."}
        actions={
          <Button
            variant="outline"
            size="sm"
            nativeButton={false}
            render={<Link href="/dashboard/domains" />}
          >
            All domains
          </Button>
        }
      />
      <DataSourceBanner source={result.source} />
      <DomainDetailClient domain={domain} mailboxes={mailboxes} dns={dns} />
    </div>
  )
}

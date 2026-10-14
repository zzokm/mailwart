import type { Metadata } from "next"

import { DASHBOARD_CRUMB } from "@/components/layout/breadcrumbs"
import { DataSourceBanner } from "@/components/layout/data-source-banner"
import { PageHeader } from "@/components/layout/page-header"
import { CreateDomainDialog } from "@/components/mail/create-domain-dialog"
import { DomainsTableClient } from "@/components/mail/domains-table-client"
import { EmptyState, ErrorState } from "@/components/mail/empty-state"
import { listDomainsAction } from "@/lib/actions/mail"

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
        <DomainsTableClient
          key={domains.map((d) => `${d.id}-${d.name}`).join(";")}
          initialDomains={domains}
        />
      )}
    </div>
  )
}

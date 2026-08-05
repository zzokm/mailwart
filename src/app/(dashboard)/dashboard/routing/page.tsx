import type { Metadata } from "next"

import { DASHBOARD_CRUMB } from "@/components/layout/breadcrumbs"
import { DataSourceBanner } from "@/components/layout/data-source-banner"
import { PageHeader } from "@/components/layout/page-header"
import { EmptyState, ErrorState } from "@/components/mail/empty-state"
import { RoutingClient } from "@/components/mail/routing-client"
import { getRoutingOverviewAction } from "@/lib/actions/mail"

export const metadata: Metadata = { title: "Routing" }
export const runtime = "nodejs"

export default async function RoutingPage() {
  const result = await getRoutingOverviewAction()

  if (!result.ok) {
    return (
      <div>
        <PageHeader
          title="Routing"
          description="Catch-alls, aliases, and forwarding."
          breadcrumbs={[DASHBOARD_CRUMB, { label: "Routing" }]}
        />
        <ErrorState title="Could not load routing" description={result.error} />
      </div>
    )
  }

  const { domains, accounts, forwards, adminUiUrl } = result.data

  return (
    <div>
      <PageHeader
        title="Routing"
        description="Catch-alls, mailbox aliases, and forward rules across domains."
        breadcrumbs={[DASHBOARD_CRUMB, { label: "Routing" }]}
      />
      <DataSourceBanner source={result.source} />

      {domains.length === 0 ? (
        <EmptyState
          title="No domains yet"
          description="Create a domain before configuring catch-alls or forwards."
        />
      ) : (
        <RoutingClient
          domains={domains}
          accounts={accounts}
          forwards={forwards}
          adminUiUrl={adminUiUrl}
          source={result.source}
        />
      )}
    </div>
  )
}

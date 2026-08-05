import type { Metadata } from "next"

import { DASHBOARD_CRUMB } from "@/components/layout/breadcrumbs"
import { DataSourceBanner } from "@/components/layout/data-source-banner"
import { PageHeader } from "@/components/layout/page-header"
import { EmptyState, ErrorState } from "@/components/mail/empty-state"
import { FiltersClient } from "@/components/mail/filters-client"
import { getFiltersOverviewAction } from "@/lib/actions/mail"

export const metadata: Metadata = { title: "Filters" }
export const runtime = "nodejs"

export default async function FiltersPage() {
  const result = await getFiltersOverviewAction()

  if (!result.ok) {
    return (
      <div>
        <PageHeader
          title="Filters"
          description="Autoresponders, Sieve rules, and spam posture."
          breadcrumbs={[DASHBOARD_CRUMB, { label: "Filters" }]}
        />
        <ErrorState title="Could not load filters" description={result.error} />
      </div>
    )
  }

  const {
    accounts,
    domains,
    autoresponders,
    filterRules,
    spam,
    sieveAvailable,
    sieveNote,
    adminUiUrl,
  } = result.data

  return (
    <div>
      <PageHeader
        title="Filters"
        description="Vacation autoresponders, Sieve filter rules, and spam thresholds."
        breadcrumbs={[DASHBOARD_CRUMB, { label: "Filters" }]}
      />
      <DataSourceBanner source={result.source} />

      {domains.length === 0 ? (
        <EmptyState
          title="No domains yet"
          description="Create a domain and mailboxes before configuring filters."
        />
      ) : (
        <FiltersClient
          accounts={accounts}
          domains={domains}
          autoresponders={autoresponders}
          filterRules={filterRules}
          spam={spam}
          sieveAvailable={sieveAvailable}
          sieveNote={sieveNote}
          adminUiUrl={adminUiUrl}
          source={result.source}
        />
      )}
    </div>
  )
}

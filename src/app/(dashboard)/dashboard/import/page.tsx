import type { Metadata } from "next"

import { DASHBOARD_CRUMB } from "@/components/layout/breadcrumbs"
import { DataSourceBanner } from "@/components/layout/data-source-banner"
import { PageHeader } from "@/components/layout/page-header"
import { BulkImportWizard } from "@/components/mail/bulk-import-wizard"
import { hasStalwartConfig } from "@/lib/env"

export const metadata: Metadata = { title: "Bulk CSV" }
export const runtime = "nodejs"

export default function ImportPage() {
  const source = hasStalwartConfig() ? "live" : "mock"

  return (
    <div>
      <PageHeader
        title="Bulk CSV"
        description="Download templates, upload mailbox or forwarding CSVs, validate, then commit in chunked jobs."
        breadcrumbs={[DASHBOARD_CRUMB, { label: "Bulk CSV" }]}
      />
      <DataSourceBanner source={source} />
      <BulkImportWizard />
    </div>
  )
}

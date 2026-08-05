import type { Metadata } from "next"

import { DASHBOARD_CRUMB } from "@/components/layout/breadcrumbs"
import { DataSourceBanner } from "@/components/layout/data-source-banner"
import { PageHeader } from "@/components/layout/page-header"
import { BulkImportWizard } from "@/components/mail/bulk-import-wizard"
import { hasStalwartConfig } from "@/lib/env"

export const metadata: Metadata = { title: "Bulk import" }
export const runtime = "nodejs"

export default function ImportPage() {
  const source = hasStalwartConfig() ? "live" : "mock"

  return (
    <div>
      <PageHeader
        title="Bulk import"
        description="Upload a CSV, validate it, commit in chunks, then read the per-row report."
        breadcrumbs={[DASHBOARD_CRUMB, { label: "Bulk import" }]}
      />
      <DataSourceBanner source={source} />
      <BulkImportWizard />
    </div>
  )
}

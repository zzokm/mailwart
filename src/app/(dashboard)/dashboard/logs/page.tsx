import type { Metadata } from "next"

import { DASHBOARD_CRUMB } from "@/components/layout/breadcrumbs"
import { DataSourceBanner } from "@/components/layout/data-source-banner"
import { PageHeader } from "@/components/layout/page-header"
import { EmptyState, ErrorState } from "@/components/mail/empty-state"
import { LogsClient } from "@/components/mail/logs-client"
import {
  getAuditLogsAction,
  getDeliveryLogsAction,
} from "@/lib/actions/mail"

export const metadata: Metadata = { title: "Logs" }
export const runtime = "nodejs"

export default async function LogsPage() {
  const [delivery, audit] = await Promise.all([
    getDeliveryLogsAction(),
    getAuditLogsAction(),
  ])

  if (!delivery.ok && !audit.ok) {
    return (
      <div>
        <PageHeader
          title="Logs"
          description="SMTP delivery reports and dashboard audit trail."
          breadcrumbs={[DASHBOARD_CRUMB, { label: "Logs" }]}
        />
        <ErrorState
          title="Could not load logs"
          description={delivery.error || audit.error}
        />
      </div>
    )
  }

  if (!delivery.ok) {
    return (
      <div>
        <PageHeader
          title="Logs"
          description="SMTP delivery reports and dashboard audit trail."
          breadcrumbs={[DASHBOARD_CRUMB, { label: "Logs" }]}
        />
        <ErrorState title="Could not load delivery logs" description={delivery.error} />
      </div>
    )
  }

  if (!audit.ok) {
    return (
      <div>
        <PageHeader
          title="Logs"
          description="SMTP delivery reports and dashboard audit trail."
          breadcrumbs={[DASHBOARD_CRUMB, { label: "Logs" }]}
        />
        <ErrorState title="Could not load audit log" description={audit.error} />
      </div>
    )
  }

  return (
    <div>
      <PageHeader
        title="Logs"
        description="Searchable SMTP delivery reports and an append-only audit of dashboard changes."
        breadcrumbs={[DASHBOARD_CRUMB, { label: "Logs" }]}
      />
      <DataSourceBanner source={delivery.source} />
      {delivery.data.events.length === 0 && audit.data.events.length === 0 ? (
        <EmptyState
          title="Nothing logged yet"
          description="Delivery traces and audit events will appear after mail flows and directory ops."
        />
      ) : (
        <LogsClient delivery={delivery.data} audit={audit.data} />
      )}
    </div>
  )
}

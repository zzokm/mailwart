import type { Metadata } from "next"

import { DASHBOARD_CRUMB } from "@/components/layout/breadcrumbs"
import { PageHeader } from "@/components/layout/page-header"
import { DeliverabilityClient } from "@/components/mail/deliverability-client"
import { getLatestDeliverabilityReportAction } from "@/lib/actions/deliverability"
import { queryDomains } from "@/lib/stalwart/domains"

export const metadata: Metadata = {
  title: "Deliverability & System Checkup",
}

export const runtime = "nodejs"

export default async function DeliverabilityPage() {
  const [reportResult, domains] = await Promise.all([
    getLatestDeliverabilityReportAction(),
    queryDomains().catch(() => []),
  ])

  const initialReport = reportResult.ok ? reportResult.data : null
  const availableDomains = domains.map((d: { name: string }) => d.name.toLowerCase())

  return (
    <div className="space-y-6">
      <PageHeader
        title="Deliverability & System Checkup"
        description="Automated inbound and outbound email diagnostics, temporary mailbox probes, full DNS matrix (MX, SPF, DKIM, DMARC, PTR), and Mail-Tester integration."
        breadcrumbs={[
          DASHBOARD_CRUMB,
          { label: "Settings", href: "/dashboard/settings" },
          { label: "Deliverability" },
        ]}
      />

      <DeliverabilityClient
        initialReport={initialReport}
        availableDomains={availableDomains}
      />
    </div>
  )
}

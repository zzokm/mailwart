import type { Metadata } from "next"

import { DASHBOARD_CRUMB, type Crumb } from "@/components/layout/breadcrumbs"
import { DataSourceBanner } from "@/components/layout/data-source-banner"
import { PageHeader } from "@/components/layout/page-header"
import { ErrorState } from "@/components/mail/empty-state"
import { MailboxTable } from "@/components/mail/mailbox-table"
import { listMailboxesAction } from "@/lib/actions/mail"

export const metadata: Metadata = { title: "Mailboxes" }
export const runtime = "nodejs"

export default async function MailboxesPage({
  searchParams,
}: {
  searchParams: Promise<{ domain?: string }>
}) {
  const { domain } = await searchParams
  const result = await listMailboxesAction(domain)

  if (!result.ok) {
    return (
      <div>
        <PageHeader
          title="Mailboxes"
          description="Cross-domain account directory."
          breadcrumbs={[DASHBOARD_CRUMB, { label: "Mailboxes" }]}
        />
        <ErrorState
          title="Could not load mailboxes"
          description={result.error}
        />
      </div>
    )
  }

  const scoped = domain
    ? result.data.domains.find((d) => d.id === domain)
    : undefined

  const breadcrumbs: Crumb[] = scoped
    ? [
        DASHBOARD_CRUMB,
        { label: "Domains", href: "/dashboard/domains" },
        {
          label: scoped.name,
          href: `/dashboard/domains/${scoped.id}`,
          mono: true,
        },
        { label: "Mailboxes" },
      ]
    : [DASHBOARD_CRUMB, { label: "Mailboxes" }]

  return (
    <div>
      <PageHeader
        title="Mailboxes"
        description="Create, suspend, reset passwords, app passwords, open Roundcube, and run bulk actions."
        breadcrumbs={breadcrumbs}
        back={
          scoped
            ? { href: `/dashboard/domains/${scoped.id}`, label: scoped.name }
            : undefined
        }
      />
      <DataSourceBanner source={result.source} />
      <MailboxTable
        accounts={result.data.accounts}
        domains={result.data.domains}
        initialDomainId={domain}
      />
    </div>
  )
}

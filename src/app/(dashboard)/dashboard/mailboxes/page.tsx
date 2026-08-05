import type { Metadata } from "next"

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
        />
        <ErrorState
          title="Could not load mailboxes"
          description={result.error}
        />
      </div>
    )
  }

  return (
    <div>
      <PageHeader
        title="Mailboxes"
        description="Create, reset passwords, open Roundcube, and run bulk actions."
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

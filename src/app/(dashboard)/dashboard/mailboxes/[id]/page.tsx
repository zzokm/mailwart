import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"

import { DataSourceBanner } from "@/components/layout/data-source-banner"
import { PageHeader } from "@/components/layout/page-header"
import { ErrorState } from "@/components/mail/empty-state"
import { MailboxDetailClient } from "@/components/mail/mailbox-detail-client"
import { Button } from "@/components/ui/button"
import { getMailboxDetailAction } from "@/lib/actions/mail"

export const runtime = "nodejs"

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>
}): Promise<Metadata> {
  const { id } = await params
  const result = await getMailboxDetailAction(id)
  return { title: result.ok ? result.data.account.email : "Mailbox" }
}

export default async function MailboxDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const result = await getMailboxDetailAction(id)

  if (!result.ok) {
    if (result.error.toLowerCase().includes("not found")) notFound()
    return (
      <div>
        <PageHeader title="Mailbox" />
        <ErrorState title="Could not load mailbox" description={result.error} />
      </div>
    )
  }

  const { account, roundcubeUrl, aliasesEditable } = result.data

  return (
    <div>
      <PageHeader
        title={account.email}
        description="Password reset, quota, aliases, Roundcube."
        actions={
          <Button
            variant="outline"
            size="sm"
            nativeButton={false}
            render={<Link href="/dashboard/mailboxes" />}
          >
            All mailboxes
          </Button>
        }
      />
      <DataSourceBanner source={result.source} />
      <MailboxDetailClient
        account={account}
        roundcubeUrl={roundcubeUrl}
        aliasesEditable={aliasesEditable}
      />
    </div>
  )
}

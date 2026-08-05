import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"

import { DASHBOARD_CRUMB } from "@/components/layout/breadcrumbs"
import { DataSourceBanner } from "@/components/layout/data-source-banner"
import { PageHeader } from "@/components/layout/page-header"
import { ErrorState } from "@/components/mail/empty-state"
import { MailboxDetailClient } from "@/components/mail/mailbox-detail-client"
import { Button } from "@/components/ui/button"
import { getMailboxDetailAction } from "@/lib/actions/mail"

const MAILBOXES_CRUMB = { label: "Mailboxes", href: "/dashboard/mailboxes" }

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
        <PageHeader
          title="Mailbox"
          breadcrumbs={[DASHBOARD_CRUMB, MAILBOXES_CRUMB, { label: "Detail" }]}
          back={{ href: "/dashboard/mailboxes", label: "Mailboxes" }}
        />
        <ErrorState title="Could not load mailbox" description={result.error} />
      </div>
    )
  }

  const {
    account,
    domains,
    roundcubeUrl,
    aliasesEditable,
    appPasswords,
    appPasswordsMutable,
    twoFactor,
    adminUiUrl,
    forwards,
  } = result.data

  return (
    <div>
      <PageHeader
        title={account.email}
        description="Suspend, quota, app passwords, 2FA status, Roundcube SSO, forwarding."
        breadcrumbs={[
          DASHBOARD_CRUMB,
          MAILBOXES_CRUMB,
          { label: account.email, mono: true },
        ]}
        back={{ href: "/dashboard/mailboxes", label: "Mailboxes" }}
        actions={
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              nativeButton={false}
              render={<Link href="/dashboard/routing" />}
            >
              Routing
            </Button>
            {account.domainId ? (
              <Button
                variant="outline"
                size="sm"
                nativeButton={false}
                render={
                  <Link href={`/dashboard/domains/${account.domainId}`} />
                }
              >
                Domain settings
              </Button>
            ) : null}
          </div>
        }
      />
      <DataSourceBanner source={result.source} />
      <MailboxDetailClient
        account={account}
        domains={domains}
        roundcubeUrl={roundcubeUrl}
        aliasesEditable={aliasesEditable}
        appPasswords={appPasswords}
        appPasswordsMutable={appPasswordsMutable}
        twoFactor={twoFactor}
        adminUiUrl={adminUiUrl}
        forwards={forwards}
      />
    </div>
  )
}

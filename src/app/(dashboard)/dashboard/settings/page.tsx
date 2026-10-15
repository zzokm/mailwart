import type { Metadata } from "next"

import { DASHBOARD_CRUMB } from "@/components/layout/breadcrumbs"
import { DataSourceBanner } from "@/components/layout/data-source-banner"
import { PageHeader } from "@/components/layout/page-header"
import { ErrorState } from "@/components/mail/empty-state"
import { SettingsClient } from "@/components/mail/settings-client"
import { getCopilotSettingsAction } from "@/lib/actions/copilot"
import { getSettingsAction } from "@/lib/actions/mail"
import { getCloudflareStatusAction } from "@/lib/actions/cloudflare"
import { getLatestDeliverabilityReportAction } from "@/lib/actions/deliverability"
import { listUsersAction } from "@/lib/actions/users"
import { getSession } from "@/lib/auth/session"
import { getUserOwnedDomainNames } from "@/lib/db"
import { queryDomains } from "@/lib/stalwart/domains"

import { getOutboundEmailConfig } from "@/lib/db/system-settings"
import { isPrimaryAdmin } from "@/lib/db/users"
import { queryAccounts } from "@/lib/stalwart/accounts"
import { getWebmailSettingsAction } from "@/lib/actions/webmail"
import { getRavUrl, getRoundcubeUrl } from "@/lib/env"

export const metadata: Metadata = { title: "Settings" }
export const runtime = "nodejs"

export default async function SettingsPage({
  searchParams,
}: {
  searchParams?: Promise<{ tab?: string }>
}) {
  const resolvedSearchParams = searchParams ? await searchParams : undefined
  const initialTab = resolvedSearchParams?.tab

  const [
    result,
    copilotResult,
    cfResult,
    deliverabilityResult,
    usersResult,
    session,
    domains,
    outboundConfig,
    webmailResult,
  ] = await Promise.all([
    getSettingsAction(),
    getCopilotSettingsAction(),
    getCloudflareStatusAction(),
    getLatestDeliverabilityReportAction(),
    listUsersAction(),
    getSession(),
    queryDomains().catch(() => []),
    getOutboundEmailConfig().catch(() => null),
    getWebmailSettingsAction(),
  ])

  if (!result.ok) {
    return (
      <div className="w-full">
        <PageHeader
          title="Settings"
          breadcrumbs={[DASHBOARD_CRUMB, { label: "Settings" }]}
        />
        <ErrorState title="Could not load settings" description={result.error} />
      </div>
    )
  }

  const isAdmin = session.role === "admin"
  const availableDomains = isAdmin
    ? domains.map((d: { name: string }) => d.name.toLowerCase())
    : await getUserOwnedDomainNames(session.userId || "")

  const accounts = isAdmin ? await queryAccounts(domains).catch(() => []) : []
  const availableMailboxes = accounts.map((a) => a.email)

  return (
    <div className="w-full space-y-6">
      <PageHeader
        title="Settings"
        description="Deliverability suite, Cloudflare DNS automation, Copilot providers, user accounts, and service endpoints."
        breadcrumbs={[DASHBOARD_CRUMB, { label: "Settings" }]}
      />
      <DataSourceBanner source={result.source} />

      <SettingsClient
        settings={result.data}
        copilotStatus={copilotResult.ok ? copilotResult.data : null}
        copilotError={copilotResult.ok ? null : copilotResult.error}
        cloudflareStatus={cfResult.ok ? cfResult.data : null}
        cloudflareError={cfResult.ok ? null : cfResult.error}
        deliverabilityReport={deliverabilityResult.ok ? deliverabilityResult.data : null}
        availableDomains={availableDomains}
        availableMailboxes={availableMailboxes}
        outboundEmailConfig={outboundConfig}
        users={usersResult.ok && usersResult.data ? usersResult.data : []}
        webmailSettings={webmailResult.ok ? webmailResult.data : null}
        roundcubeUrl={getRoundcubeUrl()}
        ravUrl={getRavUrl()}
        session={{
          ...session,
          isPrimary: isPrimaryAdmin(session.username),
        }}
        initialTab={initialTab}
      />
    </div>
  )
}


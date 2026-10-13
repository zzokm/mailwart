import type { Metadata } from "next"
import { ExternalLink } from "lucide-react"

import { DASHBOARD_CRUMB } from "@/components/layout/breadcrumbs"
import { DataSourceBanner } from "@/components/layout/data-source-banner"
import { PageHeader } from "@/components/layout/page-header"
import { CopilotSettingsClient } from "@/components/mail/copilot-settings-client"
import { ErrorState } from "@/components/mail/empty-state"
import { Button } from "@/components/ui/button"
import { logoutAction } from "@/lib/actions/auth"
import { getCopilotSettingsAction } from "@/lib/actions/copilot"
import { getSettingsAction } from "@/lib/actions/mail"
import { getCloudflareStatusAction } from "@/lib/actions/cloudflare"
import { CloudflareSettingsClient } from "@/components/mail/cloudflare-settings-client"
import { getLatestDeliverabilityReportAction } from "@/lib/actions/deliverability"
import { SettingsDeliverabilitySection } from "@/components/mail/settings-deliverability-section"

export const metadata: Metadata = { title: "Settings" }
export const runtime = "nodejs"

export default async function SettingsPage() {
  const [result, copilotResult, cfResult, deliverabilityResult] = await Promise.all([
    getSettingsAction(),
    getCopilotSettingsAction(),
    getCloudflareStatusAction(),
    getLatestDeliverabilityReportAction(),
  ])

  if (!result.ok) {
    return (
      <div>
        <PageHeader
          title="Settings"
          breadcrumbs={[DASHBOARD_CRUMB, { label: "Settings" }]}
        />
        <ErrorState title="Could not load settings" description={result.error} />
      </div>
    )
  }

  const s = result.data

  return (
    <div>
      <PageHeader
        title="Settings"
        description="Integrated webmail, Stalwart host, Copilot providers, and danger zone."
        breadcrumbs={[DASHBOARD_CRUMB, { label: "Settings" }]}
      />
      <DataSourceBanner source={result.source} />

      <div className="grid max-w-2xl gap-4">
        <SettingsDeliverabilitySection
          initialReport={deliverabilityResult.ok ? deliverabilityResult.data : null}
        />

        <section className="rounded-xl border border-border/80 p-4 sm:p-5">
          <h2 className="text-sm font-medium">mailwart Copilot</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Choose a provider and model. API keys stay server-side (Dokploy env
            preferred; Settings store is a fallback under{" "}
            <code className="font-mono text-[12px]">data/copilot-settings.json</code>
            ).
          </p>
          <div className="mt-4">
            {copilotResult.ok ? (
              <CopilotSettingsClient initial={copilotResult.data} />
            ) : (
              <p className="text-sm text-destructive">{copilotResult.error}</p>
            )}
          </div>
        </section>

        <section className="rounded-xl border border-border/80 p-4 sm:p-5">
          <h2 className="text-sm font-medium">Cloudflare DNS Automation</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Connect an API token to auto-discover zones and automatically provision or synchronize MX, SPF, DKIM, and DMARC records across your Cloudflare domains.
          </p>
          <div className="mt-4">
            {cfResult.ok ? (
              <CloudflareSettingsClient initial={cfResult.data} />
            ) : (
              <p className="text-sm text-destructive">{cfResult.error}</p>
            )}
          </div>
        </section>

        <section className="rounded-xl border border-border/80 p-4 sm:p-5">
          <h2 className="text-sm font-medium">Connections</h2>
          <dl className="mt-4 space-y-3 text-sm">
            <div className="flex flex-wrap justify-between gap-2 border-b border-border/40 pb-3">
              <dt className="text-muted-foreground">Roundcube</dt>
              <dd className="font-mono text-[13px]">{s.roundcubeHost}</dd>
            </div>
            <div className="flex flex-wrap justify-between gap-2 border-b border-border/40 pb-3">
              <dt className="text-muted-foreground">JMAP host</dt>
              <dd className="font-mono text-[13px]">
                {s.jmapHost ?? "not configured"}
              </dd>
            </div>
            <div className="flex flex-wrap justify-between gap-2">
              <dt className="text-muted-foreground">Stalwart admin user</dt>
              <dd className="font-mono text-[13px]">
                {s.stalwartUser ?? "not configured"}
              </dd>
            </div>
          </dl>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="outline"
              nativeButton={false}
              render={
                <a href={s.roundcubeUrl} target="_blank" rel="noreferrer" />
              }
            >
              <ExternalLink data-icon="inline-start" />
              Open Webmail
            </Button>
            <Button
              size="sm"
              variant="outline"
              nativeButton={false}
              render={
                <a href={s.adminUiUrl} target="_blank" rel="noreferrer" />
              }
            >
              <ExternalLink data-icon="inline-start" />
              Stalwart Admin
            </Button>
          </div>
        </section>

        <section className="rounded-xl border border-border/80 p-4 sm:p-5">
          <h2 className="text-sm font-medium">Session</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Signed in with app admin credentials (`APP_ADMIN_*`). Session is an
            HttpOnly iron-session cookie, so Stalwart secrets stay server-side.
          </p>
          <form action={logoutAction} className="mt-3">
            <Button type="submit" size="sm" variant="outline">
              Sign out
            </Button>
          </form>
        </section>

        <section className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 sm:p-5">
          <h2 className="text-sm font-medium text-destructive">Danger zone</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Password policy (`x:Authentication`) edits stay collapsed. Use
            Stalwart Admin or restore scripts for now.
          </p>
          <Button size="sm" variant="outline" className="mt-3" disabled>
            Edit password policy (later)
          </Button>
        </section>
      </div>
    </div>
  )
}

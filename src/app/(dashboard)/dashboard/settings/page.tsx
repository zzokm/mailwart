import type { Metadata } from "next"
import { ExternalLink } from "lucide-react"

import { DataSourceBanner } from "@/components/layout/data-source-banner"
import { PageHeader } from "@/components/layout/page-header"
import { ErrorState } from "@/components/mail/empty-state"
import { Button } from "@/components/ui/button"
import { logoutAction } from "@/lib/actions/auth"
import { getSettingsAction } from "@/lib/actions/mail"

export const metadata: Metadata = { title: "Settings" }
export const runtime = "nodejs"

export default async function SettingsPage() {
  const result = await getSettingsAction()

  if (!result.ok) {
    return (
      <div>
        <PageHeader title="Settings" />
        <ErrorState title="Could not load settings" description={result.error} />
      </div>
    )
  }

  const s = result.data

  return (
    <div>
      <PageHeader
        title="Settings"
        description="Integrated webmail, Stalwart host, and danger zone."
      />
      <DataSourceBanner source={result.source} />

      <div className="grid max-w-2xl gap-4">
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

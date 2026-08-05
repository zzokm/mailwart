import type { Metadata } from "next"
import Link from "next/link"
import { ExternalLink, Globe, Inbox, Import } from "lucide-react"

import { DataSourceBanner } from "@/components/layout/data-source-banner"
import { PageHeader } from "@/components/layout/page-header"
import { ErrorState } from "@/components/mail/empty-state"
import { Button } from "@/components/ui/button"
import { getOverview } from "@/lib/actions/mail"
import { formatBytes } from "@/lib/format"
import { cn } from "@/lib/utils"

export const metadata: Metadata = {
  title: "Overview",
}

export const runtime = "nodejs"

export default async function OverviewPage() {
  const result = await getOverview()

  if (!result.ok) {
    return (
      <div>
        <PageHeader
          title="Overview"
          description="Stalwart directory health and size."
        />
        <ErrorState title="Could not load overview" description={result.error} />
      </div>
    )
  }

  const { stats, health, domains, adminUiUrl, roundcubeUrl } = result.data

  const metrics = [
    {
      key: "domains",
      label: "Domains",
      value: String(stats.domainCount),
      href: "/dashboard/domains",
    },
    {
      key: "mailboxes",
      label: "Mailboxes",
      value: String(stats.mailboxCount),
      href: "/dashboard/mailboxes",
    },
    {
      key: "storage",
      label: "Quota sum",
      value: formatBytes(stats.storageQuotaBytes),
      hint: stats.storageUsedBytes == null ? "Used unknown" : undefined,
    },
    {
      key: "sessions",
      label: "Sessions",
      value: "1",
      hint: "Operator session",
    },
  ] as const

  return (
    <div>
      <PageHeader
        title="Overview"
        description="Is mail admin reachable, and how big is the directory?"
        actions={
          <>
            <Button
              variant="outline"
              size="sm"
              nativeButton={false}
              render={<a href={adminUiUrl} target="_blank" rel="noreferrer" />}
            >
              <ExternalLink data-icon="inline-start" />
              Stalwart Admin
            </Button>
            <Button
              variant="outline"
              size="sm"
              nativeButton={false}
              render={<a href={roundcubeUrl} target="_blank" rel="noreferrer" />}
            >
              <ExternalLink data-icon="inline-start" />
              Webmail
            </Button>
          </>
        }
      />

      <DataSourceBanner source={result.source} />

      {!health.jmap.ok && result.source === "live" ? (
        <div className="mb-5 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {health.jmap.error ?? "Stalwart JMAP unreachable."}
        </div>
      ) : null}

      <section className="overflow-hidden rounded-xl border border-border/80 bg-[oklch(0.16_0.012_250)]">
        <div className="grid grid-cols-2 divide-x divide-y divide-border/50 lg:grid-cols-4 lg:divide-y-0">
          {metrics.map((m) => {
            const inner = (
              <div className="px-4 py-4 sm:px-5">
                <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                  {m.label}
                </div>
                <div className="mt-2 font-mono text-2xl tracking-tight text-foreground">
                  {m.value}
                </div>
                {"hint" in m && m.hint ? (
                  <div className="mt-1 text-[11px] text-muted-foreground">
                    {m.hint}
                  </div>
                ) : null}
              </div>
            )
            return "href" in m && m.href ? (
              <Link
                key={m.key}
                href={m.href}
                className="transition-colors hover:bg-muted/30"
              >
                {inner}
              </Link>
            ) : (
              <div key={m.key}>{inner}</div>
            )
          })}
        </div>
      </section>

      <div className="mt-8 grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <section className="overflow-hidden rounded-xl border border-border/80">
          <div className="flex items-center justify-between border-b border-border/60 px-4 py-2.5">
            <h2 className="font-mono text-[11px] tracking-wide text-muted-foreground">
              domains
            </h2>
            <Button
              variant="ghost"
              size="xs"
              nativeButton={false}
              render={<Link href="/dashboard/domains" />}
            >
              Manage
            </Button>
          </div>
          <ul className="divide-y divide-border/40">
            {domains.map((d) => (
              <li key={d.id}>
                <Link
                  href={`/dashboard/domains/${d.id}`}
                  className="grid grid-cols-[minmax(0,1.4fr)_auto_auto] items-center gap-3 px-4 py-2.5 transition-colors hover:bg-muted/25 sm:px-5"
                >
                  <span className="truncate font-mono text-[13px] text-foreground">
                    {d.name}
                  </span>
                  <span
                    className={cn(
                      "font-mono text-[11px]",
                      d.isEnabled === false
                        ? "text-destructive"
                        : "text-[oklch(0.78_0.09_230)]"
                    )}
                  >
                    {d.isEnabled === false ? "off" : "on"}
                  </span>
                  <span className="font-mono text-[11px] text-muted-foreground">
                    {d.mailboxCount} mbx
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>

        <section className="flex flex-col gap-2 rounded-xl border border-border/80 p-4">
          <h2 className="font-mono text-[11px] tracking-wide text-muted-foreground">
            quick actions
          </h2>
          <Button
            variant="outline"
            className="justify-start"
            nativeButton={false}
            render={<Link href="/dashboard/mailboxes" />}
          >
            <Inbox data-icon="inline-start" />
            Mailboxes
          </Button>
          <Button
            variant="outline"
            className="justify-start"
            nativeButton={false}
            render={<Link href="/dashboard/domains" />}
          >
            <Globe data-icon="inline-start" />
            Domains
          </Button>
          <Button
            variant="outline"
            className="justify-start"
            nativeButton={false}
            render={<Link href="/dashboard/import" />}
          >
            <Import data-icon="inline-start" />
            Bulk import
          </Button>
        </section>
      </div>
    </div>
  )
}

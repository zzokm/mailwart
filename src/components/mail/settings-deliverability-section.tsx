import Link from "next/link"
import { CheckCircle2, ShieldCheck, ArrowRight, Activity, Send } from "lucide-react"

import { Button } from "@/components/ui/button"
import type { DeliverabilitySuiteReport } from "@/lib/deliverability/types"

export function SettingsDeliverabilitySection({
  initialReport,
}: {
  initialReport: DeliverabilitySuiteReport | null
}) {
  const hasReport = Boolean(initialReport)
  const score = initialReport?.overallScore ?? null
  const grade = initialReport?.overallGrade ?? null
  const total = initialReport?.totalDomains ?? 0
  const passed = initialReport?.passedDomains ?? 0

  return (
    <section className="rounded-xl border border-border/80 p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-medium">Deliverability & System Checkup</h2>
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
              <ShieldCheck className="size-3" />
              Automated Diagnostics
            </span>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Test end-to-end inbound and outbound delivery, automated temporary mailboxes, DNS security (SPF/DKIM/DMARC/PTR), port connectivity, and external Mail-Tester verification.
          </p>
        </div>

        {hasReport && score !== null && (
          <div className="flex items-center gap-2.5 rounded-lg border border-border/60 bg-muted/40 px-3 py-1.5 text-right">
            <div>
              <div className="text-[11px] text-muted-foreground uppercase font-mono tracking-wider">Health Score</div>
              <div className="font-mono text-base font-semibold leading-none">
                {score} <span className="text-xs font-normal text-muted-foreground">/ 10</span>
              </div>
            </div>
            <div className="flex size-7 items-center justify-center rounded bg-emerald-500/20 font-mono text-xs font-bold text-emerald-600 dark:text-emerald-400">
              {grade}
            </div>
          </div>
        )}
      </div>

      <div className="mt-4 grid gap-2.5 sm:grid-cols-3">
        <div className="rounded-lg border border-border/50 bg-background/50 p-2.5 text-xs">
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <Send className="size-3.5 text-sky-500" />
            <span className="font-medium text-foreground">Inbound & Outbound</span>
          </div>
          <p className="mt-1 text-[11px] text-muted-foreground leading-relaxed">
            Automated temp inboxes test SMTP STARTTLS submission, IMAP login, and delivery latency.
          </p>
        </div>

        <div className="rounded-lg border border-border/50 bg-background/50 p-2.5 text-xs">
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <CheckCircle2 className="size-3.5 text-emerald-500" />
            <span className="font-medium text-foreground">Full DNS Matrix</span>
          </div>
          <p className="mt-1 text-[11px] text-muted-foreground leading-relaxed">
            MX, A, SPF, DKIM (RSA/Ed25519), DMARC, PTR, and 3 major anti-spam DNSBL blacklists.
          </p>
        </div>

        <div className="rounded-lg border border-border/50 bg-background/50 p-2.5 text-xs">
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <Activity className="size-3.5 text-amber-500" />
            <span className="font-medium text-foreground">Mail-Tester Ready</span>
          </div>
          <p className="mt-1 text-[11px] text-muted-foreground leading-relaxed">
            Integrated probe to Mail-Tester with instant direct link to external spam scores and audits.
          </p>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-border/40 pt-3">
        <div className="text-xs text-muted-foreground">
          {hasReport ? (
            <span>
              Last test completed across <strong className="text-foreground">{total}</strong> domains ({passed} passed).
            </span>
          ) : (
            <span>No deliverability checkup has been executed yet.</span>
          )}
        </div>

        <Button
          size="sm"
          render={
            <Link href="/dashboard/settings/deliverability" />
          }
        >
          Open Deliverability Suite
          <ArrowRight className="size-3.5" data-icon="inline-end" />
        </Button>
      </div>
    </section>
  )
}

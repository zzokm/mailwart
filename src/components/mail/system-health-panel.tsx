import { cn } from "@/lib/utils"
import type { HealthStatus } from "@/lib/stalwart/types"
import {
  getJmapHealthState,
  getWebmailHealthState,
  getHealthColorClasses,
  type ServiceHealthState,
} from "@/lib/stalwart/health-status"

function HealthRow({
  label,
  detail,
  state,
}: {
  label: string
  detail: string
  state: ServiceHealthState
}) {
  const colors = getHealthColorClasses(state)
  return (
    <div className="flex items-start gap-3 px-4 py-3 sm:px-5">
      <span
        className={cn("mt-1.5 size-2 shrink-0 rounded-full", colors.dot)}
        aria-hidden
      />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
          <span className="font-mono text-[13px] text-foreground">{label}</span>
          <span
            className={cn(
              "font-mono text-[11px] uppercase tracking-[0.12em]",
              colors.text
            )}
          >
            {state === "ok"
              ? "reachable"
              : state === "down"
                ? "unreachable"
                : state === "sample"
                  ? "sample"
                  : "unchecked"}
          </span>
        </div>
        <p className="mt-0.5 text-[12px] text-muted-foreground">{detail}</p>
      </div>
    </div>
  )
}

export function SystemHealthPanel({ health }: { health: HealthStatus }) {
  const jmapState = getJmapHealthState(health)
  const rc = getWebmailHealthState(health)

  const jmapDetail =
    health.source === "mock"
      ? "STALWART_* not configured — overview uses sample directory."
      : health.jmap.ok
        ? health.jmap.latencyMs != null
          ? `JMAP session ok · ${health.jmap.latencyMs}ms`
          : "JMAP session ok"
        : (health.jmap.error ?? "Stalwart JMAP unreachable")

  const rcDetail =
    rc === "ok"
      ? "Webmail HTTP soft-check returned OK."
      : rc === "down"
        ? (health.roundcube.error ?? "Roundcube soft-check failed.")
        : health.source === "mock"
          ? "Soft-check skipped in sample mode."
          : "Roundcube soft-check not run (JMAP down or deferred)."

  return (
    <section className="overflow-hidden rounded-xl border border-border/80">
      <div className="border-b border-border/60 px-4 py-2.5 sm:px-5">
        <h2 className="font-mono text-[11px] tracking-wide text-muted-foreground">
          system health
        </h2>
      </div>
      <div className="divide-y divide-border/40">
        <HealthRow label="Stalwart JMAP" detail={jmapDetail} state={jmapState} />
        <HealthRow label="Webmail" detail={rcDetail} state={rc} />
      </div>
    </section>
  )
}

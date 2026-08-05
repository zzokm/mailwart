import { cn } from "@/lib/utils"
import {
  formatBytes,
  quotaSummary,
  storageProgressPercent,
} from "@/lib/format"

export function QuotaBar({
  quotas,
  className,
}: {
  quotas?: Record<string, unknown> | null
  className?: string
}) {
  const summary = quotaSummary(quotas)
  const pct = storageProgressPercent(summary.used, summary.bytes)
  const hasMeter = summary.bytes != null && summary.bytes > 0

  return (
    <div className={cn("min-w-[7rem]", className)}>
      <div className="font-mono text-[12px] text-muted-foreground">
        {summary.used != null && summary.bytes != null
          ? `${formatBytes(summary.used)} / ${summary.label}`
          : summary.label}
      </div>
      {hasMeter ? (
        <div className="mt-1 h-1 overflow-hidden rounded-full bg-muted">
          <div
            className={cn(
              "h-full rounded-full transition-[width]",
              pct != null && pct >= 90
                ? "bg-destructive"
                : pct != null && pct >= 75
                  ? "bg-warn"
                  : "bg-primary/70"
            )}
            style={{ width: `${pct ?? 12}%` }}
            title={
              pct != null
                ? `${pct}% of ${formatBytes(summary.bytes)}`
                : `Limit ${formatBytes(summary.bytes)} · used unknown`
            }
          />
        </div>
      ) : null}
    </div>
  )
}

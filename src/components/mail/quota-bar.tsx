import { cn } from "@/lib/utils"
import { formatBytes, quotaSummary } from "@/lib/format"

export function QuotaBar({
  quotas,
  className,
}: {
  quotas?: Record<string, unknown> | null
  className?: string
}) {
  const summary = quotaSummary(quotas)
  const hasMeter = summary.bytes != null && summary.bytes > 0

  return (
    <div className={cn("min-w-[7rem]", className)}>
      <div className="font-mono text-[12px] text-muted-foreground">
        {summary.label}
      </div>
      {hasMeter ? (
        <div className="mt-1 h-1 overflow-hidden rounded-full bg-muted">
          <div
            className="h-full w-[12%] rounded-full bg-primary/70"
            title={`Limit ${formatBytes(summary.bytes)} · used unknown`}
          />
        </div>
      ) : null}
    </div>
  )
}

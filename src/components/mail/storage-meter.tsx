import { cn } from "@/lib/utils"
import { formatBytes, storageProgressPercent } from "@/lib/format"

export function StorageMeter({
  usedBytes,
  quotaBytes,
  mailboxesWithQuota,
  mailboxCount,
  className,
}: {
  usedBytes: number | null
  quotaBytes: number | null
  mailboxesWithQuota: number
  mailboxCount: number
  className?: string
}) {
  const pct = storageProgressPercent(usedBytes, quotaBytes)
  const hasQuota = quotaBytes != null && quotaBytes > 0

  return (
    <section
      className={cn(
        "overflow-hidden rounded-xl border border-border/80 bg-surface p-4 sm:p-5",
        className
      )}
    >
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-mono text-[11px] tracking-wide text-muted-foreground">
            global storage
          </h2>
          <div className="mt-1.5 flex items-baseline gap-2.5">
            <span className="font-mono text-2xl tracking-tight text-foreground">
              {usedBytes != null ? formatBytes(usedBytes) : "—"}
            </span>
            {pct != null ? (
              <span
                className={cn(
                  "font-mono text-base font-normal tabular-nums",
                  pct >= 90
                    ? "text-destructive"
                    : pct >= 75
                      ? "text-warn"
                      : "text-muted-foreground"
                )}
              >
                ({pct}%)
              </span>
            ) : null}
          </div>
          <p className="mt-1 text-[12px] text-muted-foreground">
            {hasQuota
              ? usedBytes != null
                ? `${pct}% of allocated quota across ${mailboxesWithQuota} mailboxes`
                : `Quota allocated on ${mailboxesWithQuota} of ${mailboxCount} mailboxes · used not exposed by JMAP yet`
              : "No explicit disk quotas set — mailboxes use server defaults"}
          </p>
        </div>
      </div>

      <div className="mt-4 flex items-center justify-between font-mono text-[11px] text-muted-foreground">
        <span>0 B</span>
        <span>
          {hasQuota
            ? `Scale: ${formatBytes(quotaBytes)} total allocated`
            : "Server default quota"}
        </span>
      </div>

      <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-muted">
        {hasQuota ? (
          <div
            className={cn(
              "h-full rounded-full transition-[width] duration-500",
              pct == null
                ? "w-full bg-primary/25"
                : pct >= 90
                  ? "bg-destructive"
                  : pct >= 75
                    ? "bg-warn"
                    : "bg-brand"
            )}
            style={pct != null ? { width: `${pct}%` } : undefined}
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={pct ?? undefined}
            aria-label="Global storage usage"
          />
        ) : (
          <div
            className="h-full w-full bg-[repeating-linear-gradient(-45deg,transparent,transparent_4px,var(--muted-foreground)_4px,var(--muted-foreground)_5px)] opacity-20"
            aria-hidden
          />
        )}
      </div>
    </section>
  )
}

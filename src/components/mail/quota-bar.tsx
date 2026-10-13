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
  const used = summary.used
  const total = summary.bytes
  const rawPct = total > 0 ? (used / total) * 100 : 0
  const pct = Math.min(100, Math.max(0, rawPct))

  // Precision formatting:
  // For below 0.1: display up to two decimal places (e.g. 0.04%, 0.09%).
  // Lower than 0.01: say "< 0.01% used"
  let pctDisplay = "0% used"
  if (pct === 0) {
    pctDisplay = "0% used"
  } else if (pct < 0.01) {
    pctDisplay = "< 0.01% used"
  } else if (pct < 0.1) {
    pctDisplay = `${pct.toFixed(2)}% used`
  } else if (pct < 1) {
    pctDisplay = `${pct.toFixed(2)}% used`
  } else {
    pctDisplay = `${pct.toFixed(1)}% used`
  }

  // Thicker circular progress ring:
  // In viewBox 0 0 32 32 with strokeWidth 4, radius 12 fits comfortably (24 + 4 + 4 = 32)
  const radius = 12
  const circumference = 2 * Math.PI * radius
  const strokeOffset = circumference - (pct / 100) * circumference

  return (
    <div className={cn("flex items-center gap-3", className)}>
      {/* Thicker Circular Progress Ring with contrasting light/dark background */}
      <div className="relative flex size-8 shrink-0 items-center justify-center">
        <svg className="size-8 -rotate-90" viewBox="0 0 32 32">
          {/* Contrasting background grey circle */}
          <circle
            cx="16"
            cy="16"
            r={radius}
            fill="none"
            stroke="currentColor"
            strokeWidth="4"
            className="text-zinc-300 dark:text-zinc-600/80"
          />
          {/* Thick accent progress circle */}
          <circle
            cx="16"
            cy="16"
            r={radius}
            fill="none"
            stroke="currentColor"
            strokeWidth="4"
            strokeDasharray={circumference}
            strokeDashoffset={strokeOffset}
            strokeLinecap="round"
            className={cn(
              "transition-[stroke-dashoffset] duration-300",
              pct >= 90
                ? "text-destructive"
                : pct >= 75
                  ? "text-warn"
                  : "text-primary"
            )}
          />
        </svg>
      </div>

      {/* Aligned space values: all slashes strictly aligned on a single line */}
      <div className="flex flex-col">
        <div className="grid grid-cols-[3.25rem_0.75rem_3.25rem] items-center font-mono text-[12px] font-medium text-foreground">
          <span className="text-right truncate pr-0.5">{formatBytes(used)}</span>
          <span className="text-center text-muted-foreground/60 select-none">/</span>
          <span className="text-left truncate pl-0.5">{formatBytes(total)}</span>
        </div>
        <div className="text-center font-mono text-[10px] text-muted-foreground">
          {pctDisplay}
        </div>
      </div>
    </div>
  )
}

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

  let pctDisplay = "0%"
  if (pct > 0 && pct < 0.1) {
    pctDisplay = "<0.1%"
  } else if (pct > 0 && pct < 1) {
    pctDisplay = `${pct.toFixed(1)}%`
  } else {
    pctDisplay = `${Math.round(pct)}%`
  }

  // Circular progress: radius 13 -> circumference = 2 * PI * 13 ≈ 81.68
  const radius = 13
  const circumference = 2 * Math.PI * radius
  const strokeOffset = circumference - (pct / 100) * circumference

  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      <div className="relative flex size-7 shrink-0 items-center justify-center">
        <svg className="size-7 -rotate-90" viewBox="0 0 32 32">
          {/* Grey background circle */}
          <circle
            cx="16"
            cy="16"
            r={radius}
            fill="none"
            stroke="currentColor"
            strokeWidth="3"
            className="text-muted-foreground/25 dark:text-muted/30"
          />
          {/* Accent progress circle */}
          <circle
            cx="16"
            cy="16"
            r={radius}
            fill="none"
            stroke="currentColor"
            strokeWidth="3"
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

      <div className="flex flex-col min-w-0">
        <div className="flex items-center gap-1 font-mono text-[12px] font-medium text-foreground">
          <span>{formatBytes(used)}</span>
          <span className="text-muted-foreground/70">/</span>
          <span>{formatBytes(total)}</span>
        </div>
        <div className="font-mono text-[10px] text-muted-foreground">
          {pctDisplay} used
        </div>
      </div>
    </div>
  )
}

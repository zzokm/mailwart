import { RefreshCw } from "lucide-react"
import { cn } from "@/lib/utils"
import type { DnsCheckStatus } from "@/lib/stalwart/types"

const LABEL: Record<DnsCheckStatus, string> = {
  pass: "pass",
  warn: "warn",
  fail: "fail",
  propagating: "propagating",
  unknown: "—",
}

export function dnsStatusClass(status: DnsCheckStatus): string {
  switch (status) {
    case "pass":
      return "border-success/40 text-success"
    case "warn":
      return "border-warn/40 text-warn"
    case "fail":
      return "border-destructive/40 text-destructive"
    case "propagating":
      return "border-sky-500/40 text-sky-400 bg-sky-500/10"
    default:
      return "border-border text-muted-foreground"
  }
}

export function DnsHealthBadge({
  status,
  className,
  compact,
}: {
  status: DnsCheckStatus
  className?: string
  compact?: boolean
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.12em]",
        dnsStatusClass(status),
        className
      )}
      title={`DNS health: ${LABEL[status]}`}
    >
      {status === "propagating" ? (
        <RefreshCw className="size-2.5 animate-spin text-sky-400" aria-hidden />
      ) : (
        <span
          className={cn(
            "size-1.5 rounded-full",
            status === "pass" && "bg-success",
            status === "warn" && "bg-warn",
            status === "fail" && "bg-destructive",
            status === "unknown" && "bg-muted-foreground/40"
          )}
          aria-hidden
        />
      )}
      {compact ? LABEL[status] : `dns ${LABEL[status]}`}
    </span>
  )
}

"use client"

import { cn } from "@/lib/utils"
import type { HealthStatus } from "@/lib/stalwart/types"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"

export function HealthPill({ health }: { health: HealthStatus }) {
  const ok = health.jmap.ok
  const label = ok
    ? health.jmap.latencyMs != null
      ? `JMAP ${health.jmap.latencyMs}ms`
      : "JMAP ok"
    : health.source === "mock"
      ? "Sample data"
      : "JMAP down"

  return (
    <Tooltip>
      <TooltipTrigger
        className={cn(
          "inline-flex items-center gap-1.5 rounded-md border px-2 py-1 font-mono text-[11px] tracking-wide",
          ok
            ? "border-success/35 bg-success/10 text-success"
            : health.source === "mock"
              ? "border-warn/35 bg-warn/10 text-warn"
              : "border-destructive/40 bg-destructive/10 text-destructive"
        )}
      >
        <span
          className={cn(
            "size-1.5 rounded-full",
            ok
              ? "bg-success"
              : health.source === "mock"
                ? "bg-warn"
                : "bg-destructive"
          )}
        />
        {label}
      </TooltipTrigger>
      <TooltipContent side="bottom" className="max-w-xs text-xs">
        {health.jmap.error ??
          (ok
            ? "Stalwart JMAP reachable."
            : "Configure STALWART_* or check connectivity.")}
        {health.roundcube.ok === false
          ? ` Roundcube soft-check failed${health.roundcube.error ? `: ${health.roundcube.error}` : "."}`
          : null}
      </TooltipContent>
    </Tooltip>
  )
}

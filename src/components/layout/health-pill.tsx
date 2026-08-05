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
            ? "border-[oklch(0.55_0.08_160/0.35)] bg-[oklch(0.28_0.04_160/0.25)] text-[oklch(0.82_0.08_160)]"
            : health.source === "mock"
              ? "border-[oklch(0.65_0.1_85/0.35)] bg-[oklch(0.28_0.04_85/0.2)] text-[oklch(0.85_0.08_85)]"
              : "border-destructive/40 bg-destructive/10 text-destructive"
        )}
      >
        <span
          className={cn(
            "size-1.5 rounded-full",
            ok
              ? "bg-[oklch(0.72_0.12_160)]"
              : health.source === "mock"
                ? "bg-[oklch(0.78_0.12_85)]"
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

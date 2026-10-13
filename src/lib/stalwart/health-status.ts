import type { HealthStatus } from "./types"

export type ServiceHealthState = "ok" | "down" | "sample" | "unknown"

export function getJmapHealthState(health: HealthStatus): ServiceHealthState {
  if (health.source === "mock") return "sample"
  return health.jmap.ok ? "ok" : "down"
}

export function getWebmailHealthState(health: HealthStatus): ServiceHealthState {
  if (health.roundcube.ok === true) return "ok"
  if (health.roundcube.ok === false) return "down"
  if (health.source === "mock") return "sample"
  return "unknown"
}

export function getHealthColorClasses(state: ServiceHealthState): {
  dot: string
  text: string
  border: string
  bg: string
} {
  switch (state) {
    case "ok":
      return {
        dot: "bg-success",
        text: "text-success",
        border: "border-success/35",
        bg: "bg-success/10",
      }
    case "sample":
      return {
        dot: "bg-warn",
        text: "text-warn",
        border: "border-warn/35",
        bg: "bg-warn/10",
      }
    case "down":
      return {
        dot: "bg-destructive",
        text: "text-destructive",
        border: "border-destructive/40",
        bg: "bg-destructive/10",
      }
    case "unknown":
    default:
      return {
        dot: "bg-muted-foreground/40",
        text: "text-muted-foreground",
        border: "border-border",
        bg: "bg-muted/40",
      }
  }
}

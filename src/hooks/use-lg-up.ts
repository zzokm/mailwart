import * as React from "react"

/** Matches Tailwind `lg` — Copilot shrink layout vs sheet. */
const LG_BREAKPOINT = 1024

export function useLgUp() {
  return React.useSyncExternalStore(
    (onStoreChange) => {
      const mql = window.matchMedia(`(min-width: ${LG_BREAKPOINT}px)`)
      mql.addEventListener("change", onStoreChange)
      return () => mql.removeEventListener("change", onStoreChange)
    },
    () => window.innerWidth >= LG_BREAKPOINT,
    () => true
  )
}

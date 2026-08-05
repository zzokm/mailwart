"use client"

import * as React from "react"

import { useLgUp } from "@/hooks/use-lg-up"

const STORAGE_OPEN_KEY = "mailwart_copilot_open"
const KEYBOARD_SHORTCUT = "j"

type CopilotContextValue = {
  open: boolean
  setOpen: (open: boolean) => void
  toggle: () => void
  /** Desktop (≥ lg): inline shrink. Mobile: sheet overlay. */
  isDesktop: boolean
}

const CopilotContext = React.createContext<CopilotContextValue | null>(null)

export function useCopilot() {
  const ctx = React.useContext(CopilotContext)
  if (!ctx) {
    throw new Error("useCopilot must be used within CopilotProvider.")
  }
  return ctx
}

export function CopilotProvider({ children }: { children: React.ReactNode }) {
  const isDesktop = useLgUp()
  const [open, setOpenState] = React.useState(false)
  const hydrated = React.useRef(false)

  React.useEffect(() => {
    if (hydrated.current) return
    hydrated.current = true
    try {
      const stored = localStorage.getItem(STORAGE_OPEN_KEY)
      if (stored === "1" && window.innerWidth >= 1024) {
        setOpenState(true)
      }
    } catch {
      /* ignore quota / private mode */
    }
  }, [])

  const setOpen = React.useCallback(
    (next: boolean) => {
      setOpenState(next)
      if (isDesktop) {
        try {
          localStorage.setItem(STORAGE_OPEN_KEY, next ? "1" : "0")
        } catch {
          /* ignore */
        }
      }
    },
    [isDesktop]
  )

  const toggle = React.useCallback(() => {
    setOpen(!open)
  }, [open, setOpen])

  React.useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (
        event.key.toLowerCase() === KEYBOARD_SHORTCUT &&
        (event.metaKey || event.ctrlKey) &&
        !event.altKey &&
        !event.shiftKey
      ) {
        const target = event.target as HTMLElement | null
        const tag = target?.tagName
        if (
          tag === "INPUT" ||
          tag === "TEXTAREA" ||
          tag === "SELECT" ||
          target?.isContentEditable
        ) {
          return
        }
        event.preventDefault()
        setOpen(!open)
      }
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [open, setOpen])

  const value = React.useMemo(
    () => ({ open, setOpen, toggle, isDesktop }),
    [open, setOpen, toggle, isDesktop]
  )

  return (
    <CopilotContext.Provider value={value}>{children}</CopilotContext.Provider>
  )
}

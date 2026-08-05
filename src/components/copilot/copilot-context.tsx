"use client"

import * as React from "react"
import { usePathname, useRouter } from "next/navigation"
import { useChat } from "@ai-sdk/react"
import { DefaultChatTransport, isToolUIPart, type UIMessage } from "ai"

import { useLgUp } from "@/hooks/use-lg-up"
import { readNavIntent, type CopilotNavIntent } from "@/lib/copilot/tool-ui"

const STORAGE_OPEN_KEY = "mailwart_copilot_open"
const KEYBOARD_SHORTCUT = "j"
const CHAT_ENDPOINT = "/api/copilot/chat"

type CopilotChat = ReturnType<typeof useChat<UIMessage>>

type CopilotContextValue = {
  open: boolean
  setOpen: (open: boolean) => void
  toggle: () => void
  /** Desktop (≥ lg): inline shrink. Mobile: sheet overlay. */
  isDesktop: boolean
  messages: CopilotChat["messages"]
  status: CopilotChat["status"]
  error: CopilotChat["error"]
  /** Send operator text as a new user turn. */
  send: (text: string) => void
  stop: CopilotChat["stop"]
  regenerate: CopilotChat["regenerate"]
  clearError: CopilotChat["clearError"]
  respondToApproval: CopilotChat["addToolApprovalResponse"]
  /** Clear the transcript and start a fresh run. */
  reset: () => void
  /** Last route the model opened in the left workspace, for in-stream feedback. */
  lastNavIntent: CopilotNavIntent | null
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

  const {
    messages,
    status,
    error,
    sendMessage,
    stop,
    regenerate,
    clearError,
    setMessages,
    addToolApprovalResponse,
  } = useChat<UIMessage>({
    transport: React.useMemo(
      () => new DefaultChatTransport<UIMessage>({ api: CHAT_ENDPOINT }),
      []
    ),
  })

  const router = useRouter()
  const pathname = usePathname()
  const pathnameRef = React.useRef(pathname)
  pathnameRef.current = pathname

  const [lastNavIntent, setLastNavIntent] =
    React.useState<CopilotNavIntent | null>(null)
  const navigatedCalls = React.useRef<Set<string>>(new Set())

  // §16.8 — tools emit an allowlisted href; the left workspace follows while the
  // panel keeps streaming. Each tool call is applied at most once.
  React.useEffect(() => {
    let target: CopilotNavIntent | null = null

    for (const message of messages) {
      if (message.role !== "assistant") continue
      for (const part of message.parts) {
        if (!isToolUIPart(part) || part.state !== "output-available") continue
        if (navigatedCalls.current.has(part.toolCallId)) continue
        navigatedCalls.current.add(part.toolCallId)
        const intent = readNavIntent(part.output)
        if (intent) target = intent
      }
    }

    if (!target) return
    setLastNavIntent(target)
    if (target.href !== pathnameRef.current) {
      router.push(target.href)
    }
  }, [messages, router])

  const send = React.useCallback(
    (text: string) => {
      const trimmed = text.trim()
      if (!trimmed) return
      void sendMessage({ text: trimmed })
    },
    [sendMessage]
  )

  const reset = React.useCallback(() => {
    stop()
    navigatedCalls.current.clear()
    setLastNavIntent(null)
    clearError()
    setMessages([])
  }, [clearError, setMessages, stop])

  const value = React.useMemo(
    () => ({
      open,
      setOpen,
      toggle,
      isDesktop,
      messages,
      status,
      error,
      send,
      stop,
      regenerate,
      clearError,
      respondToApproval: addToolApprovalResponse,
      reset,
      lastNavIntent,
    }),
    [
      open,
      setOpen,
      toggle,
      isDesktop,
      messages,
      status,
      error,
      send,
      stop,
      regenerate,
      clearError,
      addToolApprovalResponse,
      reset,
      lastNavIntent,
    ]
  )

  return (
    <CopilotContext.Provider value={value}>{children}</CopilotContext.Provider>
  )
}

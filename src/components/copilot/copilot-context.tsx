"use client"

import * as React from "react"
import { usePathname } from "next/navigation"
import { useChat } from "@ai-sdk/react"
import {
  DefaultChatTransport,
  lastAssistantMessageIsCompleteWithApprovalResponses,
  type UIMessage,
} from "ai"

import { useLgUp } from "@/hooks/use-lg-up"
import type { CopilotConversationSummary } from "@/lib/copilot/history-store"

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
  conversationId: string | null
  conversations: CopilotConversationSummary[]
  historyLoading: boolean
  historyError: string | null
  model: { provider: string; model: string } | null
  newConversation: () => Promise<void>
  openConversation: (id: string) => Promise<void>
  deleteConversation: (id: string) => Promise<void>
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
        queueMicrotask(() => setOpenState(true))
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
    // Resume the run once the operator answers an approval gate, so an
    // approve/reject never leaves the turn hanging.
    sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithApprovalResponses,
  })

  const pathname = usePathname()
  const [conversationId, setConversationId] = React.useState<string | null>(null)
  const [conversations, setConversations] = React.useState<
    CopilotConversationSummary[]
  >([])
  const [historyLoading, setHistoryLoading] = React.useState(true)
  const [historyError, setHistoryError] = React.useState<string | null>(null)
  const [model, setModel] = React.useState<{
    provider: string
    model: string
  } | null>(null)
  const loadingConversation = React.useRef(false)

  const refreshIndex = React.useCallback(async () => {
    const response = await fetch("/api/copilot/conversations", {
      cache: "no-store",
    })
    if (!response.ok) throw new Error("Could not load conversation history.")
    const data = (await response.json()) as {
      conversations: CopilotConversationSummary[]
      model: { provider: string; model: string }
    }
    setConversations(data.conversations)
    setModel(data.model)
    return data.conversations
  }, [])

  const loadConversation = React.useCallback(
    async (id: string) => {
      loadingConversation.current = true
      try {
        const response = await fetch(`/api/copilot/conversations/${id}`, {
          cache: "no-store",
        })
        if (!response.ok) throw new Error("Could not open that conversation.")
        const data = (await response.json()) as { messages: UIMessage[] }
        await stop()
        clearError()
        setMessages(data.messages)
        setConversationId(id)
        setHistoryError(null)
      } finally {
        queueMicrotask(() => {
          loadingConversation.current = false
        })
      }
    },
    [clearError, setMessages, stop]
  )

  const newConversation = React.useCallback(async () => {
    setHistoryError(null)
    const response = await fetch("/api/copilot/conversations", {
      method: "POST",
    })
    if (!response.ok) {
      setHistoryError("Could not start a new conversation.")
      return
    }
    const created = (await response.json()) as CopilotConversationSummary
    loadingConversation.current = true
    await stop()
    clearError()
    setMessages([])
    setConversationId(created.id)
    setConversations((current) => [
      created,
      ...current.filter((item) => item.id !== created.id),
    ])
    queueMicrotask(() => {
      loadingConversation.current = false
    })
  }, [clearError, setMessages, stop])

  const openConversation = React.useCallback(
    async (id: string) => {
      if (id === conversationId) return
      try {
        await loadConversation(id)
      } catch (error) {
        setHistoryError(
          error instanceof Error ? error.message : "Could not open conversation."
        )
      }
    },
    [conversationId, loadConversation]
  )

  const deleteConversation = React.useCallback(
    async (id: string) => {
      const response = await fetch(`/api/copilot/conversations/${id}`, {
        method: "DELETE",
      })
      if (!response.ok) {
        setHistoryError("Could not delete that conversation.")
        return
      }
      const remaining = conversations.filter((item) => item.id !== id)
      setConversations(remaining)
      if (id === conversationId) {
        if (remaining[0]) await loadConversation(remaining[0].id)
        else await newConversation()
      }
    },
    [conversationId, conversations, loadConversation, newConversation]
  )

  React.useEffect(() => {
    let cancelled = false
    queueMicrotask(() => {
      void refreshIndex()
        .then(async (items) => {
          if (cancelled) return
          if (items[0]) await loadConversation(items[0].id)
          else await newConversation()
        })
        .catch((error) => {
          if (!cancelled) {
            setHistoryError(
              error instanceof Error ? error.message : "History unavailable."
            )
          }
        })
        .finally(() => {
          if (!cancelled) setHistoryLoading(false)
        })
    })
    return () => {
      cancelled = true
    }
  }, [loadConversation, newConversation, refreshIndex])

  React.useEffect(() => {
    if (!conversationId || loadingConversation.current || historyLoading) return
    const timer = window.setTimeout(() => {
      void fetch(`/api/copilot/conversations/${conversationId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages }),
      })
        .then((response) => {
          if (!response.ok) throw new Error()
          return response.json() as Promise<CopilotConversationSummary>
        })
        .then((saved) => {
          setConversations((current) =>
            [saved, ...current.filter((item) => item.id !== saved.id)].sort(
              (a, b) => b.updatedAt.localeCompare(a.updatedAt)
            )
          )
          setHistoryError(null)
        })
        .catch(() => setHistoryError("Conversation changes could not be saved."))
    }, status === "streaming" ? 800 : 250)
    return () => window.clearTimeout(timer)
  }, [conversationId, historyLoading, messages, status])

  React.useEffect(() => {
    queueMicrotask(() => void refreshIndex().catch(() => undefined))
  }, [pathname, refreshIndex])

  React.useEffect(() => {
    const refresh = () => void refreshIndex().catch(() => undefined)
    window.addEventListener("mailwart:copilot-settings-changed", refresh)
    return () =>
      window.removeEventListener("mailwart:copilot-settings-changed", refresh)
  }, [refreshIndex])

  const send = React.useCallback(
    (text: string) => {
      const trimmed = text.trim()
      if (!trimmed) return
      // §16.6 — one active run; abort prior stream before a new operator turn.
      void stop()
      void sendMessage({ text: trimmed })
    },
    [sendMessage, stop]
  )

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
      conversationId,
      conversations,
      historyLoading,
      historyError,
      model,
      newConversation,
      openConversation,
      deleteConversation,
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
      conversationId,
      conversations,
      historyLoading,
      historyError,
      model,
      newConversation,
      openConversation,
      deleteConversation,
    ]
  )

  return (
    <CopilotContext.Provider value={value}>{children}</CopilotContext.Provider>
  )
}

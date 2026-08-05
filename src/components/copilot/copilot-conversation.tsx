"use client"

import * as React from "react"
import { isToolUIPart } from "ai"
import {
  ArrowDown,
  RotateCcw,
  Sparkles,
  TriangleAlert,
} from "lucide-react"

import { useCopilot } from "@/components/copilot/copilot-context"
import { CopilotMessage } from "@/components/copilot/copilot-message"
import { Button } from "@/components/ui/button"

const SUGGESTIONS = [
  "Summarize directory health",
  "Which domains have DNS problems?",
  "Open the mailboxes page",
]

function ThinkingRow({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2" aria-live="polite">
      <span className="relative flex size-[18px] items-center justify-center">
        <span className="absolute size-2 animate-ping rounded-full bg-brand/40 motion-reduce:animate-none" />
        <span className="size-1.5 rounded-full bg-brand" />
      </span>
      <span className="copilot-sweep text-[12.5px] font-medium">{label}</span>
    </div>
  )
}

function EmptyState({ onPick }: { onPick: (text: string) => void }) {
  return (
    <div className="flex flex-1 flex-col justify-center gap-4 px-1 py-6">
      <div className="space-y-1.5">
        <Sparkles className="size-5 text-brand" aria-hidden />
        <p className="font-brand text-lg font-[200] lowercase tracking-[-0.015em] text-foreground">
          ready when you are
        </p>
        <p className="max-w-[30ch] text-[12.5px] leading-relaxed text-muted-foreground">
          Ask about domains, mailboxes, and routing. Copilot runs the same
          directory actions you would, then offers relevant next steps.
        </p>
      </div>
      <div className="flex flex-col items-start gap-1.5">
        {SUGGESTIONS.map((suggestion) => (
          <Button
            key={suggestion}
            type="button"
            size="xs"
            variant="outline"
            className="max-w-full justify-start truncate"
            onClick={() => onPick(suggestion)}
          >
            {suggestion}
          </Button>
        ))}
      </div>
    </div>
  )
}

export function CopilotConversation() {
  const {
    messages,
    status,
    error,
    send,
    regenerate,
    clearError,
    respondToApproval,
  } = useCopilot()

  const scrollRef = React.useRef<HTMLDivElement>(null)
  const contentRef = React.useRef<HTMLDivElement>(null)
  const followingRef = React.useRef(true)
  const [showJump, setShowJump] = React.useState(false)

  const lastMessage = messages.at(-1)
  const lastPart =
    lastMessage?.role === "assistant" ? lastMessage.parts.at(-1) : undefined

  const streamingText =
    lastPart?.type === "text" && lastPart.text.trim().length > 0
  const toolInFlight =
    lastPart !== undefined &&
    isToolUIPart(lastPart) &&
    lastPart.state !== "output-available" &&
    lastPart.state !== "output-error" &&
    lastPart.state !== "output-denied"

  const busy = status === "submitted" || status === "streaming"
  const thinking = busy && !streamingText && !toolInFlight
  const thinkingLabel =
    lastMessage?.role === "assistant" &&
    lastMessage.parts.some((part) => isToolUIPart(part))
      ? "Planning next step"
      : "Thinking"

  const scrollToLatest = React.useCallback((behavior: ScrollBehavior = "auto") => {
    const el = scrollRef.current
    if (!el) return
    el.scrollTo({ top: el.scrollHeight, behavior })
    followingRef.current = true
    setShowJump(false)
  }, [])

  React.useEffect(() => {
    if (lastMessage?.role === "user") followingRef.current = true
    if (followingRef.current) scrollToLatest()
  }, [lastMessage, messages, scrollToLatest, thinking, toolInFlight])

  React.useEffect(() => {
    const content = contentRef.current
    if (!content || typeof ResizeObserver === "undefined") return
    const observer = new ResizeObserver(() => {
      if (followingRef.current) scrollToLatest()
    })
    observer.observe(content)
    return () => observer.disconnect()
  }, [scrollToLatest])

  const handleApproval = React.useCallback(
    (approvalId: string, approved: boolean) => {
      void respondToApproval({ id: approvalId, approved })
    },
    [respondToApproval]
  )

  return (
    <div
      ref={scrollRef}
      className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3.5 py-4"
      onScroll={(event) => {
        const el = event.currentTarget
        const distance = el.scrollHeight - el.scrollTop - el.clientHeight
        const nearBottom = distance < 64
        followingRef.current = nearBottom
        setShowJump(!nearBottom && distance > 120)
      }}
    >
      <div ref={contentRef} className="flex min-h-full flex-col gap-4">
        {messages.length === 0 && !busy ? (
          <EmptyState onPick={send} />
        ) : (
          (() => {
            let nextStep = 1
            return messages.map((message) => {
              if (message.role === "user") nextStep = 1
              const firstToolStep = nextStep
              if (message.role === "assistant") {
                nextStep += message.parts.filter((part) =>
                  isToolUIPart(part)
                ).length
              }
              return (
                <CopilotMessage
                  key={message.id}
                  message={message}
                  firstToolStep={firstToolStep}
                  onAnswer={send}
                  onApproval={handleApproval}
                />
              )
            })
          })()
        )}

        {thinking ? <ThinkingRow label={thinkingLabel} /> : null}

        {error ? (
          <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-2.5">
            <div className="flex items-center gap-1.5 text-[12px] font-medium text-destructive">
              <TriangleAlert className="size-3.5" aria-hidden />
              Copilot request failed
            </div>
            <p className="mt-1 text-[11.5px] leading-snug text-muted-foreground">
              {error.message}
            </p>
            <div className="mt-2 flex gap-1.5">
              <Button
                type="button"
                size="xs"
                variant="outline"
                onClick={() => void regenerate()}
              >
                <RotateCcw />
                Retry
              </Button>
              <Button
                type="button"
                size="xs"
                variant="ghost"
                onClick={clearError}
              >
                Dismiss
              </Button>
            </div>
          </div>
        ) : null}

        {showJump ? (
          <Button
            type="button"
            size="xs"
            variant="secondary"
            className="sticky bottom-0 z-10 self-center shadow-md"
            onClick={() => scrollToLatest("smooth")}
          >
            <ArrowDown />
            Jump to latest
          </Button>
        ) : null}
      </div>
    </div>
  )
}

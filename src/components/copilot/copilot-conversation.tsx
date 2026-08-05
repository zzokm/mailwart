"use client"

import * as React from "react"
import { isToolUIPart } from "ai"
import { RotateCcw, Sparkles, TriangleAlert } from "lucide-react"

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
          directory actions you would, and opens the matching page as it works.
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

  React.useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" })
  }, [messages, thinking])

  const handleApproval = React.useCallback(
    (approvalId: string, approved: boolean) => {
      void respondToApproval({ id: approvalId, approved })
    },
    [respondToApproval]
  )

  return (
    <div
      ref={scrollRef}
      className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto overscroll-contain px-3.5 py-4"
    >
      {messages.length === 0 && !busy ? (
        <EmptyState onPick={send} />
      ) : (
        messages.map((message) => (
          <CopilotMessage
            key={message.id}
            message={message}
            onAnswer={send}
            onApproval={handleApproval}
          />
        ))
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
    </div>
  )
}

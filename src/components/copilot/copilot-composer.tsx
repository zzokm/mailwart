"use client"

import * as React from "react"
import { ArrowUp, Square } from "lucide-react"

import { useCopilot } from "@/components/copilot/copilot-context"
import { Button } from "@/components/ui/button"

const MAX_ROWS_PX = 128

export function CopilotComposer() {
  const { send, stop, status } = useCopilot()
  const [draft, setDraft] = React.useState("")
  const textareaRef = React.useRef<HTMLTextAreaElement>(null)

  const busy = status === "submitted" || status === "streaming"

  React.useEffect(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = "auto"
    el.style.height = `${Math.min(el.scrollHeight, MAX_ROWS_PX)}px`
  }, [draft])

  const submit = () => {
    if (busy || !draft.trim()) return
    send(draft)
    setDraft("")
  }

  return (
    <div className="shrink-0 border-t border-border/70 bg-background p-2.5 pb-[max(0.625rem,env(safe-area-inset-bottom))]">
      <form
        onSubmit={(event) => {
          event.preventDefault()
          submit()
        }}
        className="rounded-xl border border-input bg-surface/50 transition-[border-color,box-shadow] focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/30 motion-reduce:transition-none"
      >
        <textarea
          ref={textareaRef}
          rows={1}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (
              event.key === "Enter" &&
              !event.shiftKey &&
              !event.nativeEvent.isComposing
            ) {
              event.preventDefault()
              submit()
            }
          }}
          placeholder="Ask about domains, mailboxes, routing…"
          aria-label="Message mailwart Copilot"
          className="block max-h-32 w-full resize-none bg-transparent px-3 pt-2.5 text-base leading-relaxed outline-none placeholder:text-muted-foreground/70 sm:text-[13px]"
        />
        <div className="flex items-center justify-between gap-2 px-2 pb-2">
          <span className="pl-1 text-[10.5px] text-muted-foreground/80">
            {busy ? "Working…" : "Enter to send · Shift+Enter for a new line"}
          </span>
          {busy ? (
            <Button type="button" size="xs" variant="outline" onClick={stop}>
              <Square />
              Stop
            </Button>
          ) : (
            <Button
              type="submit"
              size="icon-xs"
              disabled={!draft.trim()}
              aria-label="Send message"
            >
              <ArrowUp />
            </Button>
          )}
        </div>
      </form>
    </div>
  )
}

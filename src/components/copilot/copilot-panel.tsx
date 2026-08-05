"use client"

import type { CSSProperties } from "react"
import { History, SquarePen, Sparkles, Trash2, XIcon } from "lucide-react"

import { CopilotComposer } from "@/components/copilot/copilot-composer"
import { CopilotConversation } from "@/components/copilot/copilot-conversation"
import { useCopilot } from "@/components/copilot/copilot-context"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { cn } from "@/lib/utils"

function CopilotChrome({
  className,
  onClose,
}: {
  className?: string
  onClose: () => void
}) {
  const {
    conversationId,
    conversations,
    deleteConversation,
    historyError,
    historyLoading,
    messages,
    model,
    newConversation,
    openConversation,
  } = useCopilot()

  return (
    <div
      className={cn(
        "flex h-full min-h-0 w-full flex-col bg-background",
        className
      )}
    >
      <div className="flex h-12 shrink-0 items-center gap-2 border-b border-border/70 px-3">
        <Sparkles className="size-4 shrink-0 text-brand" aria-hidden />
        <div className="min-w-0 flex-1">
          <div className="truncate font-brand text-sm font-[200] lowercase tracking-[-0.015em] text-foreground">
            mailwart Copilot
          </div>
          <div className="truncate text-[10px] text-muted-foreground">
            {model
              ? `${model.provider} · ${model.model || "model not selected"}`
              : "Loading model…"}
          </div>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label="Conversation history"
                title="Conversation history"
              />
            }
          >
            <History />
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="end"
            className="w-72"
            aria-label="Recent conversations"
          >
            <DropdownMenuLabel>Recent conversations</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {historyLoading ? (
              <DropdownMenuItem disabled>Loading history…</DropdownMenuItem>
            ) : conversations.length === 0 ? (
              <DropdownMenuItem disabled>No saved conversations</DropdownMenuItem>
            ) : (
              conversations.slice(0, 12).map((conversation) => (
                <DropdownMenuItem
                  key={conversation.id}
                  className="group/history min-w-0"
                  onClick={() => void openConversation(conversation.id)}
                >
                  <span
                    className={
                      conversation.id === conversationId
                        ? "min-w-0 flex-1 truncate font-medium text-foreground"
                        : "min-w-0 flex-1 truncate"
                    }
                  >
                    {conversation.title}
                  </span>
                  <button
                    type="button"
                    className="rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    aria-label={`Delete ${conversation.title}`}
                    onClick={(event) => {
                      event.stopPropagation()
                      if (
                        window.confirm(
                          `Delete “${conversation.title}”? This cannot be undone.`
                        )
                      ) {
                        void deleteConversation(conversation.id)
                      }
                    }}
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </DropdownMenuItem>
              ))
            )}
          </DropdownMenuContent>
        </DropdownMenu>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          onClick={() => void newConversation()}
          disabled={historyLoading && messages.length === 0}
          aria-label="New conversation"
          title="New conversation"
        >
          <SquarePen />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          onClick={onClose}
          aria-label="Close Copilot"
        >
          <XIcon />
        </Button>
      </div>

      {historyError ? (
        <div
          className="shrink-0 border-b border-destructive/20 bg-destructive/5 px-3 py-1.5 text-[11px] text-destructive"
          role="status"
        >
          {historyError}
        </div>
      ) : null}
      <CopilotConversation />
      <CopilotComposer />
    </div>
  )
}

/** Desktop (≥ lg): peer flex child that shrinks the workspace. Hidden below lg via CSS. */
export function CopilotDesktopRail() {
  const { open, setOpen } = useCopilot()

  return (
    <aside
      id="mailwart-copilot"
      data-slot="copilot-rail"
      data-state={open ? "open" : "closed"}
      aria-hidden={!open}
      // Collapsed rail keeps its DOM (and chat state) but must stay out of the tab order.
      inert={!open}
      className={cn(
        "hidden h-full min-h-0 shrink-0 flex-col self-stretch overflow-hidden border-border/70 bg-surface/40 transition-[width] duration-200 ease-out motion-reduce:transition-none lg:flex",
        open ? "w-[var(--copilot-width,22rem)] border-l" : "w-0 border-l-0"
      )}
      style={
        {
          "--copilot-width": "22rem",
        } as CSSProperties
      }
    >
      <div className="flex h-full w-[var(--copilot-width,22rem)] min-w-[var(--copilot-width,22rem)] flex-col">
        <CopilotChrome onClose={() => setOpen(false)} />
      </div>
    </aside>
  )
}

/** Below lg: sheet overlay (shrink would crush Main). */
export function CopilotMobileSheet() {
  const { open, setOpen, isDesktop } = useCopilot()

  return (
    <Sheet
      open={!isDesktop && open}
      onOpenChange={(next) => {
        if (!isDesktop) setOpen(next)
      }}
    >
      <SheetContent
        side="right"
        showCloseButton={false}
        className="h-dvh max-h-dvh w-[min(100%,22rem)] gap-0 p-0 sm:max-w-[22rem]"
      >
        <SheetHeader className="sr-only">
          <SheetTitle>mailwart Copilot</SheetTitle>
          <SheetDescription>
            AI assistant for directory operations
          </SheetDescription>
        </SheetHeader>
        <CopilotChrome onClose={() => setOpen(false)} />
      </SheetContent>
    </Sheet>
  )
}

export function CopilotToggleButton({ className }: { className?: string }) {
  const { open, toggle } = useCopilot()

  return (
    <Button
      type="button"
      variant={open ? "secondary" : "ghost"}
      size="sm"
      onClick={toggle}
      aria-pressed={open}
      aria-controls="mailwart-copilot"
      className={cn("gap-1.5", className)}
      title="Toggle Copilot (Ctrl+J)"
    >
      <Sparkles className="size-3.5 text-brand" aria-hidden />
      <span className="hidden sm:inline">Copilot</span>
    </Button>
  )
}

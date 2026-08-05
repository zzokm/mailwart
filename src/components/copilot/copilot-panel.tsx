"use client"

import type { CSSProperties } from "react"
import { Sparkles, XIcon } from "lucide-react"

import { useCopilot } from "@/components/copilot/copilot-context"
import { Button } from "@/components/ui/button"
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
        </div>
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

      <div className="flex min-h-0 flex-1 flex-col items-start justify-center gap-2 px-5 py-8">
        <p className="text-sm font-medium text-foreground">Ready when you are</p>
        <p className="max-w-[28ch] text-sm leading-relaxed text-muted-foreground">
          Ask about domains, mailboxes, and directory ops. Chat and tools arrive
          in later phases.
        </p>
      </div>
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
      className={cn(
        "hidden shrink-0 flex-col overflow-hidden border-border/70 bg-surface/40 transition-[width] duration-200 ease-out motion-reduce:transition-none lg:flex",
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
        className="w-[min(100%,22rem)] gap-0 p-0 sm:max-w-[22rem]"
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

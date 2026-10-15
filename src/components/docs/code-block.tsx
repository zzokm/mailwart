"use client"

import { useState } from "react"
import { Check, Copy } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

export function CodeBlock({
  language,
  value,
  className,
}: {
  language?: string
  value: string
  className?: string
}) {
  const [copied, setCopied] = useState(false)

  async function onCopy() {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // fallback
    }
  }

  const cleanLang = language ? language.replace(/^language-/, "") : ""

  return (
    <div className={cn("group relative my-5 overflow-hidden rounded-xl border border-border/70 bg-surface/80 dark:bg-card/60 backdrop-blur-sm", className)}>
      <div className="flex h-9 items-center justify-between border-b border-border/50 bg-muted/40 px-3.5 py-1.5 text-xs text-muted-foreground">
        <span className="font-mono text-[11px] font-medium tracking-wide uppercase text-foreground/80">
          {cleanLang || "text"}
        </span>
        <Button
          type="button"
          variant="ghost"
          size="xs"
          onClick={onCopy}
          className="h-6 gap-1 px-2 text-[11px] text-muted-foreground hover:text-foreground"
        >
          {copied ? (
            <>
              <Check className="size-3 text-success" />
              <span className="text-success">Copied</span>
            </>
          ) : (
            <>
              <Copy className="size-3" />
              <span>Copy</span>
            </>
          )}
        </Button>
      </div>
      <div className="overflow-x-auto p-4 text-[13px] leading-relaxed font-mono">
        <pre className="m-0 bg-transparent p-0 text-foreground">
          <code>{value}</code>
        </pre>
      </div>
    </div>
  )
}

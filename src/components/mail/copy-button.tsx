"use client"

import { useState } from "react"
import { Check, Copy } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

export function CopyButton({
  value,
  label = "Copy",
  className,
  size = "sm",
  disabled,
}: {
  value: string
  label?: string
  className?: string
  size?: "sm" | "xs" | "icon-sm"
  disabled?: boolean
}) {
  const [copied, setCopied] = useState(false)

  async function onCopy() {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)
      toast.success("Copied to clipboard.")
      setTimeout(() => setCopied(false), 1500)
    } catch {
      toast.error("Clipboard unavailable.")
    }
  }

  return (
    <Button
      type="button"
      variant="outline"
      size={size}
      className={cn(className)}
      onClick={onCopy}
      disabled={disabled || !value}
    >
      {copied ? <Check data-icon="inline-start" /> : <Copy data-icon="inline-start" />}
      {size === "icon-sm" ? <span className="sr-only">{label}</span> : label}
    </Button>
  )
}

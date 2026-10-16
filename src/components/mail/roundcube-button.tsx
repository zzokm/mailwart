"use client"

import { useState } from "react"
import { ExternalLink, Loader2 } from "lucide-react"

import { Button } from "@/components/ui/button"

export function RoundcubeButton({
  href,
  email,
  iconOnly = false,
}: {
  href: string
  email?: string
  iconOnly?: boolean
}) {
  const [isPending, setIsPending] = useState(false)

  const handleOpenWebmail = async (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (isPending) return
    setIsPending(true)

    // Pre-open a blank window synchronously during the user click to avoid popup blocker
    const newTab = window.open("about:blank", "_blank")
    if (newTab) {
      try {
        newTab.opener = null
      } catch {
        // ignore
      }
    }

    try {
      const res = await fetch(href, {
        headers: { Accept: "application/json" },
      })
      if (res.ok) {
        const data = await res.json()
        if (data?.url && newTab) {
          newTab.location.href = data.url
          return
        }
      }
      if (newTab) {
        newTab.location.href = href
      } else {
        window.open(href, "_blank", "noopener,noreferrer")
      }
    } catch {
      if (newTab) {
        newTab.location.href = href
      } else {
        window.open(href, "_blank", "noopener,noreferrer")
      }
    } finally {
      setIsPending(false)
    }
  }

  return (
    <Button
      type="button"
      variant="outline"
      size={iconOnly ? "icon-sm" : "sm"}
      disabled={isPending}
      onClick={handleOpenWebmail}
      aria-label={`Open webmail for ${email ?? "mailbox"}`}
    >
      {isPending ? (
        <Loader2
          className="size-3.5 animate-spin"
          data-icon={iconOnly ? undefined : "inline-start"}
        />
      ) : (
        <ExternalLink
          className="size-3.5"
          data-icon={iconOnly ? undefined : "inline-start"}
        />
      )}
      {iconOnly ? null : isPending ? "Opening..." : "Open webmail"}
    </Button>
  )
}

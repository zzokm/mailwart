"use client"

import { useRouter } from "next/navigation"
import { useEffect, useTransition } from "react"
import { RefreshCw } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"

/** Toast-ready revalidate control with automated visibility, focus, and interval refresh */
export function OverviewRefresh() {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  useEffect(() => {
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        startTransition(() => router.refresh())
      }
    }
    const onFocus = () => {
      startTransition(() => router.refresh())
    }

    document.addEventListener("visibilitychange", onVisibilityChange)
    window.addEventListener("focus", onFocus)

    const interval = setInterval(() => {
      if (document.visibilityState === "visible") {
        startTransition(() => router.refresh())
      }
    }, 15_000)

    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange)
      window.removeEventListener("focus", onFocus)
      clearInterval(interval)
    }
  }, [router])

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      disabled={pending}
      onClick={() => {
        const id = toast.loading("Refreshing overview…")
        startTransition(() => {
          router.refresh()
          toast.success("Overview updated.", { id })
        })
      }}
    >
      <RefreshCw
        data-icon="inline-start"
        className={pending ? "animate-spin" : undefined}
      />
      Refresh
    </Button>
  )
}

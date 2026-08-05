"use client"

import { useRouter } from "next/navigation"
import { useTransition } from "react"
import { RefreshCw } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"

/** Toast-ready revalidate control — Phase 4 can swap in mutation invalidation. */
export function OverviewRefresh() {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

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

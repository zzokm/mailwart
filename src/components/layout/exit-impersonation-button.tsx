"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { ArrowLeft, Loader2 } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { stopImpersonatingAction } from "@/lib/actions/users"

interface ExitImpersonationButtonProps {
  adminUsername?: string
}

export function ExitImpersonationButton({
  adminUsername = "admin",
}: ExitImpersonationButtonProps) {
  const router = useRouter()
  const [isPending, setIsPending] = useState(false)

  async function handleExit() {
    setIsPending(true)
    try {
      const res = await stopImpersonatingAction()
      if (!res.ok) {
        toast.error(res.error || "Failed to return to admin account.")
        setIsPending(false)
        return
      }
      toast.success("Returned to admin account.")
      router.push("/dashboard")
      router.refresh()
    } catch {
      toast.error("Failed to return to admin account.")
      setIsPending(false)
    }
  }

  return (
    <Button
      size="sm"
      variant="destructive"
      onClick={handleExit}
      disabled={isPending}
      title={`Return to admin account (${adminUsername})`}
      className="h-8 gap-1.5 px-2.5 text-xs font-medium shadow-sm transition-all animate-in fade-in"
    >
      {isPending ? (
        <Loader2 className="size-3.5 animate-spin" />
      ) : (
        <ArrowLeft className="size-3.5" />
      )}
      <span>Back to Admin</span>
    </Button>
  )
}

"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Database } from "lucide-react"

import { bulkSetStorageCapacityAction } from "@/lib/actions/mail"
import { toastActionResult } from "@/lib/action-toast"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { StorageCapacitySelect } from "@/components/mail/storage-capacity-select"

export function BulkStorageDialog({
  open,
  onOpenChange,
  accountIds,
  onSuccess,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  accountIds: string[]
  onSuccess?: () => void
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [quotaBytes, setQuotaBytes] = useState<number | null>(null) // Default infinite

  function handleApply() {
    startTransition(async () => {
      const res = await bulkSetStorageCapacityAction(accountIds, quotaBytes)
      if (
        toastActionResult(res, {
          success: `Updated storage capacity for ${res.ok ? res.data.updated : 0} mailboxes.`,
        })
      ) {
        onOpenChange(false)
        onSuccess?.()
        router.refresh()
      }
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <div className="flex size-8 items-center justify-center rounded-lg border border-border bg-muted/40">
              <Database className="size-4 text-foreground" />
            </div>
            <DialogTitle>Set Storage Capacity</DialogTitle>
          </div>
          <DialogDescription>
            Apply a preset storage quota or unmetered infinite capacity across{" "}
            <span className="font-semibold text-foreground">{accountIds.length}</span> selected
            mailboxes.
          </DialogDescription>
        </DialogHeader>

        <div className="py-2">
          <StorageCapacitySelect
            value={quotaBytes}
            onChange={setQuotaBytes}
            disabled={pending}
          />
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            disabled={pending}
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button type="button" disabled={pending || accountIds.length === 0} onClick={handleApply}>
            {pending ? "Applying…" : "Apply to selected"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

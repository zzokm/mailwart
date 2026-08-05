"use client"

import { useState } from "react"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

export function ConfirmDestroy({
  open,
  onOpenChange,
  title,
  description,
  confirmValue,
  confirmLabel = "Type to confirm",
  pending,
  onConfirm,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description: string
  confirmValue: string
  confirmLabel?: string
  pending?: boolean
  onConfirm: () => void | Promise<void>
}) {
  const [typed, setTyped] = useState("")
  const matches = typed.trim().toLowerCase() === confirmValue.toLowerCase()

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) setTyped("")
        onOpenChange(next)
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-2">
          <Label htmlFor="confirm-destroy">{confirmLabel}</Label>
          <Input
            id="confirm-destroy"
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            placeholder={confirmValue}
            className="font-mono text-[13px]"
            disabled={pending}
            autoComplete="off"
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
          <Button
            type="button"
            variant="destructive"
            disabled={!matches || pending}
            onClick={async () => {
              await onConfirm()
              setTyped("")
            }}
          >
            Destroy
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

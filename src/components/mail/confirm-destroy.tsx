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
  secondConfirmValue,
  secondConfirmLabel,
  pending,
  onConfirm,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description: string
  confirmValue: string
  confirmLabel?: string
  /** Optional dual-confirm phrase (e.g. admin mailbox destroy). */
  secondConfirmValue?: string
  secondConfirmLabel?: string
  pending?: boolean
  onConfirm: () => void | Promise<void>
}) {
  const [typed, setTyped] = useState("")
  const [typedSecond, setTypedSecond] = useState("")
  const matches = typed.trim().toLowerCase() === confirmValue.toLowerCase()
  const secondMatches =
    !secondConfirmValue ||
    typedSecond.trim().toUpperCase() === secondConfirmValue.toUpperCase()

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          setTyped("")
          setTypedSecond("")
        }
        onOpenChange(next)
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
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
          {secondConfirmValue ? (
            <div className="grid gap-2">
              <Label htmlFor="confirm-destroy-2">
                {secondConfirmLabel ?? "Type secondary confirm"}
              </Label>
              <Input
                id="confirm-destroy-2"
                value={typedSecond}
                onChange={(e) => setTypedSecond(e.target.value)}
                placeholder={secondConfirmValue}
                className="font-mono text-[13px]"
                disabled={pending}
                autoComplete="off"
              />
            </div>
          ) : null}
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
            disabled={!matches || !secondMatches || pending}
            onClick={async () => {
              await onConfirm()
              setTyped("")
              setTypedSecond("")
            }}
          >
            Destroy
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

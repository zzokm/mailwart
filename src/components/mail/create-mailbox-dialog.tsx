"use client"

import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"
import { toast } from "sonner"

import { createMailboxAction } from "@/lib/actions/mail"
import { toastActionResult } from "@/lib/action-toast"
import { PasswordField } from "@/components/mail/password-field"
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { generatePassword } from "@/lib/format"
import type { StalwartDomain } from "@/lib/stalwart/types"

export function CreateMailboxDialog({
  open,
  onOpenChange,
  domains,
  defaultDomainId,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  domains: StalwartDomain[]
  defaultDomainId?: string
}) {
  const router = useRouter()
  const [domainId, setDomainId] = useState(
    defaultDomainId ?? domains[0]?.id ?? ""
  )
  const [local, setLocal] = useState("")
  const [password, setPassword] = useState(() => generatePassword())
  const [description, setDescription] = useState("")
  const [quotaGb, setQuotaGb] = useState("")
  const [pending, startTransition] = useTransition()

  const domain = domains.find((d) => d.id === domainId)
  const preview =
    local && domain ? `${local.trim().toLowerCase()}@${domain.name}` : ""

  function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    startTransition(async () => {
      const diskQuotaBytes =
        quotaGb.trim() === ""
          ? null
          : Math.round(Number(quotaGb) * 1024 ** 3)
      if (quotaGb.trim() && Number.isNaN(diskQuotaBytes)) {
        toast.error("Quota must be a number (GB).")
        return
      }
      const result = await createMailboxAction({
        domainId,
        local,
        password,
        description: description || undefined,
        diskQuotaBytes,
      })
      if (!result.ok) {
        toastActionResult(result, { success: "" })
        return
      }
      toastActionResult(result, { success: `Created ${result.data.email}.` })
      onOpenChange(false)
      setLocal("")
      setDescription("")
      setQuotaGb("")
      setPassword(generatePassword())
      router.refresh()
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={onSubmit}>
          <DialogHeader>
            <DialogTitle>Create mailbox</DialogTitle>
            <DialogDescription>
              Full address is always{" "}
              <span className="font-mono text-foreground/90">
                local@domain
              </span>
              . Copy the password before closing.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid gap-2">
              <Label>Domain</Label>
              <Select
                value={domainId}
                onValueChange={(v) => setDomainId(v ?? "")}
                disabled={pending}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select domain" />
                </SelectTrigger>
                <SelectContent>
                  {domains.map((d) => (
                    <SelectItem key={d.id} value={d.id}>
                      {d.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="local">Local-part</Label>
              <Input
                id="local"
                value={local}
                onChange={(e) => setLocal(e.target.value)}
                placeholder="hi"
                className="font-mono text-[13px]"
                required
                disabled={pending}
              />
              {preview ? (
                <p className="font-mono text-[12px] text-brand">
                  {preview}
                </p>
              ) : null}
            </div>
            <PasswordField
              value={password}
              onChange={setPassword}
              disabled={pending}
            />
            <div className="grid gap-2">
              <Label htmlFor="mb-desc">Description</Label>
              <Input
                id="mb-desc"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Defaults to full email"
                disabled={pending}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="quota">Quota (GB, optional)</Label>
              <Input
                id="quota"
                inputMode="decimal"
                value={quotaGb}
                onChange={(e) => setQuotaGb(e.target.value)}
                placeholder="Server default"
                disabled={pending}
              />
            </div>
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
              type="submit"
              disabled={pending || !domainId || !local.trim()}
            >
              Create
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

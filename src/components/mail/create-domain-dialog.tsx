"use client"

import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"
import { toast } from "sonner"
import { Plus } from "lucide-react"

import { createDomainAction } from "@/lib/actions/mail"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

export function CreateDomainDialog() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [name, setName] = useState("")
  const [description, setDescription] = useState("")
  const [pending, startTransition] = useTransition()

  function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    startTransition(async () => {
      const result = await createDomainAction({
        name,
        description: description || undefined,
      })
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      toast.success(`Created ${result.data.name}.`)
      setOpen(false)
      setName("")
      setDescription("")
      router.refresh()
    })
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button size="sm" />}>
        <Plus data-icon="inline-start" />
        Add domain
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={onSubmit}>
          <DialogHeader>
            <DialogTitle>Add domain</DialogTitle>
            <DialogDescription>
              Creates a Stalwart domain with the minimal proven payload. DNS
              stays external.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid gap-2">
              <Label htmlFor="domain-name">Domain</Label>
              <Input
                id="domain-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="example.com"
                className="font-mono text-[13px]"
                required
                disabled={pending}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="domain-desc">Description</Label>
              <Input
                id="domain-desc"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Defaults to domain name"
                disabled={pending}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={pending}
              onClick={() => setOpen(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={pending || !name.trim()}>
              Create
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

"use client"

import { useRouter } from "next/navigation"
import { useEffect, useState, useTransition } from "react"
import { Cloud, Globe, Plus } from "lucide-react"

import { createDomainAction } from "@/lib/actions/mail"
import { getAvailableCloudflareDomainsAction } from "@/lib/actions/cloudflare"
import { toastActionResult } from "@/lib/action-toast"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
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
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import type { CloudflareZone } from "@/lib/cloudflare/types"

export function CreateDomainDialog() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [name, setName] = useState("")
  const [description, setDescription] = useState("")
  const [selectedSource, setSelectedSource] = useState<string>("external")
  const [autoProvision, setAutoProvision] = useState(true)

  // Cloudflare state
  const [cfConfigured, setCfConfigured] = useState(false)
  const [zones, setZones] = useState<CloudflareZone[]>([])
  const [alreadyAdded, setAlreadyAdded] = useState<string[]>([])
  const [loadingCf, setLoadingCf] = useState(false)

  const [pending, startTransition] = useTransition()

  useEffect(() => {
    if (open) {
      setLoadingCf(true)
      getAvailableCloudflareDomainsAction()
        .then((res) => {
          if (res.ok && res.data.configured) {
            setCfConfigured(true)
            setZones(res.data.zones || [])
            setAlreadyAdded(res.data.alreadyAddedDomains || [])

            const unadded = (res.data.zones || []).filter(
              (z) => !res.data.alreadyAddedDomains.includes(z.name.toLowerCase())
            )
            if (unadded.length > 0) {
              setSelectedSource(unadded[0].name)
              setName(unadded[0].name)
              setAutoProvision(true)
            } else {
              setSelectedSource("external")
            }
          } else {
            setCfConfigured(false)
            setSelectedSource("external")
          }
        })
        .finally(() => setLoadingCf(false))
    }
  }, [open])

  const unaddedZones = zones.filter(
    (z) => !alreadyAdded.includes(z.name.toLowerCase())
  )

  const isSelectedFromCf = selectedSource !== "external"
  const matchingCfZone = zones.find(
    (z) => z.name.toLowerCase() === name.trim().toLowerCase()
  )

  function onSourceChange(val: string | null) {
    if (!val) return
    setSelectedSource(val)
    if (val === "external") {
      setName("")
      setAutoProvision(false)
    } else {
      setName(val)
      setAutoProvision(true)
    }
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    startTransition(async () => {
      const result = await createDomainAction({
        name: name.trim().toLowerCase(),
        description: description || undefined,
        autoProvisionDns: autoProvision,
      })
      if (!result.ok) {
        toastActionResult(result, { success: "" })
        return
      }

      toastActionResult(result, {
        success: `Created domain ${result.data.name}.`,
        note: result.note,
      })
      setOpen(false)
      setName("")
      setDescription("")
      setSelectedSource("external")
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
              Provision a new domain in Stalwart with optional automated Cloudflare DNS setup.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-2">
            {cfConfigured && (
              <div className="grid gap-2">
                <Label htmlFor="domain-source">Domain source</Label>
                <Select value={selectedSource} onValueChange={onSourceChange} disabled={pending || loadingCf}>
                  <SelectTrigger id="domain-source" className="w-full">
                    <SelectValue placeholder="Select domain source..." />
                  </SelectTrigger>
                  <SelectContent>
                    {unaddedZones.length > 0 && (
                      <SelectGroup>
                        <SelectLabel className="flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
                          <Cloud className="size-3 text-amber-500" />
                          Cloudflare account ({unaddedZones.length} available)
                        </SelectLabel>
                        {unaddedZones.map((z) => (
                          <SelectItem key={z.id} value={z.name}>
                            <span className="font-mono">{z.name}</span>
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    )}
                    <SelectGroup>
                      <SelectLabel className="flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
                        <Globe className="size-3" />
                        Other
                      </SelectLabel>
                      <SelectItem value="external">
                        External / Custom domain (Manual entry)
                      </SelectItem>
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="grid gap-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="domain-name">Domain name</Label>
                {isSelectedFromCf && (
                  <Badge variant="outline" className="gap-1 border-amber-500/30 text-[11px] text-amber-600 dark:text-amber-400">
                    <Cloud className="size-3" />
                    Cloudflare Zone
                  </Badge>
                )}
              </div>
              <Input
                id="domain-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="example.com"
                className="font-mono text-[13px]"
                required
                readOnly={isSelectedFromCf}
                disabled={pending}
              />
              {isSelectedFromCf && (
                <p className="text-[12px] text-muted-foreground">
                  Selected directly from your connected Cloudflare account.
                </p>
              )}
            </div>

            <div className="grid gap-2">
              <Label htmlFor="domain-desc">Description (optional)</Label>
              <Input
                id="domain-desc"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Defaults to domain name"
                disabled={pending}
              />
            </div>

            {(isSelectedFromCf || (cfConfigured && matchingCfZone)) && (
              <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-3">
                <div className="flex items-start gap-2.5">
                  <Checkbox
                    id="auto-dns"
                    checked={autoProvision}
                    onCheckedChange={(checked) => setAutoProvision(checked === true)}
                    disabled={pending}
                    className="mt-0.5"
                  />
                  <div className="grid gap-1">
                    <Label
                      htmlFor="auto-dns"
                      className="cursor-pointer text-xs font-medium leading-none"
                    >
                      Auto-provision Cloudflare DNS records
                    </Label>
                    <p className="text-[11px] text-muted-foreground leading-relaxed">
                      Automatically creates MX (mail.yehia.dev), SPF, DKIM (RSA-2048), and DMARC records with DNS-only proxy in your Cloudflare zone.
                    </p>
                  </div>
                </div>
              </div>
            )}
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
              {pending ? "Creating..." : "Create domain"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

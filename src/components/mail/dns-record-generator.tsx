"use client"

import { useState, useTransition } from "react"
import {
  generateDkimAction,
  generateDmarcAction,
} from "@/lib/actions/mail"
import { toastActionResult } from "@/lib/action-toast"
import { CopyButton } from "@/components/mail/copy-button"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import type {
  DkimGeneratedRecord,
  DmarcGeneratedRecord,
} from "@/lib/stalwart/types"

function RecordBlock({
  title,
  name,
  value,
  zoneLine,
  extra,
}: {
  title: string
  name: string
  value: string
  zoneLine: string
  extra?: React.ReactNode
}) {
  return (
    <div className="space-y-2 rounded-lg border border-border/60 p-3">
      <div className="font-mono text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
        {title}
      </div>
      <div className="grid gap-1">
        <span className="text-[11px] text-muted-foreground">Name</span>
        <div className="flex flex-wrap items-center gap-2">
          <code className="min-w-0 flex-1 break-all font-mono text-[12px]">
            {name}
          </code>
          <CopyButton value={name} label="Copy" size="xs" />
        </div>
      </div>
      <div className="grid gap-1">
        <span className="text-[11px] text-muted-foreground">TXT value</span>
        <div className="flex flex-wrap items-start gap-2">
          <code className="max-h-28 min-w-0 flex-1 overflow-y-auto break-all rounded-md bg-muted/50 px-2 py-1.5 font-mono text-[11px]">
            {value}
          </code>
          <CopyButton value={value} label="Copy" size="xs" />
        </div>
      </div>
      <div className="grid gap-1">
        <span className="text-[11px] text-muted-foreground">Zone line</span>
        <div className="flex flex-wrap items-start gap-2">
          <code className="max-h-24 min-w-0 flex-1 overflow-y-auto break-all rounded-md bg-muted/50 px-2 py-1.5 font-mono text-[11px]">
            {zoneLine}
          </code>
          <CopyButton value={zoneLine} label="Copy" size="xs" />
        </div>
      </div>
      {extra}
    </div>
  )
}

export function DnsRecordGenerator({ domainName }: { domainName: string }) {
  const [selector, setSelector] = useState("mailwart")
  const [policy, setPolicy] = useState<"none" | "quarantine" | "reject">(
    "quarantine"
  )
  const [rua, setRua] = useState("")
  const [dkim, setDkim] = useState<DkimGeneratedRecord | null>(null)
  const [dmarc, setDmarc] = useState<DmarcGeneratedRecord | null>(null)
  const [spf, setSpf] = useState<{
    dnsName: string
    dnsValue: string
    zoneLine: string
  } | null>(null)
  const [pending, startTransition] = useTransition()

  function onGenerateDkim() {
    startTransition(async () => {
      const result = await generateDkimAction({
        domain: domainName,
        selector,
      })
      if (
        !toastActionResult(result, {
          success:
            "DKIM keypair generated. Copy the TXT record; keep the private key offline.",
        })
      ) {
        return
      }
      setDkim(result.data)
    })
  }

  function onGenerateDmarc() {
    startTransition(async () => {
      const result = await generateDmarcAction({
        domain: domainName,
        policy,
        rua: rua.trim() || undefined,
      })
      if (
        !toastActionResult(result, {
          success: "DMARC (and suggested SPF) strings ready to paste.",
        })
      ) {
        return
      }
      setDmarc(result.data.dmarc)
      setSpf(result.data.spf)
    })
  }

  return (
    <section className="space-y-4 rounded-xl border border-border/80 p-4 sm:p-5">
      <div>
        <h2 className="font-mono text-[11px] tracking-wide text-muted-foreground">
          DNS record generator
        </h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Generates copy-paste strings only — mailwart does not write to your
          DNS provider. If Stalwart manages DKIM automatically, prefer its
          published selector over a local keypair.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-3">
          <div className="grid gap-2">
            <Label htmlFor="dkim-selector">DKIM selector</Label>
            <Input
              id="dkim-selector"
              value={selector}
              onChange={(e) => setSelector(e.target.value)}
              placeholder="mailwart"
              className="font-mono text-[13px]"
              disabled={pending}
            />
          </div>
          <Button
            type="button"
            size="sm"
            disabled={pending || !selector.trim()}
            onClick={onGenerateDkim}
          >
            Generate DKIM
          </Button>
        </div>

        <div className="space-y-3">
          <div className="grid gap-2">
            <Label>DMARC policy</Label>
            <Select
              value={policy}
              onValueChange={(v) =>
                setPolicy((v as "none" | "quarantine" | "reject") ?? "quarantine")
              }
              disabled={pending}
            >
              <SelectTrigger className="w-full font-mono text-[13px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">p=none</SelectItem>
                <SelectItem value="quarantine">p=quarantine</SelectItem>
                <SelectItem value="reject">p=reject</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="dmarc-rua">RUA (optional)</Label>
            <Input
              id="dmarc-rua"
              value={rua}
              onChange={(e) => setRua(e.target.value)}
              placeholder={`dmarc@${domainName}`}
              className="font-mono text-[13px]"
              disabled={pending}
            />
          </div>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={pending}
            onClick={onGenerateDmarc}
          >
            Generate DMARC + SPF
          </Button>
        </div>
      </div>

      <div className="grid gap-3">
        {dkim ? (
          <>
            <RecordBlock
              title="DKIM TXT"
              name={dkim.dnsName}
              value={dkim.dnsValue}
              zoneLine={dkim.zoneLine}
              extra={
                <div className="grid gap-1 pt-1">
                  <span className="text-[11px] text-warn">
                    Private key — store offline; never paste into public DNS.
                  </span>
                  <div className="flex flex-wrap items-start gap-2">
                    <code className="max-h-24 min-w-0 flex-1 overflow-y-auto whitespace-pre-wrap break-all rounded-md border border-warn/30 bg-muted/40 px-2 py-1.5 font-mono text-[10px]">
                      {dkim.privateKeyPem}
                    </code>
                    <CopyButton
                      value={dkim.privateKeyPem}
                      label="Copy key"
                      size="xs"
                    />
                  </div>
                </div>
              }
            />
          </>
        ) : null}
        {dmarc ? (
          <RecordBlock
            title="DMARC TXT"
            name={dmarc.dnsName}
            value={dmarc.dnsValue}
            zoneLine={dmarc.zoneLine}
          />
        ) : null}
        {spf ? (
          <RecordBlock
            title="Suggested SPF TXT"
            name={spf.dnsName}
            value={spf.dnsValue}
            zoneLine={spf.zoneLine}
          />
        ) : null}
      </div>
    </section>
  )
}

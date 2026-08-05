"use client"

import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"
import { ExternalLink, KeyRound, Plus, Trash2 } from "lucide-react"
import { toast } from "sonner"

import {
  createAppPasswordAction,
  revokeAppPasswordAction,
} from "@/lib/actions/mail"
import { CopyButton } from "@/components/mail/copy-button"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import type { AppPassword } from "@/lib/stalwart/types"

export function AppPasswordPanel({
  accountId,
  email,
  passwords,
  mutable,
  adminUiUrl,
}: {
  accountId: string
  email: string
  passwords: AppPassword[]
  mutable: boolean
  adminUiUrl: string
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [label, setLabel] = useState("")
  const [revealedSecret, setRevealedSecret] = useState<string | null>(null)

  return (
    <section className="space-y-4 rounded-xl border border-border/80 p-4 sm:p-5">
      <div>
        <h2 className="text-sm font-medium">App passwords</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Distinct secrets for SMTP/IMAP clients. Shown once at create — copy
          before leaving.
        </p>
      </div>

      {!mutable ? (
        <div className="rounded-lg border border-dashed border-border/70 bg-muted/10 px-3 py-3 text-xs text-muted-foreground">
          <p>
            Live{" "}
            <code className="font-mono text-[11px]">x:AppPassword</code> query
            did not confirm an account-scoped list. Manage credentials in
            Stalwart Admin, or retry after the association probe lands.
          </p>
          {/* TODO: Confirm accountId filter on x:AppPassword/query against staging. */}
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="mt-3"
            nativeButton={false}
            render={
              <a href={adminUiUrl} target="_blank" rel="noreferrer" />
            }
          >
            <ExternalLink data-icon="inline-start" />
            Open Stalwart Admin
          </Button>
        </div>
      ) : null}

      {passwords.length === 0 ? (
        <p className="font-mono text-[12px] text-muted-foreground">
          No app passwords on record for {email}.
        </p>
      ) : (
        <ul className="space-y-2">
          {passwords.map((p) => (
            <li
              key={p.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border/60 px-3 py-2"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <KeyRound className="size-3.5 shrink-0 text-muted-foreground" />
                  <span className="truncate text-sm">{p.description}</span>
                </div>
                {p.createdAt ? (
                  <div className="mt-0.5 font-mono text-[11px] text-muted-foreground">
                    {new Date(p.createdAt).toLocaleString()}
                  </div>
                ) : null}
              </div>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                disabled={pending || !mutable}
                onClick={() => {
                  startTransition(async () => {
                    const result = await revokeAppPasswordAction(
                      accountId,
                      p.id
                    )
                    if (!result.ok) {
                      toast.error(result.error)
                      return
                    }
                    toast.success(`Revoked “${p.description}”.`)
                    router.refresh()
                  })
                }}
              >
                <Trash2 data-icon="inline-start" />
                Revoke
              </Button>
            </li>
          ))}
        </ul>
      )}

      {mutable ? (
        <div className="grid gap-3 border-t border-border/60 pt-4">
          <div className="grid gap-2">
            <Label htmlFor="app-pw-label">Client label</Label>
            <Input
              id="app-pw-label"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="Thunderbird, Phone IMAP…"
              disabled={pending}
            />
          </div>
          {revealedSecret ? (
            <div className="rounded-lg border border-brand/30 bg-brand/5 px-3 py-3">
              <p className="text-xs text-muted-foreground">
                Copy now — it will not be shown again.
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <code className="font-mono text-[13px] break-all text-foreground">
                  {revealedSecret}
                </code>
                <CopyButton value={revealedSecret} label="Copy secret" />
              </div>
            </div>
          ) : null}
          <Button
            type="button"
            size="sm"
            disabled={pending || !label.trim()}
            onClick={() => {
              startTransition(async () => {
                const result = await createAppPasswordAction(
                  accountId,
                  label
                )
                if (!result.ok) {
                  toast.error(result.error)
                  return
                }
                setRevealedSecret(result.data.secret)
                setLabel("")
                toast.success(`Created app password “${result.data.password.description}”.`)
                router.refresh()
              })
            }}
          >
            <Plus data-icon="inline-start" />
            Create app password
          </Button>
        </div>
      ) : null}
    </section>
  )
}

"use client"

import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"
import { toast } from "sonner"

import {
  destroyMailboxAction,
  resetMailboxPasswordAction,
  updateMailboxAction,
} from "@/lib/actions/mail"
import { ConfirmDestroy } from "@/components/mail/confirm-destroy"
import { CopyButton } from "@/components/mail/copy-button"
import { PasswordField } from "@/components/mail/password-field"
import { RoundcubeButton } from "@/components/mail/roundcube-button"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { generatePassword } from "@/lib/format"
import type { StalwartAccount } from "@/lib/stalwart/types"

export function MailboxDetailClient({
  account,
  roundcubeUrl,
  aliasesEditable,
}: {
  account: StalwartAccount
  roundcubeUrl: string
  aliasesEditable: boolean
}) {
  const router = useRouter()
  const [description, setDescription] = useState(account.description ?? "")
  const [quotaGb, setQuotaGb] = useState(() => {
    const disk = account.quotas?.diskQuota
    if (typeof disk === "number" && disk > 0) {
      return String(Math.round((disk / 1024 ** 3) * 10) / 10)
    }
    return ""
  })
  const [password, setPassword] = useState(() => generatePassword())
  const [pending, startTransition] = useTransition()
  const [destroyOpen, setDestroyOpen] = useState(false)

  const aliasesRaw =
    account.aliases == null
      ? null
      : Array.isArray(account.aliases)
        ? account.aliases
        : Object.keys(account.aliases as object).length === 0
          ? []
          : account.aliases

  return (
    <div className="grid gap-6 lg:grid-cols-[1.2fr_1fr]">
      <section className="space-y-5 rounded-xl border border-border/80 p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="font-mono text-[15px] text-foreground">
              {account.email}
            </div>
            <div className="mt-1 text-xs text-muted-foreground">
              Local-part{" "}
              <span className="font-mono text-foreground/80">{account.name}</span>
              {account.domainName ? (
                <>
                  {" "}
                  ·{" "}
                  <span className="font-mono text-foreground/80">
                    {account.domainName}
                  </span>
                </>
              ) : null}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <CopyButton value={account.email} label="Copy email" />
            <RoundcubeButton href={roundcubeUrl} email={account.email} />
          </div>
        </div>

        <div className="grid gap-2">
          <Label htmlFor="mb-description">Description</Label>
          <Input
            id="mb-description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            disabled={pending}
          />
        </div>

        <div className="grid gap-2">
          <Label htmlFor="mb-quota">Quota (GB)</Label>
          <Input
            id="mb-quota"
            value={quotaGb}
            onChange={(e) => setQuotaGb(e.target.value)}
            placeholder="Server default"
            disabled={pending}
          />
        </div>

        <Button
          type="button"
          disabled={pending}
          onClick={() => {
            startTransition(async () => {
              const diskQuotaBytes =
                quotaGb.trim() === ""
                  ? null
                  : Math.round(Number(quotaGb) * 1024 ** 3)
              if (quotaGb.trim() && Number.isNaN(diskQuotaBytes)) {
                toast.error("Quota must be a number (GB).")
                return
              }
              const result = await updateMailboxAction(account.id, {
                description: description.trim() || account.email,
                diskQuotaBytes,
              })
              if (!result.ok) {
                toast.error(result.error)
                return
              }
              toast.success(`Updated ${account.email}.`)
              router.refresh()
            })
          }}
        >
          Save changes
        </Button>
      </section>

      <div className="space-y-6">
        <section className="space-y-4 rounded-xl border border-border/80 p-4 sm:p-5">
          <div>
            <h2 className="text-sm font-medium">Reset password</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Shown once here — copy before leaving. Never displays the stored
              hash.
            </p>
          </div>
          <PasswordField
            value={password}
            onChange={setPassword}
            disabled={pending}
          />
          <Button
            type="button"
            variant="outline"
            disabled={pending || password.length < 6}
            onClick={() => {
              startTransition(async () => {
                const result = await resetMailboxPasswordAction(
                  account.id,
                  password
                )
                if (!result.ok) {
                  toast.error(result.error)
                  return
                }
                toast.success(`Password reset for ${result.data.email}.`)
              })
            }}
          >
            Apply new password
          </Button>
        </section>

        <section className="space-y-3 rounded-xl border border-border/80 p-4 sm:p-5">
          <div>
            <h2 className="text-sm font-medium">Aliases & forwarding</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              {aliasesEditable
                ? "Edit aliases for this mailbox."
                : "Edit gated until live Account/get aliases shape probe completes."}
            </p>
          </div>
          <div className="rounded-lg border border-dashed border-border/70 bg-muted/10 px-3 py-3 font-mono text-[12px] text-muted-foreground">
            {aliasesRaw == null ||
            (Array.isArray(aliasesRaw) && aliasesRaw.length === 0) ||
            (typeof aliasesRaw === "object" &&
              !Array.isArray(aliasesRaw) &&
              Object.keys(aliasesRaw).length === 0) ? (
              <span>No aliases on record.</span>
            ) : (
              <pre className="overflow-x-auto whitespace-pre-wrap">
                {JSON.stringify(aliasesRaw, null, 2)}
              </pre>
            )}
          </div>
          <Button type="button" variant="outline" size="sm" disabled>
            Edit aliases (probe pending)
          </Button>
        </section>

        <section className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 sm:p-5">
          <h2 className="text-sm font-medium text-destructive">Danger</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Typed full-email confirm. Blocked if this mailbox is the domain
            catch-all target.
          </p>
          <Button
            type="button"
            variant="destructive"
            className="mt-3"
            disabled={pending || account.isAdmin}
            onClick={() => setDestroyOpen(true)}
          >
            Delete mailbox
          </Button>
        </section>
      </div>

      <ConfirmDestroy
        open={destroyOpen}
        onOpenChange={setDestroyOpen}
        title={`Delete ${account.email}?`}
        description="Type the full email address to confirm destroy."
        confirmValue={account.email}
        confirmLabel="Type full email"
        pending={pending}
        onConfirm={() => {
          startTransition(async () => {
            const result = await destroyMailboxAction(account.id, account.email)
            if (!result.ok) {
              toast.error(result.error)
              return
            }
            toast.success(`Deleted ${account.email}.`)
            router.push("/dashboard/mailboxes")
            router.refresh()
          })
        }}
      />
    </div>
  )
}

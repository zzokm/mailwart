"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"
import { toast } from "sonner"

import {
  destroyMailboxAction,
  resetMailboxPasswordAction,
  updateMailboxAction,
  upsertForwardingRuleAction,
} from "@/lib/actions/mail"
import { AppPasswordPanel } from "@/components/mail/app-password-panel"
import { AliasesPanel } from "@/components/mail/aliases-panel"
import { ConfirmDestroy } from "@/components/mail/confirm-destroy"
import { CopyButton } from "@/components/mail/copy-button"
import { PasswordField } from "@/components/mail/password-field"
import { QuotaBar } from "@/components/mail/quota-bar"
import { RoundcubeButton } from "@/components/mail/roundcube-button"
import { TwoFactorStatusPanel } from "@/components/mail/two-factor-status"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { generatePassword } from "@/lib/format"
import { toastActionResult } from "@/lib/action-toast"
import { ADMIN_DESTROY_CONFIRM } from "@/lib/validations/mailbox"
import type {
  AppPassword,
  ForwardingRule,
  StalwartAccount,
  StalwartDomain,
  TwoFactorStatus,
} from "@/lib/stalwart/types"

export function MailboxDetailClient({
  account,
  domains,
  roundcubeUrl,
  aliasesEditable,
  appPasswords,
  appPasswordsMutable,
  twoFactor,
  adminUiUrl,
  forwards,
}: {
  account: StalwartAccount
  domains: StalwartDomain[]
  roundcubeUrl: string
  aliasesEditable: boolean
  appPasswords: AppPassword[]
  appPasswordsMutable: boolean
  twoFactor: TwoFactorStatus
  adminUiUrl: string
  forwards: ForwardingRule[]
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
  const [enabled, setEnabled] = useState(account.isEnabled !== false)
  const [pending, startTransition] = useTransition()
  const [destroyOpen, setDestroyOpen] = useState(false)

  function toggleSuspend() {
    const next = !enabled
    setEnabled(next)
    startTransition(async () => {
      const result = await updateMailboxAction(account.id, {
        isEnabled: next,
      })
      if (!result.ok) {
        setEnabled(!next)
        toast.error(result.error)
        return
      }
      toast.success(
        next ? `Enabled ${account.email}.` : `Suspended ${account.email}.`
      )
      router.refresh()
    })
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1.2fr_1fr]">
      <div className="space-y-6">
        <section className="space-y-5 rounded-xl border border-border/80 p-4 sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <div className="font-mono text-[15px] text-foreground">
                  {account.email}
                </div>
                <Badge
                  variant={enabled ? "outline" : "destructive"}
                  className="font-mono text-[10px]"
                >
                  {enabled ? "active" : "suspended"}
                </Badge>
                {account.isAdmin ? (
                  <Badge variant="outline" className="font-mono text-[10px]">
                    admin
                  </Badge>
                ) : null}
              </div>
              <div className="mt-1 text-xs text-muted-foreground">
                Local-part{" "}
                <span className="font-mono text-foreground/80">
                  {account.name}
                </span>
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

          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border/60 bg-muted/10 px-3 py-2.5">
            <div>
              <div className="text-sm font-medium">
                {enabled ? "Mailbox active" : "Mailbox suspended"}
              </div>
              <p className="text-xs text-muted-foreground">
                Suspend blocks login when Stalwart honors{" "}
                <code className="font-mono text-[11px]">isEnabled</code>.
              </p>
            </div>
            <Button
              type="button"
              size="sm"
              variant={enabled ? "outline" : "default"}
              disabled={pending || account.isAdmin}
              onClick={toggleSuspend}
            >
              {enabled ? "Suspend" : "Enable"}
            </Button>
          </div>

          <div className="grid gap-2">
            <Label>Space usage</Label>
            <QuotaBar quotas={account.quotas} className="max-w-xs" />
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

        <AppPasswordPanel
          accountId={account.id}
          email={account.email}
          passwords={appPasswords}
          mutable={appPasswordsMutable}
          adminUiUrl={adminUiUrl}
        />
      </div>

      <div className="space-y-6">
        <TwoFactorStatusPanel status={twoFactor} adminUiUrl={adminUiUrl} />

        <section className="space-y-4 rounded-xl border border-border/80 p-4 sm:p-5">
          <div>
            <h2 className="text-sm font-medium">Reset password</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Shown once here, so copy it before leaving. Never displays the
              stored hash.
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
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <h2 className="text-sm font-medium">Forwarding</h2>
              <p className="mt-1 text-xs text-muted-foreground">
                Redirects for this mailbox. Aliases are edited below; cross-domain
                catch-alls live on Routing.
              </p>
            </div>
            <Button
              type="button"
              size="sm"
              variant="outline"
              nativeButton={false}
              render={<Link href="/dashboard/routing" />}
            >
              Routing
            </Button>
          </div>
          {forwards.length > 0 ? (
            <ul className="space-y-2">
              {forwards.map((f) => (
                <li
                  key={f.id}
                  className="flex flex-wrap items-center gap-2 rounded-lg border border-border/60 px-3 py-2 text-xs"
                >
                  <span className="font-mono">{f.source}</span>
                  <span className="text-muted-foreground">→</span>
                  <span className="font-mono">{f.targets.join(", ")}</span>
                  <Badge variant="outline" className="font-mono text-[10px]">
                    {f.backend}
                  </Badge>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-muted-foreground">
              No user forwards on this mailbox.
            </p>
          )}
          <MailboxForwardForm account={account} />
        </section>

        <AliasesPanel
          accountId={account.id}
          aliasesRaw={account.aliases}
          domains={domains}
          editable={aliasesEditable}
          defaultDomainId={account.domainId}
        />

        <section className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 sm:p-5">
          <h2 className="text-sm font-medium text-destructive">Danger</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Typed full-email confirm
            {account.isAdmin
              ? ` plus “${ADMIN_DESTROY_CONFIRM}” for admin mailboxes`
              : ""}
            . Blocked if this mailbox is the domain catch-all target.
          </p>
          <Button
            type="button"
            variant="destructive"
            className="mt-3"
            disabled={pending}
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
        description={
          account.isAdmin
            ? "Admin mailbox: type the full email, then DESTROY ADMIN."
            : "Type the full email address to confirm destroy."
        }
        confirmValue={account.email}
        confirmLabel="Type full email"
        secondConfirmValue={account.isAdmin ? ADMIN_DESTROY_CONFIRM : undefined}
        secondConfirmLabel={
          account.isAdmin ? `Type ${ADMIN_DESTROY_CONFIRM}` : undefined
        }
        pending={pending}
        onConfirm={() => {
          startTransition(async () => {
            const result = await destroyMailboxAction(
              account.id,
              account.email,
              account.isAdmin
                ? { adminConfirm: ADMIN_DESTROY_CONFIRM }
                : undefined
            )
            if (
              !toastActionResult(result, {
                success: `Deleted ${account.email}.`,
              })
            ) {
              return
            }
            router.push("/dashboard/mailboxes")
            router.refresh()
          })
        }}
      />
    </div>
  )
}

function MailboxForwardForm({ account }: { account: StalwartAccount }) {
  const router = useRouter()
  const [targets, setTargets] = useState("")
  const [keepCopy, setKeepCopy] = useState(true)
  const [pending, startTransition] = useTransition()

  if (!account.domainId) return null

  return (
    <div className="space-y-3 border-t border-border/60 pt-3">
      <Label htmlFor="fwd-targets">Add user forward</Label>
      <Input
        id="fwd-targets"
        className="font-mono text-[13px]"
        value={targets}
        onChange={(e) => setTargets(e.target.value)}
        placeholder="ops@example.org"
        disabled={pending}
      />
      <div className="flex items-center gap-2">
        <Checkbox
          id="fwd-keep"
          checked={keepCopy}
          onCheckedChange={(v) => setKeepCopy(v === true)}
          disabled={pending}
        />
        <Label htmlFor="fwd-keep" className="font-normal">
          Keep local copy
        </Label>
      </div>
      <Button
        type="button"
        size="sm"
        disabled={pending || !targets.trim()}
        onClick={() => {
          startTransition(async () => {
            const result = await upsertForwardingRuleAction({
              scope: "user",
              domainId: account.domainId!,
              source: account.email,
              sourceAccountId: account.id,
              targets: targets
                .split(/[,;\s]+/)
                .map((t) => t.trim())
                .filter(Boolean),
              keepLocalCopy: keepCopy,
              enabled: true,
            })
            if (!result.ok) {
              toast.error(result.error)
              return
            }
            toast.success(`Forward created for ${account.email}.`)
            setTargets("")
            router.refresh()
          })
        }}
      >
        Create forward
      </Button>
    </div>
  )
}


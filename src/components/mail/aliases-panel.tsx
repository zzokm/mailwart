"use client"

import { useRouter } from "next/navigation"
import { useMemo, useState, useTransition } from "react"
import { Plus, Trash2 } from "lucide-react"
import { updateMailboxAliasesAction } from "@/lib/actions/mail"
import { toastActionResult } from "@/lib/action-toast"
import { parseEmailAliases } from "@/lib/stalwart/routing-utils"
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
  AccountAliases,
  StalwartDomain,
} from "@/lib/stalwart/types"

type DraftAlias = {
  key: string
  name: string
  domainId: string
  enabled: boolean
  description?: string
}

export function AliasesPanel({
  accountId,
  aliasesRaw,
  domains,
  editable,
  defaultDomainId,
}: {
  accountId: string
  aliasesRaw: AccountAliases | undefined
  domains: StalwartDomain[]
  editable: boolean
  defaultDomainId?: string
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const domainsById = useMemo(
    () => new Map(domains.map((d) => [d.id, d])),
    [domains]
  )
  const initial = useMemo(
    () => parseEmailAliases(aliasesRaw, domainsById),
    [aliasesRaw, domainsById]
  )
  const [drafts, setDrafts] = useState<DraftAlias[]>(() =>
    initial.map((a) => ({
      key: a.key,
      name: a.name,
      domainId: a.domainId,
      enabled: a.enabled,
      description: a.description,
    }))
  )

  const enabledDomains = domains.filter((d) => d.isEnabled !== false)

  function addRow() {
    setDrafts((prev) => [
      ...prev,
      {
        key: `new-${prev.length}`,
        name: "",
        domainId: defaultDomainId ?? enabledDomains[0]?.id ?? "",
        enabled: true,
      },
    ])
  }

  function save() {
    startTransition(async () => {
      const result = await updateMailboxAliasesAction(
        accountId,
        drafts.map((d) => ({
          key: /^\d+$/.test(d.key) ? d.key : undefined,
          name: d.name,
          domainId: d.domainId,
          enabled: d.enabled,
          description: d.description,
        }))
      )
      if (
        !toastActionResult(result, {
          success: result.ok
            ? result.data.length === 0
              ? "Aliases cleared."
              : `Saved ${result.data.length} alias${result.data.length === 1 ? "" : "es"}.`
            : "",
        })
      ) {
        return
      }
      router.refresh()
    })
  }

  return (
    <section className="space-y-4 rounded-xl border border-border/80 p-4 sm:p-5">
      <div>
        <h2 className="text-sm font-medium">Aliases</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Alternate local-parts that deliver into this mailbox. External
          redirects belong in Routing forwards or Filters (Sieve).
        </p>
      </div>

      {drafts.length === 0 ? (
        <p className="font-mono text-[12px] text-muted-foreground">
          No aliases on record.
        </p>
      ) : (
        <ul className="space-y-3">
          {drafts.map((row, idx) => {
            const domainName =
              domains.find((d) => d.id === row.domainId)?.name ?? "…"
            return (
              <li
                key={`${row.key}-${idx}`}
                className="grid gap-2 rounded-lg border border-border/60 p-3 sm:grid-cols-[1fr_1fr_auto]"
              >
                <div className="grid gap-1.5">
                  <Label className="text-[11px] text-muted-foreground">
                    Local-part
                  </Label>
                  <Input
                    value={row.name}
                    disabled={pending || !editable}
                    onChange={(e) => {
                      const name = e.target.value
                      setDrafts((prev) =>
                        prev.map((r, i) => (i === idx ? { ...r, name } : r))
                      )
                    }}
                    className="font-mono text-[13px]"
                    placeholder="alias"
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label className="text-[11px] text-muted-foreground">
                    Domain
                  </Label>
                  <Select
                    items={Object.fromEntries(
                      enabledDomains.map((d) => [d.id, d.name])
                    )}
                    value={row.domainId}
                    disabled={pending || !editable}
                    onValueChange={(v) => {
                      if (!v) return
                      setDrafts((prev) =>
                        prev.map((r, i) =>
                          i === idx ? { ...r, domainId: v } : r
                        )
                      )
                    }}
                  >
                    <SelectTrigger className="w-full font-mono text-[13px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {enabledDomains.map((d) => (
                        <SelectItem key={d.id} value={d.id}>
                          {d.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="font-mono text-[11px] text-muted-foreground">
                    {row.name
                      ? `${row.name.toLowerCase()}@${domainName}`
                      : `…@${domainName}`}
                  </p>
                </div>
                <div className="flex items-end justify-end gap-1">
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    disabled={pending || !editable}
                    onClick={() =>
                      setDrafts((prev) => prev.filter((_, i) => i !== idx))
                    }
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                </div>
              </li>
            )
          })}
        </ul>
      )}

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={pending || !editable || enabledDomains.length === 0}
          onClick={addRow}
        >
          <Plus data-icon="inline-start" />
          Add alias
        </Button>
        <Button
          type="button"
          size="sm"
          disabled={pending || !editable}
          onClick={save}
        >
          Save aliases
        </Button>
      </div>
    </section>
  )
}

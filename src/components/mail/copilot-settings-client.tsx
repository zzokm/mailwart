"use client"

import { useCallback, useEffect, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { RefreshCw } from "lucide-react"

import {
  fetchCopilotModelsAction,
  saveCopilotSettingsAction,
} from "@/lib/actions/copilot"
import { toastActionResult } from "@/lib/action-toast"
import type { CopilotProviderId } from "@/lib/copilot/providers"
import type { CopilotPublicStatus } from "@/lib/copilot/types"
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

type Props = {
  initial: CopilotPublicStatus
}

export function CopilotSettingsClient({ initial }: Props) {
  const router = useRouter()
  const [status, setStatus] = useState(initial)
  const [provider, setProvider] = useState<CopilotProviderId>(
    initial.activeProvider
  )
  const [model, setModel] = useState("")
  const [apiKey, setApiKey] = useState("")
  const [baseUrl, setBaseUrl] = useState("")
  const [models, setModels] = useState<Array<{ id: string; label: string }>>(
    []
  )
  const [modelsError, setModelsError] = useState<string | undefined>()
  const [pending, startTransition] = useTransition()
  const [listing, setListing] = useState(false)

  const current = status.providers.find((p) => p.id === provider)

  const syncFromStatus = useCallback(
    (next: CopilotPublicStatus, providerId: CopilotProviderId) => {
      setStatus(next)
      const row = next.providers.find((p) => p.id === providerId)
      setModel(row?.model ?? "")
      setBaseUrl(row?.baseUrl ?? "")
      setApiKey("")
    },
    []
  )

  useEffect(() => {
    syncFromStatus(initial, initial.activeProvider)
    setProvider(initial.activeProvider)
  }, [initial, syncFromStatus])

  const loadModels = useCallback(
    async (providerId: CopilotProviderId) => {
      setListing(true)
      setModelsError(undefined)
      try {
        const result = await fetchCopilotModelsAction({ provider: providerId })
        if (!result.ok) {
          setModels([])
          setModelsError(result.error)
          return
        }
        setModels(result.data.models)
        setModelsError(result.data.error)
        setModel((prev) => {
          if (prev && result.data.models.some((m) => m.id === prev)) return prev
          const row = status.providers.find((p) => p.id === providerId)
          if (row?.model && result.data.models.some((m) => m.id === row.model)) {
            return row.model
          }
          return result.data.models[0]?.id ?? row?.model ?? prev
        })
      } finally {
        setListing(false)
      }
    },
    [status.providers]
  )

  useEffect(() => {
    if (!current?.configured) {
      setModels([])
      setModelsError(
        current?.keyOptional
          ? undefined
          : "Enter an API key (or set COPILOT_* env) to load models."
      )
      return
    }
    void loadModels(provider)
    // Intentionally when provider / configured flips — not on every status tick.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [provider, current?.configured])

  function onProviderChange(value: string | null) {
    if (!value) return
    const id = value as CopilotProviderId
    setProvider(id)
    const row = status.providers.find((p) => p.id === id)
    setModel(row?.model ?? "")
    setBaseUrl(row?.baseUrl ?? "")
    setApiKey("")
  }

  function onSave(e: React.FormEvent) {
    e.preventDefault()
    startTransition(async () => {
      const result = await saveCopilotSettingsAction({
        provider,
        model: model.trim() || undefined,
        apiKey: apiKey.trim() || undefined,
        baseUrl: baseUrl.trim() || undefined,
      })
      if (!toastActionResult(result, { success: "Copilot settings saved." })) {
        return
      }
      syncFromStatus(result.data, provider)
      void loadModels(provider)
      router.refresh()
    })
  }

  function onClearKey() {
    startTransition(async () => {
      const result = await saveCopilotSettingsAction({
        provider,
        model: model.trim() || undefined,
        clearKey: true,
      })
      if (
        !toastActionResult(result, {
          success: "Cleared Settings-stored key (env keys untouched).",
        })
      ) {
        return
      }
      syncFromStatus(result.data, provider)
      router.refresh()
    })
  }

  const providerItems = Object.fromEntries(
    status.providers.map((p) => [p.id, p.label])
  )
  const modelItems = Object.fromEntries(models.map((m) => [m.id, m.label]))

  return (
    <form onSubmit={onSave} className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span
          className={
            status.ready
              ? "text-emerald-700 dark:text-emerald-400"
              : "text-muted-foreground"
          }
        >
          {status.ready ? "Ready" : "Not configured"}
        </span>
        {current?.keyLast4 ? (
          <span className="font-mono text-[13px] text-muted-foreground">
            key {current.keyLast4}
            {current.keySource === "env" ? " (env)" : " (settings)"}
          </span>
        ) : current?.keyOptional ? (
          <span className="text-muted-foreground">no key required</span>
        ) : (
          <span className="text-muted-foreground">key missing</span>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2 sm:col-span-2">
          <Label>Provider</Label>
          <Select
            items={providerItems}
            value={provider}
            onValueChange={onProviderChange}
            disabled={pending}
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Select provider" />
            </SelectTrigger>
            <SelectContent>
              {status.providers.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.label}
                  {p.configured ? "" : " — missing key"}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2 sm:col-span-2">
          <div className="flex items-center justify-between gap-2">
            <Label>Model</Label>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={pending || listing || !current?.configured}
              onClick={() => void loadModels(provider)}
            >
              <RefreshCw
                data-icon="inline-start"
                className={listing ? "animate-spin" : undefined}
              />
              Refresh
            </Button>
          </div>
          {models.length > 0 ? (
            <Select
              items={modelItems}
              value={model || null}
              onValueChange={(v) => setModel(v ?? "")}
              disabled={pending || listing}
            >
              <SelectTrigger className="w-full font-mono text-[13px]">
                <SelectValue placeholder="Select model" />
              </SelectTrigger>
              <SelectContent>
                {models.map((m) => (
                  <SelectItem key={m.id} value={m.id} className="font-mono">
                    {m.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <Input
              value={model}
              onChange={(e) => setModel(e.target.value)}
              placeholder="model-id"
              className="font-mono text-[13px]"
              disabled={pending}
            />
          )}
          {modelsError ? (
            <p className="text-xs text-muted-foreground">{modelsError}</p>
          ) : null}
        </div>

        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="copilot-api-key">API key</Label>
          <Input
            id="copilot-api-key"
            type="password"
            autoComplete="off"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder={
              current?.keyLast4
                ? `Stored ${current.keyLast4} — paste to replace`
                : "sk-… (stored server-side; prefer COPILOT_* env)"
            }
            disabled={pending}
          />
          <p className="text-xs text-muted-foreground">
            Env keys win over Settings. Never use{" "}
            <code className="font-mono">NEXT_PUBLIC_*</code> for secrets.
          </p>
          {current?.keySource === "settings" ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={pending}
              onClick={onClearKey}
            >
              Clear settings key
            </Button>
          ) : null}
        </div>

        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="copilot-base-url">Base URL</Label>
          <Input
            id="copilot-base-url"
            value={baseUrl}
            onChange={(e) => setBaseUrl(e.target.value)}
            placeholder="https://api.example.com/v1"
            className="font-mono text-[13px]"
            disabled={pending}
          />
        </div>
      </div>

      <Button type="submit" size="sm" disabled={pending || !provider}>
        Save Copilot preference
      </Button>
    </form>
  )
}

"use client"

import * as React from "react"
import { useState, useTransition } from "react"
import {
  Check,
  CheckCircle2,
  ExternalLink,
  Globe,
  Inbox,
  Layers,
  Lock,
  RefreshCw,
  Search,
  Server,
  Shield,
  Smile,
  Sparkles,
  Zap,
} from "lucide-react"
import { toast } from "sonner"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import {
  saveWebmailSettingsAction,
  testWebmailEndpointsAction,
} from "@/lib/actions/webmail"
import { buildWebmailUrl } from "@/lib/webmail-client"
import {
  WebmailClientType,
  WebmailSettings,
  DEFAULT_WEBMAIL_SETTINGS,
} from "@/lib/webmail/types"
import { cn } from "@/lib/utils"

interface WebmailSettingsClientProps {
  initialSettings?: WebmailSettings | null
  roundcubeUrl: string
  ravUrl: string
}

export function WebmailSettingsClient({
  initialSettings,
  roundcubeUrl,
  ravUrl,
}: WebmailSettingsClientProps) {
  const [settings, setSettings] = useState<WebmailSettings>(
    initialSettings || DEFAULT_WEBMAIL_SETTINGS
  )
  const [isPending, startTransition] = useTransition()
  const [isTesting, setIsTesting] = useState(false)
  const [endpointStatus, setEndpointStatus] = useState<{
    rav?: { ok: boolean; host: string; error?: string }
    roundcube?: { ok: boolean; host: string; error?: string }
  } | null>(null)

  function handleClientSelect(client: WebmailClientType) {
    setSettings((prev) => ({ ...prev, client }))
  }

  function handleRavToggle(key: keyof WebmailSettings["ravFeatures"], checked: boolean) {
    setSettings((prev) => ({
      ...prev,
      ravFeatures: {
        ...prev.ravFeatures,
        [key]: checked,
      },
    }))
  }

  function handleRoundcubeToggle(
    key: keyof WebmailSettings["roundcubeFeatures"],
    checked: boolean
  ) {
    setSettings((prev) => ({
      ...prev,
      roundcubeFeatures: {
        ...prev.roundcubeFeatures,
        [key]: checked,
      },
    }))
  }

  async function handleSave() {
    startTransition(async () => {
      const res = await saveWebmailSettingsAction(settings)
      if (res.ok) {
        setSettings(res.data)
        toast.success(
          `Webmail preferences saved! Default client is now ${
            res.data.client === "rav" ? "Rav (React + Rust)" : "Roundcube"
          }.`
        )
      } else {
        toast.error(res.error || "Failed to save webmail preferences.")
      }
    })
  }

  async function handleTestEndpoints() {
    setIsTesting(true)
    try {
      const res = await testWebmailEndpointsAction()
      if (res.ok) {
        setEndpointStatus(res.data)
        const ravOk = res.data.rav.ok
        const rcOk = res.data.roundcube.ok
        if (ravOk && rcOk) {
          toast.success("Both Rav and Roundcube webmail endpoints are healthy!")
        } else if (ravOk) {
          toast.info("Rav webmail is online. Roundcube did not respond.")
        } else if (rcOk) {
          toast.info("Roundcube webmail is online. Rav did not respond.")
        } else {
          toast.warning("Endpoints probed (in-cluster checks pending).")
        }
      }
    } catch {
      toast.error("Failed to test webmail endpoints.")
    } finally {
      setIsTesting(false)
    }
  }

  const isRav = settings.client === "rav"

  return (
    <div className="space-y-6">
      {/* Engine Selection Header */}
      <div>
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-medium text-foreground">Webmail Client Engine</h2>
          <Badge variant="outline" className="text-[10px] uppercase font-mono tracking-wider">
            Dual Container Topology
          </Badge>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          Choose your default webmail client. Both containers run simultaneously on your Dokploy cluster.
          Opening webmail launches your preferred client with zero-password Single Sign-On (SSO).
        </p>
      </div>

      {/* Engine Selection Cards */}
      <div className="grid gap-4 sm:grid-cols-2">
        {/* Rav Card */}
        <div
          onClick={() => handleClientSelect("rav")}
          className={cn(
            "relative cursor-pointer rounded-xl border p-5 transition-all",
            "hover:border-primary/60 hover:shadow-md",
            isRav
              ? "border-primary bg-primary/5 shadow-sm ring-1 ring-primary/40"
              : "border-border/80 bg-card/40 opacity-85 hover:opacity-100"
          )}
        >
          {isRav && (
            <div className="absolute top-4 right-4 flex size-5 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-sm">
              <Check className="size-3 stroke-[3]" />
            </div>
          )}
          <div className="flex items-center gap-2.5">
            <div className="flex size-9 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">
              <Zap className="size-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-semibold text-sm text-foreground">Rav</span>
                <Badge className="bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30 text-[10px] px-1.5 py-0 h-4">
                  Recommended
                </Badge>
              </div>
              <span className="text-[11px] text-muted-foreground font-mono">
                React 19 &bull; Next.js 16 &bull; Rust Axum
              </span>
            </div>
          </div>

          <p className="mt-3.5 text-xs text-muted-foreground leading-relaxed">
            Blazing-fast, modern webmail replacement for Roundcube. Powered by a memory-safe Axum/Tokio backend,
            instant Tantivy full-text search, live WebSocket sync, and client-side PGP encryption.
          </p>

          <div className="mt-4 flex flex-wrap gap-1.5">
            <span className="inline-flex items-center rounded-md bg-background/80 px-2 py-0.5 text-[10px] font-medium text-foreground/80 border border-border/60">
              Tantivy Search
            </span>
            <span className="inline-flex items-center rounded-md bg-background/80 px-2 py-0.5 text-[10px] font-medium text-foreground/80 border border-border/60">
              WebSocket Push
            </span>
            <span className="inline-flex items-center rounded-md bg-background/80 px-2 py-0.5 text-[10px] font-medium text-foreground/80 border border-border/60">
              PGP Encryption
            </span>
            <span className="inline-flex items-center rounded-md bg-background/80 px-2 py-0.5 text-[10px] font-medium text-foreground/80 border border-border/60">
              Link Proxy
            </span>
          </div>
        </div>

        {/* Roundcube Card */}
        <div
          onClick={() => handleClientSelect("roundcube")}
          className={cn(
            "relative cursor-pointer rounded-xl border p-5 transition-all",
            "hover:border-primary/60 hover:shadow-md",
            !isRav
              ? "border-primary bg-primary/5 shadow-sm ring-1 ring-primary/40"
              : "border-border/80 bg-card/40 opacity-85 hover:opacity-100"
          )}
        >
          {!isRav && (
            <div className="absolute top-4 right-4 flex size-5 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-sm">
              <Check className="size-3 stroke-[3]" />
            </div>
          )}
          <div className="flex items-center gap-2.5">
            <div className="flex size-9 items-center justify-center rounded-lg bg-blue-500/10 text-blue-500 border border-blue-500/20">
              <Inbox className="size-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-semibold text-sm text-foreground">Roundcube</span>
                <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4">
                  Classic
                </Badge>
              </div>
              <span className="text-[11px] text-muted-foreground font-mono">
                PHP 8.2 &bull; Apache &bull; Elastic Skin
              </span>
            </div>
          </div>

          <p className="mt-3.5 text-xs text-muted-foreground leading-relaxed">
            Battle-tested, standard webmail client with native ManageSieve vacation autoresponder sync,
            archive and zipdownload export plugins, and familiar Elastic skin interface.
          </p>

          <div className="mt-4 flex flex-wrap gap-1.5">
            <span className="inline-flex items-center rounded-md bg-background/80 px-2 py-0.5 text-[10px] font-medium text-foreground/80 border border-border/60">
              ManageSieve (4190)
            </span>
            <span className="inline-flex items-center rounded-md bg-background/80 px-2 py-0.5 text-[10px] font-medium text-foreground/80 border border-border/60">
              Vacation Script
            </span>
            <span className="inline-flex items-center rounded-md bg-background/80 px-2 py-0.5 text-[10px] font-medium text-foreground/80 border border-border/60">
              Zip Download
            </span>
            <span className="inline-flex items-center rounded-md bg-background/80 px-2 py-0.5 text-[10px] font-medium text-foreground/80 border border-border/60">
              3-Pane View
            </span>
          </div>
        </div>
      </div>

      {/* Feature Toggles Section */}
      <div className="rounded-xl border border-border/80 bg-card/40 p-5 sm:p-6 space-y-5">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-medium text-foreground">
              {isRav ? "Rav Engine Feature Configuration" : "Roundcube Engine Feature Configuration"}
            </h3>
            <p className="mt-1 text-xs text-muted-foreground">
              {isRav
                ? "Configure modern capabilities for Rav webmail."
                : "Configure classic integration plugins and behavior for Roundcube."}
            </p>
          </div>
          <Badge variant="secondary" className="font-mono text-[10px]">
            {isRav ? "Rust Features" : "PHP Plugins"}
          </Badge>
        </div>

        <div className="divide-y divide-border/40">
          {isRav ? (
            <>
              {/* Tantivy Search */}
              <div className="py-3.5 flex items-center justify-between gap-4">
                <div className="space-y-0.5">
                  <div className="flex items-center gap-2">
                    <Search className="size-4 text-primary" />
                    <label className="text-xs font-medium text-foreground cursor-pointer">
                      Tantivy Local Full-Text Search
                    </label>
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    Builds an instant Tantivy search index on per-user SQLite cache for sub-millisecond search across subject, sender, and message bodies.
                  </p>
                </div>
                <Switch
                  checked={settings.ravFeatures.tantivySearch}
                  onCheckedChange={(c) => handleRavToggle("tantivySearch", c)}
                />
              </div>

              {/* WebSocket Live Push */}
              <div className="py-3.5 flex items-center justify-between gap-4">
                <div className="space-y-0.5">
                  <div className="flex items-center gap-2">
                    <Zap className="size-4 text-emerald-500" />
                    <label className="text-xs font-medium text-foreground cursor-pointer">
                      WebSocket Live Push Sync
                    </label>
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    Connects directly to IMAP IDLE and pushes incoming email notifications instantly over WebSockets without polling.
                  </p>
                </div>
                <Switch
                  checked={settings.ravFeatures.websocketLive}
                  onCheckedChange={(c) => handleRavToggle("websocketLive", c)}
                />
              </div>

              {/* Client-side PGP Suite */}
              <div className="py-3.5 flex items-center justify-between gap-4">
                <div className="space-y-0.5">
                  <div className="flex items-center gap-2">
                    <Lock className="size-4 text-amber-500" />
                    <label className="text-xs font-medium text-foreground cursor-pointer">
                      Client-Side OpenPGP Encryption Suite
                    </label>
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    Enables in-browser PGP keypair generation, public key import, digital signing, and transparent message decryption.
                  </p>
                </div>
                <Switch
                  checked={settings.ravFeatures.pgpSuite}
                  onCheckedChange={(c) => handleRavToggle("pgpSuite", c)}
                />
              </div>

              {/* HMAC Privacy Link Proxy */}
              <div className="py-3.5 flex items-center justify-between gap-4">
                <div className="space-y-0.5">
                  <div className="flex items-center gap-2">
                    <Shield className="size-4 text-blue-500" />
                    <label className="text-xs font-medium text-foreground cursor-pointer">
                      HMAC Safe Link Proxy &amp; Privacy Shield
                    </label>
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    Proxies outbound URLs through a cryptographic HMAC-signed link redirector to prevent tracking pixels and IP leaks.
                  </p>
                </div>
                <Switch
                  checked={settings.ravFeatures.linkProxy}
                  onCheckedChange={(c) => handleRavToggle("linkProxy", c)}
                />
              </div>

              {/* Tiptap Rich Text Editor */}
              <div className="py-3.5 flex items-center justify-between gap-4">
                <div className="space-y-0.5">
                  <div className="flex items-center gap-2">
                    <Sparkles className="size-4 text-purple-500" />
                    <label className="text-xs font-medium text-foreground cursor-pointer">
                      Tiptap Markdown &amp; Rich-Text Composer
                    </label>
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    Modern WYSIWYG composer supporting markdown shortcuts, syntax-highlighted code blocks, and formatted tables.
                  </p>
                </div>
                <Switch
                  checked={settings.ravFeatures.richTextEditor}
                  onCheckedChange={(c) => handleRavToggle("richTextEditor", c)}
                />
              </div>

              {/* Reaction Stickers */}
              <div className="py-3.5 flex items-center justify-between gap-4">
                <div className="space-y-0.5">
                  <div className="flex items-center gap-2">
                    <Smile className="size-4 text-yellow-500" />
                    <label className="text-xs font-medium text-foreground cursor-pointer">
                      Mood Reaction Stickers
                    </label>
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    Allows adding mood and animated reaction stickers directly to email drafts and replies.
                  </p>
                </div>
                <Switch
                  checked={settings.ravFeatures.stickers}
                  onCheckedChange={(c) => handleRavToggle("stickers", c)}
                />
              </div>
            </>
          ) : (
            <>
              {/* ManageSieve Sync */}
              <div className="py-3.5 flex items-center justify-between gap-4">
                <div className="space-y-0.5">
                  <div className="flex items-center gap-2">
                    <Layers className="size-4 text-primary" />
                    <label className="text-xs font-medium text-foreground cursor-pointer">
                      ManageSieve Filter Rule Sync (Port 4190)
                    </label>
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    Synchronizes incoming filter rules directly with Stalwart Mail Server via ManageSieve protocol.
                  </p>
                </div>
                <Switch
                  checked={settings.roundcubeFeatures.manageSieveSync}
                  onCheckedChange={(c) => handleRoundcubeToggle("manageSieveSync", c)}
                />
              </div>

              {/* Vacation Autoresponder */}
              <div className="py-3.5 flex items-center justify-between gap-4">
                <div className="space-y-0.5">
                  <div className="flex items-center gap-2">
                    <Globe className="size-4 text-emerald-500" />
                    <label className="text-xs font-medium text-foreground cursor-pointer">
                      Out-of-Office Vacation Autoresponder
                    </label>
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    Enables Roundcube Settings &rarr; Filters vacation autoreply script generator for out-of-office notices.
                  </p>
                </div>
                <Switch
                  checked={settings.roundcubeFeatures.vacationResponder}
                  onCheckedChange={(c) => handleRoundcubeToggle("vacationResponder", c)}
                />
              </div>

              {/* Zip Download */}
              <div className="py-3.5 flex items-center justify-between gap-4">
                <div className="space-y-0.5">
                  <div className="flex items-center gap-2">
                    <Server className="size-4 text-blue-500" />
                    <label className="text-xs font-medium text-foreground cursor-pointer">
                      Archive &amp; Zipdownload Export
                    </label>
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    Allows downloading multi-message threads and folder contents as a compressed ZIP file.
                  </p>
                </div>
                <Switch
                  checked={settings.roundcubeFeatures.zipDownload}
                  onCheckedChange={(c) => handleRoundcubeToggle("zipDownload", c)}
                />
              </div>

              {/* Elastic Skin Adaptation */}
              <div className="py-3.5 flex items-center justify-between gap-4">
                <div className="space-y-0.5">
                  <div className="flex items-center gap-2">
                    <Sparkles className="size-4 text-purple-500" />
                    <label className="text-xs font-medium text-foreground cursor-pointer">
                      Elastic Adaptive Layout
                    </label>
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    Dynamically switches between desktop, tablet, and mobile interface modes.
                  </p>
                </div>
                <Switch
                  checked={settings.roundcubeFeatures.elasticSkin}
                  onCheckedChange={(c) => handleRoundcubeToggle("elasticSkin", c)}
                />
              </div>

              {/* 3-Pane Split Preview */}
              <div className="py-3.5 flex items-center justify-between gap-4">
                <div className="space-y-0.5">
                  <div className="flex items-center gap-2">
                    <Layers className="size-4 text-amber-500" />
                    <label className="text-xs font-medium text-foreground cursor-pointer">
                      3-Pane Split Preview
                    </label>
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    Shows folder list, message headers list, and reading preview simultaneously.
                  </p>
                </div>
                <Switch
                  checked={settings.roundcubeFeatures.previewPane}
                  onCheckedChange={(c) => handleRoundcubeToggle("previewPane", c)}
                />
              </div>
            </>
          )}

          {/* Shared Option: Open in New Tab */}
          <div className="py-3.5 flex items-center justify-between gap-4">
            <div className="space-y-0.5">
              <div className="flex items-center gap-2">
                <ExternalLink className="size-4 text-foreground/80" />
                <label className="text-xs font-medium text-foreground cursor-pointer">
                  Open Webmail in New Browser Tab
                </label>
              </div>
              <p className="text-[11px] text-muted-foreground">
                When clicking &quot;Open Webmail&quot; on any mailbox row, launch the session in a new browser tab.
              </p>
            </div>
            <Switch
              checked={settings.openInNewTab}
              onCheckedChange={(c) => setSettings((prev) => ({ ...prev, openInNewTab: c }))}
            />
          </div>
        </div>
      </div>

      {/* Endpoints & Status Card */}
      <div className="rounded-xl border border-border/80 bg-card/40 p-5 sm:p-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-medium text-foreground">Container Service Endpoints</h3>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Status and direct endpoints for both active compose containers.
            </p>
          </div>
          <Button
            size="sm"
            variant="outline"
            className="text-xs gap-1.5 h-8 self-start sm:self-auto"
            onClick={handleTestEndpoints}
            disabled={isTesting}
          >
            <RefreshCw className={cn("size-3.5", isTesting && "animate-spin")} />
            Test Endpoints
          </Button>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          {/* Rav Endpoint */}
          <div className="rounded-lg border border-border/70 bg-background/60 p-4 space-y-2.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Zap className="size-4 text-emerald-500" />
                <span className="text-xs font-semibold text-foreground">Rav Webmail</span>
              </div>
              <Badge
                variant="outline"
                className={cn(
                  "font-mono text-[10px]",
                  endpointStatus?.rav?.ok
                    ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-500"
                    : "border-border text-muted-foreground"
                )}
              >
                {endpointStatus?.rav ? (endpointStatus.rav.ok ? "Healthy" : "Offline") : "Port 3001"}
              </Badge>
            </div>
            <div className="font-mono text-xs text-foreground/80 truncate">{ravUrl}</div>
            <p className="text-[11px] text-muted-foreground">
              Internal: <code className="font-mono">email-manager-rav:3001</code> &bull; Public: <code className="font-mono">/rav/</code>
            </p>
            <Button
              size="sm"
              variant="outline"
              className="w-full text-xs gap-1.5 h-8 mt-1"
              nativeButton={false}
              render={<a href={buildWebmailUrl(undefined, "rav")} target="_blank" rel="noreferrer" />}
            >
              <ExternalLink className="size-3" />
              Launch Rav (SSO)
            </Button>
          </div>

          {/* Roundcube Endpoint */}
          <div className="rounded-lg border border-border/70 bg-background/60 p-4 space-y-2.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Inbox className="size-4 text-blue-500" />
                <span className="text-xs font-semibold text-foreground">Roundcube Webmail</span>
              </div>
              <Badge
                variant="outline"
                className={cn(
                  "font-mono text-[10px]",
                  endpointStatus?.roundcube?.ok
                    ? "border-blue-500/40 bg-blue-500/10 text-blue-500"
                    : "border-border text-muted-foreground"
                )}
              >
                {endpointStatus?.roundcube ? (endpointStatus.roundcube.ok ? "Healthy" : "Offline") : "Port 80"}
              </Badge>
            </div>
            <div className="font-mono text-xs text-foreground/80 truncate">{roundcubeUrl}</div>
            <p className="text-[11px] text-muted-foreground">
              Internal: <code className="font-mono">roundcube:80</code> &bull; Public: <code className="font-mono">/webmail/</code>
            </p>
            <Button
              size="sm"
              variant="outline"
              className="w-full text-xs gap-1.5 h-8 mt-1"
              nativeButton={false}
              render={<a href={buildWebmailUrl(undefined, "roundcube")} target="_blank" rel="noreferrer" />}
            >
              <ExternalLink className="size-3" />
              Launch Roundcube (SSO)
            </Button>
          </div>
        </div>
      </div>

      {/* Save Button Bar */}
      <div className="flex items-center justify-end gap-3 pt-2">
        <Button
          onClick={handleSave}
          disabled={isPending}
          className="gap-2 px-5"
        >
          {isPending ? (
            <>
              <RefreshCw className="size-4 animate-spin" />
              Saving...
            </>
          ) : (
            <>
              <CheckCircle2 className="size-4" />
              Save Webmail Preferences
            </>
          )}
        </Button>
      </div>
    </div>
  )
}

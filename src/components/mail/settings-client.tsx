"use client"

import { ExternalLink, ShieldAlert, UserCheck } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs"
import { AccountPasswordCard } from "@/components/mail/account-password-card"
import { CloudflareSettingsClient } from "@/components/mail/cloudflare-settings-client"
import { CopilotSettingsClient } from "@/components/mail/copilot-settings-client"
import { DeliverabilityClient } from "@/components/mail/deliverability-client"
import { SystemOutboundSettingsClient } from "@/components/mail/system-outbound-settings-client"
import { UserManagementClient } from "@/components/mail/user-management-client"
import { WebmailSettingsClient } from "@/components/mail/webmail-settings-client"
import { logoutAction } from "@/lib/actions/auth"
import type { CloudflareStatus } from "@/lib/cloudflare/types"
import type { CopilotPublicStatus } from "@/lib/copilot/types"
import type { SafeUser } from "@/lib/db/users"
import type { DeliverabilitySuiteReport } from "@/lib/deliverability/types"
import type { SystemEmailSenderConfig, EmailTemplateId } from "@/lib/db/system-settings"
import type { WebmailSettings } from "@/lib/webmail/types"

export type SettingsClientProps = {
  settings: {
    roundcubeUrl: string
    roundcubeHost: string
    jmapConfigured: boolean
    jmapHost: string | null
    adminUiUrl: string
    stalwartUser: string | null
  }
  copilotStatus: CopilotPublicStatus | null
  copilotError: string | null
  cloudflareStatus: CloudflareStatus | null
  cloudflareError: string | null
  deliverabilityReport: DeliverabilitySuiteReport | null
  availableDomains: string[]
  availableMailboxes?: string[]
  outboundEmailConfig?: SystemEmailSenderConfig | null
  emailTemplate?: EmailTemplateId
  users: SafeUser[]
  webmailSettings?: WebmailSettings | null
  roundcubeUrl: string
  ravUrl: string
  session: {
    userId?: string
    username?: string
    role?: string
    email?: string
    isPrimary?: boolean
  }
  initialTab?: string
}

export function SettingsClient({
  settings,
  copilotStatus,
  copilotError,
  cloudflareStatus,
  cloudflareError,
  deliverabilityReport,
  availableDomains,
  availableMailboxes,
  outboundEmailConfig,
  emailTemplate,
  users,
  webmailSettings,
  roundcubeUrl,
  ravUrl,
  session,
  initialTab,
}: SettingsClientProps) {
  const isAdmin = session.role === "admin"
  const isPrimary = Boolean(session.isPrimary || session.username === "yehia")
  const allowedTabs = isAdmin
    ? ["cloudflare", "copilot", "users", "system", "webmail", "deliverability", "account"]
    : ["cloudflare", "webmail", "deliverability", "account"]

  const defaultTab =
    initialTab && allowedTabs.includes(initialTab)
      ? initialTab
      : allowedTabs[0]

  return (
    <div className="w-full">
      <Tabs defaultValue={defaultTab} className="w-full">
        <TabsList variant="line" className="mb-6 w-full justify-start gap-8">
          <TabsTrigger value="cloudflare" className="gap-2">
            <span>DNS Automation</span>
            {cloudflareStatus?.accounts && cloudflareStatus.accounts.length > 0 ? (
              <Badge variant="secondary" className="font-mono text-[10px] px-1.5 py-0 h-4">
                {cloudflareStatus.accounts.length} linked
              </Badge>
            ) : null}
          </TabsTrigger>

          {isAdmin && (
            <TabsTrigger value="copilot" className="gap-2">
              <span>AI Copilot</span>
              {copilotStatus?.activeProvider ? (
                <Badge variant="secondary" className="font-mono text-[10px] px-1.5 py-0 h-4">
                  {copilotStatus.activeProvider}
                </Badge>
              ) : null}
            </TabsTrigger>
          )}

          {isAdmin && (
            <TabsTrigger value="users" className="gap-2">
              <span>Users &amp; Access</span>
              <Badge variant="secondary" className="font-mono text-[10px] px-1.5 py-0 h-4">
                {users.length}
              </Badge>
            </TabsTrigger>
          )}

          {isAdmin && (
            <TabsTrigger value="system" className="gap-2">
              <span>System &amp; Endpoints</span>
            </TabsTrigger>
          )}

          <TabsTrigger value="webmail" className="gap-2">
            <span>Webmail</span>
            <Badge variant="secondary" className="font-mono text-[10px] px-1.5 py-0 h-4 uppercase">
              {webmailSettings?.client || "Rav"}
            </Badge>
          </TabsTrigger>

          <TabsTrigger value="deliverability" className="gap-2">
            <span>Deliverability</span>
            {deliverabilityReport ? (
              <Badge variant="secondary" className="font-mono text-[10px] px-1.5 py-0 h-4">
                {deliverabilityReport.overallScore}/10
              </Badge>
            ) : (
              <Badge variant="secondary" className="font-mono text-[10px] px-1.5 py-0 h-4">
                Suite
              </Badge>
            )}
          </TabsTrigger>

          <TabsTrigger value="account" className="gap-2">
            <span>Account</span>
          </TabsTrigger>
        </TabsList>

        {/* Cloudflare DNS Automation Tab */}
        <TabsContent value="cloudflare" className="w-full space-y-6">
          <div className="rounded-xl border border-border/80 bg-card/40 p-5 sm:p-6 space-y-5">
            <div>
              <h2 className="text-sm font-medium">Cloudflare DNS Automation</h2>
              <p className="mt-1 text-xs text-muted-foreground">
                Connect Cloudflare API tokens to pool all your domains, inspect DNS, and automatically synchronize MX, SPF, DKIM, and DMARC records across your zones.
              </p>
            </div>
            {cloudflareStatus ? (
              <CloudflareSettingsClient initial={cloudflareStatus} />
            ) : (
              <p className="text-sm text-destructive">{cloudflareError || "Could not load Cloudflare configuration."}</p>
            )}
          </div>
        </TabsContent>

        {/* mailwart Copilot Tab */}
        {isAdmin && (
          <TabsContent value="copilot" className="w-full space-y-6">
            <div className="rounded-xl border border-border/80 bg-card/40 p-5 sm:p-6 space-y-5">
              <div>
                <h2 className="text-sm font-medium">mailwart Copilot</h2>
                <p className="mt-1 text-xs text-muted-foreground">
                  Choose an AI provider and model for mailbox triage and natural-language assistance. API keys remain strictly server-side.
                </p>
              </div>
              {copilotStatus ? (
                <CopilotSettingsClient initial={copilotStatus} />
              ) : (
                <p className="text-sm text-destructive">{copilotError || "Could not load Copilot settings."}</p>
              )}
            </div>
          </TabsContent>
        )}

        {/* User Management Tab */}
        {isAdmin && (
          <TabsContent value="users" className="w-full space-y-6">
            <div className="rounded-xl border border-border/80 bg-card/40 p-5 sm:p-6">
              <UserManagementClient
                initialUsers={users}
                currentUserId={session.userId}
                currentUsername={session.username}
                currentUserRole={session.role}
              />
            </div>
          </TabsContent>
        )}

        {/* System & Endpoints Tab */}
        {isAdmin && (
          <TabsContent value="system" className="w-full space-y-6">
            {/* Service Connections */}
            <div className="rounded-xl border border-border/80 bg-card/40 p-5 sm:p-6 space-y-5">
              <div>
                <h2 className="text-sm font-medium">Service Endpoints</h2>
                <p className="mt-1 text-xs text-muted-foreground">
                  Direct endpoints for integrated Roundcube webmail, JMAP protocol access, and Stalwart Directory Administration.
                </p>
              </div>

              <div className="grid gap-4 sm:grid-cols-3">
                <div className="rounded-lg border border-border/70 bg-background/60 p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-muted-foreground">Webmail Interface</span>
                    <Badge variant="outline" className="font-mono text-[10px]">Roundcube</Badge>
                  </div>
                  <div className="font-mono text-xs text-foreground truncate">
                    {settings.roundcubeHost}
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    className="w-full text-xs gap-1.5"
                    nativeButton={false}
                    render={
                      <a href={settings.roundcubeUrl} target="_blank" rel="noreferrer" />
                    }
                  >
                    <ExternalLink className="size-3.5" />
                    Open Webmail
                  </Button>
                </div>

                <div className="rounded-lg border border-border/70 bg-background/60 p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-muted-foreground">JMAP Protocol Host</span>
                    <Badge variant="outline" className="font-mono text-[10px]">
                      {settings.jmapConfigured ? "TLS Active" : "Unset"}
                    </Badge>
                  </div>
                  <div className="font-mono text-xs text-foreground truncate">
                    {settings.jmapHost ?? "not configured"}
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    High-performance modern mail syncing protocol for JMAP-enabled clients.
                  </p>
                </div>

                <div className="rounded-lg border border-border/70 bg-background/60 p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-muted-foreground">Stalwart Admin Console</span>
                    <Badge variant="outline" className="font-mono text-[10px]">Stalwart</Badge>
                  </div>
                  <div className="font-mono text-xs text-foreground truncate">
                    User: {settings.stalwartUser ?? "admin"}
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    className="w-full text-xs gap-1.5"
                    nativeButton={false}
                    render={
                      <a href={settings.adminUiUrl} target="_blank" rel="noreferrer" />
                    }
                  >
                    <ExternalLink className="size-3.5" />
                    Stalwart Admin
                  </Button>
                </div>
              </div>
            </div>

            {/* System Outbound Mailer */}
            <SystemOutboundSettingsClient
              initialConfig={outboundEmailConfig ?? null}
              initialTemplate={emailTemplate ?? "macos_dark"}
              availableDomains={availableDomains}
              availableMailboxes={availableMailboxes ?? []}
              isPrimaryAdmin={isPrimary}
            />

            {/* Active Session Card */}
            <div className="rounded-xl border border-border/80 bg-card/40 p-5 sm:p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <div className="flex items-center gap-2">
                  <UserCheck className="size-4 text-muted-foreground" />
                  <h2 className="text-sm font-medium">Session</h2>
                  <Badge variant="outline" className="text-[10px]">
                    admin
                  </Badge>
                </div>
                <p className="mt-1 text-xs text-muted-foreground font-mono">
                  Signed in as {session.username || "admin"}
                </p>
              </div>
              <form action={logoutAction}>
                <Button type="submit" size="sm" variant="outline" className="text-xs">
                  Sign out
                </Button>
              </form>
            </div>

            {/* Danger Zone */}
            <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-5 sm:p-6 space-y-3">
              <div className="flex items-center gap-2 text-destructive">
                <ShieldAlert className="size-4" />
                <h2 className="text-sm font-medium">Danger Zone</h2>
              </div>
              <p className="text-xs text-muted-foreground">
                Direct password policy (<code className="font-mono text-[11px]">x:Authentication</code>) edits stay collapsed. Use Stalwart Admin UI or container environment configurations to adjust server-level authentication flags.
              </p>
              <Button size="sm" variant="outline" className="text-xs" disabled>
                Edit password policy (locked)
              </Button>
            </div>
          </TabsContent>
        )}

        {/* Webmail Preferences Tab */}
        <TabsContent value="webmail" className="w-full space-y-6">
          <WebmailSettingsClient
            initialSettings={webmailSettings}
            roundcubeUrl={roundcubeUrl}
            ravUrl={ravUrl}
          />
        </TabsContent>

        {/* Deliverability Suite Tab */}
        <TabsContent value="deliverability" className="w-full space-y-6">
          <DeliverabilityClient
            initialReport={deliverabilityReport}
            availableDomains={availableDomains}
          />
        </TabsContent>

        {/* Account Tab for all users (Primary Admin, Secondary Admins, Regular Users) */}
        <TabsContent value="account" className="w-full space-y-6">
          <div className="rounded-xl border border-border/80 bg-card/40 p-5 sm:p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <UserCheck className="size-4 text-muted-foreground" />
                <h2 className="text-sm font-medium">Profile</h2>
                <Badge
                  variant={isAdmin ? "outline" : "secondary"}
                  className="text-[10px]"
                >
                  {session.role || "user"}
                </Badge>
                {isPrimary && (
                  <Badge
                    variant="outline"
                    className="border-primary/40 bg-primary/10 text-primary text-[10px] font-semibold"
                  >
                    Primary Administrator
                  </Badge>
                )}
              </div>
              <p className="mt-1 text-xs text-muted-foreground font-mono">
                {session.username || "user"} &bull; {session.email || "No email assigned"}
              </p>
            </div>
            <form action={logoutAction}>
              <Button type="submit" size="sm" variant="outline" className="text-xs">
                Sign out
              </Button>
            </form>
          </div>

          {/* In-Account Password Change */}
          <AccountPasswordCard
            isPrimaryAdmin={isPrimary}
            userEmail={session.email || ""}
          />

        </TabsContent>

      </Tabs>
    </div>
  )
}

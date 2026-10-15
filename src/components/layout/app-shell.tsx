"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  ExternalLink,
  Filter,
  Import,
  Inbox,
  LayoutDashboard,
  Route,
  ScrollText,
  Settings,
  Globe,
} from "lucide-react"

import { LogoutButton } from "@/components/auth/logout-button"
import { BrandGlyph } from "@/components/layout/brand-mark"
import { ThemeToggle } from "@/components/layout/theme-toggle"
import { GithubIcon } from "@/components/icons/github-icon"
import { Button } from "@/components/ui/button"
import { CopilotProvider } from "@/components/copilot/copilot-context"
import {
  CopilotDesktopRail,
  CopilotMobileSheet,
  CopilotToggleButton,
} from "@/components/copilot/copilot-panel"

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar"
import { HealthPill } from "@/components/layout/health-pill"
import { HeaderBreadcrumbs } from "@/components/layout/header-breadcrumbs"
import {
  getJmapHealthState,
  getWebmailHealthState,
  getHealthColorClasses,
} from "@/lib/stalwart/health-status"
import { cn } from "@/lib/utils"
import type { HealthStatus } from "@/lib/stalwart/types"

import { ExitImpersonationButton } from "@/components/layout/exit-impersonation-button"

const NAV: Array<{
  href: string
  label: string
  icon: typeof LayoutDashboard
  exact?: boolean
}> = [
  { href: "/dashboard", label: "Overview", icon: LayoutDashboard, exact: true },
  { href: "/dashboard/domains", label: "Domains", icon: Globe },
  { href: "/dashboard/mailboxes", label: "Mailboxes", icon: Inbox },
  { href: "/dashboard/routing", label: "Routing", icon: Route },
  { href: "/dashboard/filters", label: "Filters", icon: Filter },
  { href: "/dashboard/import", label: "Bulk CSV", icon: Import },
  { href: "/dashboard/logs", label: "Logs", icon: ScrollText },
  { href: "/dashboard/settings", label: "Settings", icon: Settings },
]

export function AppShell({
  children,
  health,
  adminUiUrl,
  userRole = "admin",
  impersonatingFrom,
}: {
  children: React.ReactNode
  health: HealthStatus
  adminUiUrl: string
  userRole?: string
  impersonatingFrom?: {
    userId: string
    username: string
    role: "admin"
  }
}) {
  const pathname = usePathname()

  const jmapState = getJmapHealthState(health)
  const jmapColors = getHealthColorClasses(jmapState)
  const webmailState = getWebmailHealthState(health)
  const webmailColors = getHealthColorClasses(webmailState)

  return (
    <CopilotProvider>
      <SidebarProvider className="h-dvh max-h-dvh min-h-0 w-full overflow-hidden">
        <Sidebar collapsible="icon" variant="inset" className="border-none outline-none ring-0 shadow-none bg-sidebar text-sidebar-foreground">
          <SidebarHeader className="p-2 group-data-[collapsible=icon]:p-0 group-data-[collapsible=icon]:h-12 group-data-[collapsible=icon]:w-full group-data-[collapsible=icon]:flex group-data-[collapsible=icon]:items-center group-data-[collapsible=icon]:justify-center">
            <Link
              href="/dashboard"
              className="flex h-9 items-center gap-2.5 rounded-lg px-2 group-data-[collapsible=icon]:size-8 group-data-[collapsible=icon]:p-0 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:mx-auto outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring"
            >
              <BrandGlyph className="size-7 border-sidebar-border bg-sidebar-accent" />
              <div className="min-w-0 group-data-[collapsible=icon]:hidden">
                <div className="truncate font-brand text-base font-[200] lowercase leading-tight tracking-[-0.015em] text-sidebar-foreground">
                  mailwart
                </div>
              </div>
            </Link>
          </SidebarHeader>
          <SidebarContent>
            <SidebarGroup>
              <SidebarGroupLabel>Directory</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {NAV.map((item) => {
                    const active = item.exact
                      ? pathname === item.href
                      : pathname === item.href ||
                        pathname.startsWith(`${item.href}/`)
                    return (
                      <SidebarMenuItem key={item.href}>
                        <SidebarMenuButton
                          isActive={active}
                          tooltip={item.label}
                          render={<Link href={item.href} />}
                        >
                          <item.icon />
                          <span>{item.label}</span>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    )
                  })}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          </SidebarContent>
          <SidebarFooter className="gap-1.5 px-2 pb-3">
            {/* Health indicators above Stalwart Admin: always on different rows */}
            <div className="px-2 py-1 group-data-[collapsible=icon]:px-0 group-data-[collapsible=icon]:py-1.5 group-data-[collapsible=icon]:w-full">
              <div className="flex flex-col gap-1.5 text-xs text-muted-foreground group-data-[collapsible=icon]:items-center group-data-[collapsible=icon]:gap-2 group-data-[collapsible=icon]:w-full">
                {/* Row 1: JMAP */}
                <div
                  className="flex items-center gap-2 cursor-default group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:size-6 group-data-[collapsible=icon]:mx-auto"
                  title={`JMAP: ${jmapState === "ok" ? "Online" : jmapState === "sample" ? "Sample data" : "Offline"}${health.jmap.latencyMs ? ` (${health.jmap.latencyMs}ms)` : ""}`}
                >
                  <span
                    className={cn(
                      "size-2 shrink-0 rounded-full transition-colors",
                      jmapColors.dot
                    )}
                  />
                  <span className="font-mono text-[11px] text-muted-foreground group-data-[collapsible=icon]:hidden">
                    JMAP {jmapState === "ok" ? "online" : jmapState === "sample" ? "sample" : "offline"}
                  </span>
                </div>
                {/* Row 2: Webmail */}
                <div
                  className="flex items-center gap-2 cursor-default group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:size-6 group-data-[collapsible=icon]:mx-auto"
                  title={`Webmail: ${webmailState === "ok" ? "Online" : webmailState === "sample" ? "Sample mode" : webmailState === "down" ? "Offline" : "Unchecked"}`}
                >
                  <span
                    className={cn(
                      "size-2 shrink-0 rounded-full transition-colors",
                      webmailColors.dot
                    )}
                  />
                  <span className="font-mono text-[11px] text-muted-foreground group-data-[collapsible=icon]:hidden">
                    Webmail {webmailState === "ok" ? "online" : webmailState === "sample" ? "sample" : webmailState === "down" ? "offline" : "unchecked"}
                  </span>
                </div>
              </div>
            </div>

            <SidebarMenu>
              {userRole === "admin" && (
                <SidebarMenuItem>
                  <SidebarMenuButton
                    tooltip="Stalwart Admin"
                    render={
                      <a href={adminUiUrl} target="_blank" rel="noreferrer" />
                    }
                  >
                    <ExternalLink />
                    <span>Stalwart Admin</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              )}
              <SidebarMenuItem>
                <LogoutButton />
              </SidebarMenuItem>
            </SidebarMenu>

            <div className="px-2 pt-1 pb-0.5 text-center group-data-[collapsible=icon]:px-0">
              <span className="text-[11px] text-muted-foreground group-data-[collapsible=icon]:hidden">
                Made by{" "}
                <a
                  href="https://github.com/zzokm"
                  target="_blank"
                  rel="noreferrer"
                  className="font-medium text-foreground underline underline-offset-2 hover:text-brand transition-colors"
                >
                  zzokm
                </a>
              </span>
              <a
                href="https://github.com/zzokm"
                target="_blank"
                rel="noreferrer"
                title="Made by zzokm"
                aria-label="Made by zzokm"
                className="hidden group-data-[collapsible=icon]:inline-flex size-7 mx-auto items-center justify-center rounded-md text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-colors"
              >
                <GithubIcon className="size-3.5" />
              </a>
            </div>
          </SidebarFooter>
        </Sidebar>

        <SidebarInset className="h-dvh max-h-dvh md:h-[calc(100dvh-1.75rem)] md:max-h-[calc(100dvh-1.75rem)] min-h-0 min-w-0 overflow-hidden md:peer-data-[variant=inset]:my-3.5 md:peer-data-[variant=inset]:mr-3.5 md:peer-data-[variant=inset]:ml-0 md:peer-data-[variant=inset]:rounded-xl md:peer-data-[variant=inset]:border md:peer-data-[variant=inset]:border-border/80 dark:md:peer-data-[variant=inset]:border-border/60 shadow-none md:peer-data-[variant=inset]:shadow-none bg-background">
          <div className="flex h-full min-h-0 min-w-0 flex-1">
            <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
              <header className="z-20 flex h-12 shrink-0 items-center justify-between border-b border-border/70 bg-background/90 px-4 backdrop-blur-sm">
                <div className="flex min-w-0 items-center gap-3">
                  <SidebarTrigger className="-ml-1" />
                  <div className="hidden h-4 w-px bg-border/60 sm:block" aria-hidden />
                  <HeaderBreadcrumbs className="hidden sm:flex" />
                </div>
                <div className="flex min-w-0 flex-1 items-center justify-end gap-2">
                  {impersonatingFrom && (
                    <ExitImpersonationButton adminUsername={impersonatingFrom.username} />
                  )}
                  <HealthPill health={health} />
                  <CopilotToggleButton />
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    nativeButton={false}
                    render={
                      <a
                        href="https://github.com/zzokm/mailwart"
                        target="_blank"
                        rel="noreferrer"
                        title="GitHub repository"
                      />
                    }
                    aria-label="GitHub repository"
                  >
                    <GithubIcon className="size-4" />
                  </Button>
                  <ThemeToggle />
                </div>
              </header>
              <div className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain px-4 py-6 sm:px-6 lg:px-8">
                {children}
              </div>
            </div>

            <CopilotDesktopRail />
          </div>
        </SidebarInset>

        <CopilotMobileSheet />
      </SidebarProvider>
    </CopilotProvider>
  )
}

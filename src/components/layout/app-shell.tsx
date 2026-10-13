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
import { cn } from "@/lib/utils"
import type { HealthStatus } from "@/lib/stalwart/types"

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
}: {
  children: React.ReactNode
  health: HealthStatus
  adminUiUrl: string
}) {
  const pathname = usePathname()

  return (
    <CopilotProvider>
      <SidebarProvider className="h-dvh max-h-dvh min-h-0 w-full overflow-hidden">
        <Sidebar collapsible="icon" variant="inset" className="border-none outline-none ring-0 shadow-none bg-sidebar text-sidebar-foreground">
          <SidebarHeader className="p-2 group-data-[collapsible=icon]:p-2">
            <Link
              href="/dashboard"
              className="flex h-9 items-center gap-2.5 rounded-lg px-2 group-data-[collapsible=icon]:size-8 group-data-[collapsible=icon]:p-0 group-data-[collapsible=icon]:justify-center outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring"
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
            {/* Health indicators above Stalwart Admin */}
            <div className="px-1.5 py-1 group-data-[collapsible=icon]:px-0">
              <div className="flex items-center gap-2.5 rounded-md px-1 py-0.5 text-xs text-muted-foreground group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0">
                <div
                  className="flex items-center gap-1.5 cursor-default"
                  title={`JMAP: ${health.jmap.ok ? "Online" : "Offline"}${health.jmap.latencyMs ? ` (${health.jmap.latencyMs}ms)` : ""}`}
                >
                  <span
                    className={cn(
                      "size-2 shrink-0 rounded-full transition-colors",
                      health.jmap.ok ? "bg-emerald-500" : "bg-destructive"
                    )}
                  />
                  <span className="font-mono text-[10px] text-muted-foreground group-data-[collapsible=icon]:hidden">
                    JMAP
                  </span>
                </div>
                <div
                  className="flex items-center gap-1.5 cursor-default"
                  title={`Webmail: ${health.roundcube.ok ? "Online" : "Offline"}`}
                >
                  <span
                    className={cn(
                      "size-2 shrink-0 rounded-full transition-colors",
                      health.roundcube.ok ? "bg-emerald-500" : "bg-destructive"
                    )}
                  />
                  <span className="font-mono text-[10px] text-muted-foreground group-data-[collapsible=icon]:hidden">
                    Webmail
                  </span>
                </div>
              </div>
            </div>

            <SidebarMenu>
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
              <SidebarMenuItem>
                <LogoutButton />
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarFooter>
        </Sidebar>

        <SidebarInset className="h-dvh max-h-dvh md:h-[calc(100dvh-1rem)] md:max-h-[calc(100dvh-1rem)] min-h-0 min-w-0 overflow-hidden md:peer-data-[variant=inset]:m-2 md:peer-data-[variant=inset]:ml-0 md:peer-data-[variant=inset]:rounded-2xl md:peer-data-[variant=inset]:border md:peer-data-[variant=inset]:border-border/80 dark:md:peer-data-[variant=inset]:border-border/50 md:peer-data-[variant=inset]:shadow-xl bg-background">
          <div className="flex h-full min-h-0 min-w-0 flex-1">
            <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
              <header className="z-20 flex h-12 shrink-0 items-center justify-between border-b border-border/70 bg-background/90 px-4 backdrop-blur-sm">
                <SidebarTrigger className="-ml-1" />
                <div className="flex min-w-0 flex-1 items-center justify-end gap-2">
                  <HealthPill health={health} />
                  <CopilotToggleButton />
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

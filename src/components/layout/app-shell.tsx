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
  Settings,
  Globe,
} from "lucide-react"

import { LogoutButton } from "@/components/auth/logout-button"
import { BrandGlyph } from "@/components/layout/brand-mark"
import { ThemeToggle } from "@/components/layout/theme-toggle"

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
  SidebarRail,
  SidebarSeparator,
  SidebarTrigger,
} from "@/components/ui/sidebar"
import { Separator } from "@/components/ui/separator"
import { HealthPill } from "@/components/layout/health-pill"
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
    <SidebarProvider>
      <Sidebar collapsible="icon" variant="inset">
        <SidebarHeader className="gap-3 px-3 py-3">
          <Link
            href="/dashboard"
            className="flex items-center gap-2.5 rounded-lg px-1 py-0.5 outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring"
          >
            <BrandGlyph className="border-sidebar-border bg-sidebar-accent" />
            <div className="min-w-0 group-data-[collapsible=icon]:hidden">
              <div className="truncate font-brand text-base font-[200] lowercase leading-tight tracking-[-0.015em] text-sidebar-foreground">
                mailwart
              </div>
              <div className="truncate text-[11px] text-muted-foreground">
                directory ops
              </div>
            </div>
          </Link>
        </SidebarHeader>
        <SidebarSeparator />
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
        <SidebarFooter className="gap-2 px-2 pb-3">
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
        <SidebarRail />
      </Sidebar>

      <SidebarInset className="min-w-0">
        <header className="sticky top-0 z-20 flex h-12 shrink-0 items-center gap-3 border-b border-border/70 bg-background/90 px-4 backdrop-blur-sm">
          <SidebarTrigger className="-ml-1" />
          <Separator orientation="vertical" className="h-4" />
          <div className="flex min-w-0 flex-1 items-center justify-end gap-2">
            <HealthPill health={health} />
            <ThemeToggle />
          </div>
        </header>
        <div className="flex flex-1 flex-col px-4 py-6 sm:px-6 lg:px-8">
          {children}
        </div>
      </SidebarInset>
    </SidebarProvider>
  )
}

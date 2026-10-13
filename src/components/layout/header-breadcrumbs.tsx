"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { ChevronRight } from "lucide-react"

import { cn } from "@/lib/utils"

export type BreadcrumbItem = {
  label: string
  href?: string
  mono?: boolean
}

const ROUTE_LABELS: Record<string, string> = {
  domains: "Domains",
  mailboxes: "Mailboxes",
  routing: "Routing",
  filters: "Filters",
  import: "Bulk CSV",
  logs: "Logs",
  settings: "Settings",
  deliverability: "Deliverability",
}

export function HeaderBreadcrumbs({ className }: { className?: string }) {
  const pathname = usePathname()

  if (!pathname || pathname === "/login") return null

  const segments = pathname.split("/").filter(Boolean)
  if (segments[0] !== "dashboard") return null

  const items: BreadcrumbItem[] = []

  if (segments.length === 1) {
    items.push({ label: "Dashboard" })
  } else {
    items.push({ label: "Dashboard", href: "/dashboard" })

    let currentPath = "/dashboard"
    for (let i = 1; i < segments.length; i++) {
      const seg = segments[i]
      currentPath += `/${seg}`
      const isLast = i === segments.length - 1

      const knownLabel = ROUTE_LABELS[seg]
      if (knownLabel) {
        items.push({
          label: knownLabel,
          href: isLast ? undefined : currentPath,
        })
      } else {
        const decoded = decodeURIComponent(seg)
        items.push({
          label: decoded,
          href: isLast ? undefined : currentPath,
          mono: true,
        })
      }
    }
  }

  return (
    <nav aria-label="Breadcrumbs" className={cn("min-w-0 overflow-hidden", className)}>
      <ol className="flex items-center gap-1.5 text-xs text-muted-foreground whitespace-nowrap overflow-hidden">
        {items.map((item, i) => {
          const isLast = i === items.length - 1
          return (
            <li key={`${item.label}-${i}`} className="flex items-center gap-1.5 min-w-0">
              {i > 0 ? (
                <ChevronRight
                  className="size-3 shrink-0 text-muted-foreground/50"
                  strokeWidth={1.5}
                  aria-hidden
                />
              ) : null}
              {item.href && !isLast ? (
                <Link
                  href={item.href}
                  className={cn(
                    "truncate rounded transition-colors hover:text-foreground",
                    item.mono && "font-mono"
                  )}
                >
                  {item.label}
                </Link>
              ) : (
                <span
                  aria-current={isLast ? "page" : undefined}
                  className={cn(
                    "truncate",
                    isLast ? "text-foreground font-medium" : "",
                    item.mono && "font-mono"
                  )}
                >
                  {item.label}
                </span>
              )}
            </li>
          )
        })}
      </ol>
    </nav>
  )
}

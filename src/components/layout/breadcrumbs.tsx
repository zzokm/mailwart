import Link from "next/link"
import { ChevronRight } from "lucide-react"

import { cn } from "@/lib/utils"

export type Crumb = {
  label: string
  href?: string
  /** Addresses and domain names read as data, not prose. */
  mono?: boolean
}

export const DASHBOARD_CRUMB: Crumb = {
  label: "Dashboard",
  href: "/dashboard",
}

export function Breadcrumbs({
  items,
  className,
}: {
  items: Crumb[]
  className?: string
}) {
  if (items.length === 0) return null

  return (
    <nav aria-label="Breadcrumb" className={cn("min-w-0", className)}>
      <ol className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs text-muted-foreground">
        {items.map((item, i) => {
          const last = i === items.length - 1
          return (
            <li key={`${item.label}-${i}`} className="flex min-w-0 items-center gap-1.5">
              {i > 0 ? (
                <ChevronRight
                  className="size-3 shrink-0 text-muted-foreground/60"
                  strokeWidth={1.5}
                  aria-hidden
                />
              ) : null}
              {item.href && !last ? (
                <Link
                  href={item.href}
                  className={cn(
                    "truncate rounded-sm underline-offset-4 transition-colors hover:text-foreground hover:underline",
                    item.mono && "font-mono"
                  )}
                >
                  {item.label}
                </Link>
              ) : (
                <span
                  aria-current={last ? "page" : undefined}
                  className={cn(
                    "truncate",
                    last && "text-foreground",
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

"use client"

import { useState } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { Search, BookOpen, Layers, Terminal, Sparkles, ShieldCheck } from "lucide-react"
import type { DocMetadata } from "@/lib/docs-config"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"

const CATEGORY_ICONS: Record<string, typeof BookOpen> = {
  "Getting Started": BookOpen,
  "Frontend & Interface": Layers,
  "Backend & Protocols": Terminal,
  "Features & Tools": Sparkles,
  "Operations & DevOps": ShieldCheck,
}

export function DocsSidebar({
  categories,
  onNavigate,
}: {
  categories: Array<{ name: string; items: DocMetadata[] }>
  onNavigate?: () => void
}) {
  const pathname = usePathname()
  const [filter, setFilter] = useState("")

  const normalizedFilter = filter.toLowerCase().trim()

  const filteredCategories = categories
    .map((cat) => ({
      name: cat.name,
      items: cat.items.filter(
        (item) =>
          item.title.toLowerCase().includes(normalizedFilter) ||
          item.description.toLowerCase().includes(normalizedFilter) ||
          item.slug.toLowerCase().includes(normalizedFilter)
      ),
    }))
    .filter((cat) => cat.items.length > 0)

  return (
    <aside className="flex h-full flex-col">
      <div className="p-4 pb-2">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filter documentation..."
            className="h-8 pl-8 text-xs bg-background/80 border-border/70"
          />
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-2 space-y-6">
        {filteredCategories.map((cat) => {
          const Icon = CATEGORY_ICONS[cat.name] || BookOpen
          return (
            <div key={cat.name} className="space-y-1">
              <div className="flex items-center gap-1.5 px-2 py-1 text-[11px] font-mono uppercase tracking-[0.12em] text-muted-foreground font-semibold">
                <Icon className="size-3 text-muted-foreground/80" />
                <span>{cat.name}</span>
              </div>
              <ul className="space-y-0.5">
                {cat.items.map((item) => {
                  const href = `/docs/${item.slug}`
                  const isActive = pathname === href || (item.slug === "overview" && pathname === "/docs")

                  return (
                    <li key={item.slug}>
                      <Link
                        href={href}
                        onClick={onNavigate}
                        className={cn(
                          "group flex items-center justify-between rounded-lg px-2.5 py-1.5 text-xs transition-colors",
                          isActive
                            ? "bg-muted font-medium text-foreground text-brand"
                            : "text-muted-foreground hover:bg-muted/40 hover:text-foreground"
                        )}
                      >
                        <span className="truncate">{item.title}</span>
                        {isActive && (
                          <span className="size-1.5 rounded-full bg-brand" />
                        )}
                      </Link>
                    </li>
                  )
                })}
              </ul>
            </div>
          )
        })}

        {filteredCategories.length === 0 && (
          <div className="p-4 text-center text-xs text-muted-foreground">
            No documentation matched &ldquo;{filter}&rdquo;
          </div>
        )}
      </nav>
    </aside>
  )
}

"use client"

import { useState } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { Menu, ArrowRight } from "lucide-react"
import { BrandMark } from "@/components/layout/brand-mark"
import { ThemeToggle } from "@/components/layout/theme-toggle"
import { GithubIcon } from "@/components/icons/github-icon"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet"
import { DocsSidebar } from "@/components/docs/docs-sidebar"
import type { DocMetadata } from "@/lib/docs-config"

export function DocsHeader({
  categories,
  currentDoc: currentDocProp,
}: {
  categories: Array<{ name: string; items: DocMetadata[] }>
  currentDoc?: DocMetadata
}) {
  const [mobileOpen, setMobileOpen] = useState(false)
  const pathname = usePathname()
  const currentSlug = pathname.replace(/^\/docs\/?/, "") || "get-started"
  const currentDoc =
    currentDocProp ||
    categories.flatMap((c) => c.items).find((d) => d.slug === currentSlug)

  return (
    <header className="sticky top-0 z-40 w-full border-b border-border/70 bg-background/85 backdrop-blur-md">
      <div className="flex h-14 items-center justify-between px-4 sm:px-6">
        <div className="flex items-center gap-3">
          <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
            <SheetTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className="lg:hidden"
                  aria-label="Open documentation navigation"
                />
              }
            >
              <Menu className="size-4" />
            </SheetTrigger>
            <SheetContent side="left" className="w-[300px] p-0">
              <SheetHeader className="border-b border-border/60 p-4">
                <SheetTitle className="flex items-center gap-2">
                  <BrandMark glyph />
                  <Badge variant="outline" className="font-mono text-[10px]">
                    Docs
                  </Badge>
                </SheetTitle>
              </SheetHeader>
              <DocsSidebar
                categories={categories}
                onNavigate={() => setMobileOpen(false)}
              />
            </SheetContent>
          </Sheet>

          <Link
            href="/"
            className="group flex items-center gap-2 text-foreground outline-none transition-opacity hover:opacity-85"
          >
            <BrandMark glyph />
          </Link>

          <span className="hidden sm:inline-block text-border/80">/</span>

          <Link
            href="/docs"
            className="flex items-center gap-1.5"
          >
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground transition-colors">
              Docs
            </span>
          </Link>

          {currentDoc && (
            <div className="hidden md:flex items-center gap-1.5 text-xs text-muted-foreground">
              <span className="text-border/80">/</span>
              <span className="font-mono text-[11px] text-muted-foreground/80">{currentDoc.category}</span>
              <span className="text-border/80">/</span>
              <span className="font-medium text-foreground truncate max-w-[240px]">{currentDoc.title}</span>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="hidden sm:inline-flex gap-1.5 text-xs h-8"
            nativeButton={false}
            render={<Link href="/dashboard" />}
          >
            <span>Console</span>
            <ArrowRight className="size-3" />
          </Button>

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
      </div>
    </header>
  )
}

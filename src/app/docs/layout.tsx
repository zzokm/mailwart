import type { Metadata } from "next"
import { getDocsCategories } from "@/lib/docs"
import { DocsHeader } from "@/components/docs/docs-header"
import { DocsSidebar } from "@/components/docs/docs-sidebar"

export const metadata: Metadata = {
  title: {
    default: "Documentation",
    template: "%s · mailwart Docs",
  },
  description:
    "Comprehensive technical documentation for mailwart: architecture, REST APIs, Server Actions, Stalwart JMAP integration, Roundcube SSO, and AI Copilot.",
}

export const runtime = "nodejs"

export default function DocsLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const categories = getDocsCategories()

  return (
    <div className="flex h-dvh max-h-dvh min-h-0 w-full flex-col overflow-hidden bg-background text-foreground">
      <DocsHeader categories={categories} />

      <div className="flex flex-1 min-h-0 w-full overflow-hidden">
        {/* Desktop Sidebar: pinned to the very left edge */}
        <aside className="hidden lg:flex w-[280px] shrink-0 flex-col border-r border-border/70 bg-background/50 h-full overflow-hidden">
          <DocsSidebar categories={categories} />
        </aside>

        {/* Main Workspace (Content + Right TOC): fills the rest of the screen */}
        <main className="flex flex-1 min-h-0 min-w-0 overflow-hidden">
          {children}
        </main>
      </div>
    </div>
  )
}

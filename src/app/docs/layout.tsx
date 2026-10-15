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
    <div className="flex min-h-dvh flex-col bg-background text-foreground">
      <DocsHeader categories={categories} />

      <div className="flex flex-1 mx-auto w-full max-w-7xl">
        {/* Desktop Sidebar */}
        <div className="hidden lg:block w-[280px] shrink-0 border-r border-border/70 sticky top-14 h-[calc(100dvh-3.5rem)] overflow-hidden">
          <DocsSidebar categories={categories} />
        </div>

        {/* Main Content Area */}
        <main className="flex-1 min-w-0 px-4 py-8 sm:px-8 lg:px-10">
          {children}
        </main>
      </div>
    </div>
  )
}

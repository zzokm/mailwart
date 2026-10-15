import type { Metadata } from "next"
import { notFound } from "next/navigation"
import Link from "next/link"
import { ArrowLeft, Clock } from "lucide-react"
import { getDocBySlug, DOCS_REGISTRY } from "@/lib/docs"
import { MarkdownRenderer } from "@/components/docs/markdown-renderer"
import { DocsToc } from "@/components/docs/docs-toc"
import { DocsNav } from "@/components/docs/docs-nav"
import { Badge } from "@/components/ui/badge"

export const runtime = "nodejs"

export async function generateStaticParams() {
  return DOCS_REGISTRY.map((doc) => ({ slug: doc.slug }))
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>
}): Promise<Metadata> {
  const { slug } = await params
  const doc = await getDocBySlug(slug)

  if (!doc) {
    return { title: "Document Not Found" }
  }

  return {
    title: doc.title,
    description: doc.description,
  }
}

export default async function DocPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const doc = await getDocBySlug(slug)

  if (!doc) {
    notFound()
  }

  return (
    <div className="flex flex-1 min-h-0 min-w-0 w-full overflow-hidden">
      {/* Center scrollable documentation container */}
      <div
        id="docs-scroll-container"
        className="flex-1 min-h-0 min-w-0 overflow-y-auto overscroll-contain px-6 py-8 sm:px-10 lg:px-14 xl:px-16 scroll-smooth"
      >
        <article className="mx-auto w-full max-w-5xl pb-20">
          {/* Breadcrumb & Metadata Header */}
          <div className="mb-8 space-y-3">
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <Link
                href="/docs"
                className="inline-flex items-center gap-1 hover:text-foreground transition-colors"
              >
                <ArrowLeft className="size-3" />
                <span>Docs</span>
              </Link>
              <span>/</span>
              <Badge variant="outline" className="font-mono text-[10px]">
                {doc.category}
              </Badge>
              <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                <Clock className="size-3" />
                {doc.readTime}
              </span>
            </div>

            <h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl lg:text-5xl">
              {doc.title}
            </h1>

            <p className="text-base text-muted-foreground leading-relaxed sm:text-lg">
              {doc.description}
            </p>

            <hr className="border-border/60 pt-2" />
          </div>

          {/* Markdown Content */}
          <MarkdownRenderer content={doc.content} />

          {/* Next / Previous Document Nav */}
          <DocsNav prev={doc.prev} next={doc.next} />
        </article>
      </div>

      {/* Right Column: Table of Contents pinned to the very right edge */}
      {doc.toc.length > 0 && (
        <aside className="hidden xl:flex w-[260px] shrink-0 flex-col border-l border-border/70 bg-background/30 h-full overflow-hidden p-6">
          <div className="h-full overflow-y-auto">
            <DocsToc toc={doc.toc} />
          </div>
        </aside>
      )}
    </div>
  )
}

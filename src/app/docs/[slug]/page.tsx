import type { Metadata } from "next"
import { notFound } from "next/navigation"
import Link from "next/link"
import { ArrowLeft, Clock, FileText } from "lucide-react"
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
    <div className="flex flex-col xl:flex-row gap-10">
      {/* Center Article Content */}
      <article className="flex-1 min-w-0 max-w-4xl">
        {/* Breadcrumb & Metadata Header */}
        <div className="mb-6 space-y-3">
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
            <span className="hidden sm:inline-flex items-center gap-1 text-[11px] font-mono text-muted-foreground/70">
              <FileText className="size-3" />
              docs/{doc.filename}
            </span>
          </div>

          <h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
            {doc.title}
          </h1>

          <p className="text-base text-muted-foreground leading-relaxed">
            {doc.description}
          </p>

          <hr className="border-border/60 pt-2" />
        </div>

        {/* Markdown Content */}
        <MarkdownRenderer content={doc.content} />

        {/* Next / Previous Document Nav */}
        <DocsNav prev={doc.prev} next={doc.next} />
      </article>

      {/* Right Column: Table of Contents */}
      {doc.toc.length > 0 && (
        <div className="hidden xl:block w-[240px] shrink-0">
          <div className="sticky top-20 max-h-[calc(100dvh-6rem)] overflow-y-auto">
            <DocsToc toc={doc.toc} />
          </div>
        </div>
      )}
    </div>
  )
}

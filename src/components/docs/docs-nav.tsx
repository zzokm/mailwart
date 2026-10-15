import Link from "next/link"
import { ChevronLeft, ChevronRight } from "lucide-react"

export function DocsNav({
  prev,
  next,
}: {
  prev?: { slug: string; title: string }
  next?: { slug: string; title: string }
}) {
  if (!prev && !next) return null

  return (
    <div className="mt-12 flex flex-col sm:flex-row items-stretch justify-between gap-4 border-t border-border/60 pt-6">
      {prev ? (
        <Link
          href={`/docs/${prev.slug}`}
          className="group flex flex-1 flex-col items-start rounded-xl border border-border/70 p-4 transition-all hover:border-brand/40 hover:bg-muted/30"
        >
          <span className="flex items-center gap-1 font-mono text-[11px] text-muted-foreground group-hover:text-foreground">
            <ChevronLeft className="size-3" />
            Previous
          </span>
          <span className="mt-1 text-sm font-semibold text-foreground group-hover:text-brand">
            {prev.title}
          </span>
        </Link>
      ) : (
        <div className="flex-1" />
      )}

      {next ? (
        <Link
          href={`/docs/${next.slug}`}
          className="group flex flex-1 flex-col items-end rounded-xl border border-border/70 p-4 text-right transition-all hover:border-brand/40 hover:bg-muted/30"
        >
          <span className="flex items-center gap-1 font-mono text-[11px] text-muted-foreground group-hover:text-foreground">
            Next
            <ChevronRight className="size-3" />
          </span>
          <span className="mt-1 text-sm font-semibold text-foreground group-hover:text-brand">
            {next.title}
          </span>
        </Link>
      ) : (
        <div className="flex-1" />
      )}
    </div>
  )
}

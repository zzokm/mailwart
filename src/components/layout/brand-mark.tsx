import { cn } from "@/lib/utils"

/** Wordmark: always lowercase "mailwart" in Bricolage Grotesque ExtraLight 200. */
export function BrandMark({
  className,
  glyph = false,
}: {
  className?: string
  glyph?: boolean
}) {
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      {glyph ? <BrandGlyph /> : null}
      <span className="font-brand text-[1.15em] font-[200] lowercase leading-none tracking-[-0.015em]">
        mailwart
      </span>
    </span>
  )
}

/** Compact square mark for collapsed nav and favicons-in-UI slots. */
export function BrandGlyph({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        "flex size-7 shrink-0 items-center justify-center rounded-md border border-border bg-surface font-brand text-[15px] font-[200] leading-none text-brand",
        className
      )}
    >
      m
    </span>
  )
}

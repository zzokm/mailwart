import { Skeleton } from "@/components/ui/skeleton"

export default function OverviewLoading() {
  return (
    <div aria-busy="true" aria-label="Loading overview">
      <div className="mb-6 space-y-3">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-7 w-40" />
        <Skeleton className="h-4 w-72 max-w-full" />
      </div>

      <div className="overflow-hidden rounded-xl border border-border/80">
        <div className="grid grid-cols-2 divide-x divide-y divide-border/50 lg:grid-cols-4 lg:divide-y-0">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="space-y-2 px-4 py-4 sm:px-5">
              <Skeleton className="h-2.5 w-16" />
              <Skeleton className="h-7 w-12" />
            </div>
          ))}
        </div>
      </div>

      <Skeleton className="mt-6 h-28 w-full rounded-xl" />

      <div className="mt-6 grid gap-6 lg:grid-cols-[1.2fr_1fr]">
        <Skeleton className="h-40 w-full rounded-xl" />
        <Skeleton className="h-40 w-full rounded-xl" />
      </div>
    </div>
  )
}

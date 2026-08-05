import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

export function EmptyState({
  title,
  description,
  action,
  className,
}: {
  title: string
  description?: string
  action?: React.ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-start gap-3 rounded-xl border border-dashed border-border/80 px-5 py-10",
        className
      )}
    >
      <div className="space-y-1">
        <h2 className="text-sm font-medium text-foreground">{title}</h2>
        {description ? (
          <p className="max-w-md text-sm text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {action}
    </div>
  )
}

export function ErrorState({
  title,
  description,
  onRetry,
}: {
  title: string
  description?: string
  onRetry?: () => void
}) {
  return (
    <div className="flex flex-col items-start gap-3 rounded-xl border border-destructive/30 bg-destructive/5 px-5 py-8">
      <div className="space-y-1">
        <h2 className="text-sm font-medium text-destructive">{title}</h2>
        {description ? (
          <p className="max-w-lg text-sm text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {onRetry ? (
        <Button type="button" variant="outline" size="sm" onClick={onRetry}>
          Retry
        </Button>
      ) : null}
    </div>
  )
}

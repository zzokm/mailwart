import Link from "next/link"
import { ArrowLeft } from "lucide-react"

import { type Crumb } from "@/components/layout/breadcrumbs"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

export function PageHeader({
  title,
  description,
  actions,
  back,
  className,
}: {
  title: string
  description?: string
  actions?: React.ReactNode
  breadcrumbs?: Crumb[]
  /** Escape hatch on detail routes so a deep link never dead-ends. */
  back?: { href: string; label: string }
  className?: string
}) {
  return (
    <div className={cn("mb-6", className)}>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0 space-y-1">
          {back ? (
            <Button
              variant="ghost"
              size="xs"
              className="-ml-2 mb-1 text-muted-foreground"
              nativeButton={false}
              render={<Link href={back.href} />}
            >
              <ArrowLeft data-icon="inline-start" strokeWidth={1.5} />
              {back.label}
            </Button>
          ) : null}
          <h1 className="text-xl font-medium tracking-tight text-foreground sm:text-2xl">
            {title}
          </h1>
          {description ? (
            <p className="max-w-2xl text-sm text-muted-foreground">
              {description}
            </p>
          ) : null}
        </div>
        {actions ? (
          <div className="flex flex-wrap items-center gap-2">{actions}</div>
        ) : null}
      </div>
    </div>
  )
}

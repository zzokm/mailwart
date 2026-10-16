"use client"

import * as React from "react"
import { useTheme } from "next-themes"
import { Check, Copy } from "lucide-react"

import { cn } from "@/lib/utils"

export function MermaidDiagram({
  chart,
  className,
}: {
  chart: string
  className?: string
}) {
  const { resolvedTheme } = useTheme()
  const rawId = React.useId()
  const chartId = React.useMemo(
    () => `mermaid-${rawId.replace(/[^a-zA-Z0-9_-]/g, "")}`,
    [rawId]
  )

  const [svg, setSvg] = React.useState<string>("")
  const [error, setError] = React.useState<string | null>(null)
  const [copied, setCopied] = React.useState(false)

  const trimmedChart = React.useMemo(() => chart.trim(), [chart])

  React.useEffect(() => {
    let isMounted = true

    async function renderChart() {
      if (!trimmedChart) return
      setError(null)

      try {
        const mermaid = (await import("mermaid")).default
        const isDark = resolvedTheme === "dark"

        mermaid.initialize({
          startOnLoad: false,
          securityLevel: "loose",
          theme: isDark ? "dark" : "base",
          fontFamily: "var(--font-sans), system-ui, sans-serif",
          themeVariables: isDark
            ? {
                darkMode: true,
                background: "#1f1f1f",
                primaryColor: "#292929",
                primaryTextColor: "#f2f2f2",
                primaryBorderColor: "#3b3b3b",
                lineColor: "#808080",
                secondaryColor: "#303030",
                tertiaryColor: "#111111",
                edgeLabelBackground: "#1f1f1f",
                clusterBkg: "#292929",
                clusterBorder: "#3b3b3b",
                nodeBorder: "#3b3b3b",
                mainBkg: "#292929",
              }
            : {
                darkMode: false,
                background: "#faf9f5",
                primaryColor: "#fffcf9",
                primaryTextColor: "#2c2b29",
                primaryBorderColor: "#e2dfd8",
                lineColor: "#726f69",
                secondaryColor: "#f1efea",
                tertiaryColor: "#f5f3ee",
                edgeLabelBackground: "#faf9f5",
                clusterBkg: "#f5f3ee",
                clusterBorder: "#e2dfd8",
                nodeBorder: "#e2dfd8",
                mainBkg: "#fffcf9",
              },
        })

        // Render diagram
        const { svg: renderedSvg } = await mermaid.render(
          `${chartId}-svg`,
          trimmedChart
        )

        if (isMounted) {
          setSvg(renderedSvg)
        }
      } catch (err) {
        if (isMounted) {
          console.error("Mermaid rendering failed:", err)
          setError(err instanceof Error ? err.message : "Failed to render diagram")
        }
      }
    }

    renderChart()

    return () => {
      isMounted = false
    }
  }, [trimmedChart, resolvedTheme, chartId])

  const copySource = () => {
    navigator.clipboard.writeText(trimmedChart)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  if (error) {
    return (
      <div className="my-6 rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-xs font-mono text-destructive">
        <p className="font-semibold mb-2">Diagram rendering error:</p>
        <pre className="overflow-x-auto text-xs">{error}</pre>
        <pre className="mt-2 text-muted-foreground overflow-x-auto">{trimmedChart}</pre>
      </div>
    )
  }

  return (
    <div
      className={cn(
        "group relative my-6 overflow-hidden rounded-xl border border-border/70 bg-card/40 backdrop-blur-sm transition-all hover:border-border",
        className
      )}
    >
      <div className="flex items-center justify-between border-b border-border/40 bg-muted/30 px-3.5 py-1.5 text-xs text-muted-foreground">
        <span className="font-mono text-[11px] uppercase tracking-wider font-medium text-foreground/70">
          Diagram
        </span>
        <button
          type="button"
          onClick={copySource}
          className="inline-flex cursor-pointer items-center gap-1 rounded-md px-2 py-0.5 text-[11px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          aria-label="Copy Mermaid source"
        >
          {copied ? (
            <>
              <Check className="size-3 text-success" />
              <span>Copied</span>
            </>
          ) : (
            <>
              <Copy className="size-3" />
              <span>Copy</span>
            </>
          )}
        </button>
      </div>

      <div className="flex min-h-[140px] items-center justify-center overflow-x-auto p-6 scrollbar-thin">
        {svg ? (
          <div
            className="w-full flex justify-center [&_svg]:max-w-full [&_svg]:h-auto [&_svg]:transition-all"
            dangerouslySetInnerHTML={{ __html: svg }}
          />
        ) : (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <div className="size-4 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-foreground" />
            <span>Rendering diagram...</span>
          </div>
        )}
      </div>
    </div>
  )
}

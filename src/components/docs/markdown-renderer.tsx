"use client"

import * as React from "react"
import Link from "next/link"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import { Hash, Info, AlertTriangle, Lightbulb, ShieldAlert } from "lucide-react"
import { CodeBlock } from "@/components/docs/code-block"
import { cn } from "@/lib/utils"

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
}

export function MarkdownRenderer({ content }: { content: string }) {
  return (
    <div className="prose prose-neutral dark:prose-invert max-w-none text-[14px] leading-relaxed text-foreground">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: ({ children }) => (
            <h1 className="mb-4 mt-2 text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
              {children}
            </h1>
          ),
          h2: ({ children }) => {
            const text = String(children)
            const id = slugify(text)
            return (
              <h2
                id={id}
                className="group relative mb-3 mt-10 scroll-mt-24 border-b border-border/50 pb-2 text-lg font-semibold tracking-tight text-foreground"
              >
                <a
                  href={`#${id}`}
                  className="absolute -left-5 top-1/2 -translate-y-1/2 opacity-0 transition-opacity group-hover:opacity-100 text-muted-foreground hover:text-foreground"
                  aria-label="Link to section"
                >
                  <Hash className="size-3.5" />
                </a>
                {children}
              </h2>
            )
          },
          h3: ({ children }) => {
            const text = String(children)
            const id = slugify(text)
            return (
              <h3
                id={id}
                className="group relative mb-2 mt-6 scroll-mt-24 text-base font-semibold tracking-tight text-foreground"
              >
                <a
                  href={`#${id}`}
                  className="absolute -left-5 top-1/2 -translate-y-1/2 opacity-0 transition-opacity group-hover:opacity-100 text-muted-foreground hover:text-foreground"
                  aria-label="Link to subsection"
                >
                  <Hash className="size-3" />
                </a>
                {children}
              </h3>
            )
          },
          h4: ({ children }) => (
            <h4 className="mb-1.5 mt-4 text-sm font-semibold tracking-tight text-foreground">
              {children}
            </h4>
          ),
          p: ({ children }) => (
            <p className="my-3 text-[14px] leading-relaxed text-foreground/90">
              {children}
            </p>
          ),
          ul: ({ children }) => (
            <ul className="my-3 space-y-1.5 pl-5 list-disc text-foreground/90 marker:text-muted-foreground">
              {children}
            </ul>
          ),
          ol: ({ children }) => (
            <ol className="my-3 space-y-1.5 pl-5 list-decimal text-foreground/90 marker:text-muted-foreground">
              {children}
            </ol>
          ),
          li: ({ children }) => (
            <li className="text-[14px] leading-relaxed">{children}</li>
          ),
          hr: () => <hr className="my-8 border-border/60" />,
          blockquote: ({ children }) => {
            // Check for GitHub alert style: [!NOTE], [!TIP], [!WARNING], [!IMPORTANT]
            const textContent = React.Children.toArray(children)
              .map((c) =>
                React.isValidElement<{ children?: React.ReactNode }>(c) && c.props.children
                  ? String(c.props.children)
                  : ""
              )
              .join(" ")

            let alertType: "note" | "tip" | "warning" | "important" | "default" = "default"
            if (textContent.includes("[!NOTE]")) alertType = "note"
            else if (textContent.includes("[!TIP]")) alertType = "tip"
            else if (textContent.includes("[!WARNING]")) alertType = "warning"
            else if (textContent.includes("[!IMPORTANT]")) alertType = "important"

            if (alertType !== "default") {
              const icons = {
                note: <Info className="size-4 text-brand shrink-0" />,
                tip: <Lightbulb className="size-4 text-success shrink-0" />,
                warning: <AlertTriangle className="size-4 text-warn shrink-0" />,
                important: <ShieldAlert className="size-4 text-destructive shrink-0" />,
              }
              const styles = {
                note: "border-brand/40 bg-brand/5 text-foreground",
                tip: "border-success/40 bg-success/5 text-foreground",
                warning: "border-warn/40 bg-warn/5 text-foreground",
                important: "border-destructive/40 bg-destructive/5 text-foreground",
              }

              return (
                <div
                  className={cn(
                    "my-4 flex items-start gap-3 rounded-xl border p-4 text-sm",
                    styles[alertType]
                  )}
                >
                  {icons[alertType]}
                  <div className="flex-1 [&_p]:my-0">{children}</div>
                </div>
              )
            }

            return (
              <blockquote className="my-4 border-l-2 border-border/80 pl-4 italic text-muted-foreground">
                {children}
              </blockquote>
            )
          },
          table: ({ children }) => (
            <div className="my-6 w-full overflow-hidden rounded-xl border border-border/80 bg-card/30">
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-left text-xs font-mono">
                  {children}
                </table>
              </div>
            </div>
          ),
          thead: ({ children }) => (
            <thead className="border-b border-border bg-muted/50 text-foreground font-semibold">
              {children}
            </thead>
          ),
          th: ({ children }) => (
            <th className="px-3.5 py-2.5 font-semibold text-foreground/90 whitespace-nowrap">
              {children}
            </th>
          ),
          td: ({ children }) => (
            <td className="border-b border-border/40 px-3.5 py-2 text-foreground/80 whitespace-nowrap">
              {children}
            </td>
          ),
          code: ({ className, children, ...props }) => {
            const match = /language-(\w+)/.exec(className || "")
            const isMultiline = String(children).includes("\n")

            if (match || isMultiline) {
              return (
                <CodeBlock
                  language={match ? match[1] : undefined}
                  value={String(children).replace(/\n$/, "")}
                />
              )
            }

            return (
              <code
                className="rounded-md bg-muted px-1.5 py-0.5 font-mono text-[0.88em] text-foreground font-medium"
                {...props}
              >
                {children}
              </code>
            )
          },
          pre: ({ children }) => <>{children}</>,
          a: ({ href, children, ...props }) => {
            if (!href) return <span>{children}</span>

            // If internal docs link or relative link
            if (href.startsWith("/docs") || href.startsWith("./") || href.startsWith("#")) {
              const cleanHref = href.startsWith("./")
                ? href.replace(/^\.\//, "/docs/").replace(/\.md$/, "")
                : href

              return (
                <Link
                  href={cleanHref}
                  className="font-medium text-brand underline underline-offset-4 transition-colors hover:text-brand/80"
                >
                  {children}
                </Link>
              )
            }

            return (
              <a
                {...props}
                href={href}
                target="_blank"
                rel="noreferrer"
                className="font-medium text-brand underline underline-offset-4 transition-colors hover:text-brand/80"
              >
                {children}
              </a>
            )
          },
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  )
}

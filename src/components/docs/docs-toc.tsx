"use client"

import { useEffect, useState } from "react"
import type { TocItem } from "@/lib/docs"
import { cn } from "@/lib/utils"

export function DocsToc({ toc }: { toc: TocItem[] }) {
  const [activeId, setActiveId] = useState<string>("")

  useEffect(() => {
    if (toc.length === 0) return

    const handleScroll = () => {
      const headingElements = toc
        .map((item) => document.getElementById(item.id))
        .filter((el): el is HTMLElement => el !== null)

      const scrollPosition = window.scrollY + 120

      for (let i = headingElements.length - 1; i >= 0; i--) {
        const el = headingElements[i]
        if (el.offsetTop <= scrollPosition) {
          setActiveId(el.id)
          return
        }
      }

      if (headingElements.length > 0) {
        setActiveId(headingElements[0].id)
      }
    }

    window.addEventListener("scroll", handleScroll, { passive: true })
    handleScroll()

    return () => window.removeEventListener("scroll", handleScroll)
  }, [toc])

  if (toc.length === 0) return null

  return (
    <div className="space-y-3">
      <div className="font-mono text-[11px] font-semibold uppercase tracking-[0.14em] text-foreground/70">
        On this page
      </div>
      <nav className="relative border-l border-border/60 pl-3">
        <ul className="space-y-2 text-xs">
          {toc.map((item) => {
            const isActive = activeId === item.id
            return (
              <li
                key={item.id}
                className={cn(
                  "transition-colors",
                  item.level === 3 ? "pl-3 text-muted-foreground" : ""
                )}
              >
                <a
                  href={`#${item.id}`}
                  onClick={(e) => {
                    e.preventDefault()
                    const target = document.getElementById(item.id)
                    if (target) {
                      const offset = 80
                      const top = target.getBoundingClientRect().top + window.scrollY - offset
                      window.scrollTo({ top, behavior: "smooth" })
                      history.replaceState(null, "", `#${item.id}`)
                      setActiveId(item.id)
                    }
                  }}
                  className={cn(
                    "block leading-snug outline-none transition-colors hover:text-foreground",
                    isActive
                      ? "font-medium text-foreground -ml-3.5 pl-3 border-l-2 border-brand"
                      : "text-muted-foreground"
                  )}
                >
                  {item.text}
                </a>
              </li>
            )
          })}
        </ul>
      </nav>
    </div>
  )
}

"use client"

import { motion, useReducedMotion } from "motion/react"

const ROWS = [
  { type: "SOA", name: "yehia.dev.", value: "ns1.yehia.dev." },
  { type: "MX", name: "yehia.dev.", value: "10 mail.yehia.dev." },
  { type: "A", name: "mail.yehia.dev.", value: "—" },
  { type: "MBX", name: "hi@yehia.dev", value: "quota 2G · ok" },
  { type: "MBX", name: "me@yehia.dev", value: "quota 5G · ok" },
  { type: "MBX", name: "catch@yehia.dev", value: "catch-all · ok" },
  { type: "MBX", name: "support@zokm.me", value: "quota 2G · ok" },
  { type: "MBX", name: "coolify@zokm.me", value: "quota 2G · ok" },
] as const

export function ZoneSheet() {
  const reduce = useReducedMotion()

  return (
    <div
      className="relative overflow-hidden rounded-xl border border-border/80 bg-[oklch(0.16_0.012_250)] shadow-[0_24px_80px_-32px_oklch(0_0_0/0.85)]"
      aria-label="Synthetic zone and mailbox sheet"
    >
      <div className="flex items-center justify-between border-b border-border/60 px-4 py-2.5 sm:px-5">
        <div className="flex items-center gap-2 font-mono text-[11px] tracking-wide text-muted-foreground">
          <span className="size-1.5 rounded-full bg-[oklch(0.72_0.12_230)]" />
          zone · email.yehia.dev
        </div>
        <span className="font-mono text-[11px] text-muted-foreground/80">
          synthetic preview
        </span>
      </div>

      <div className="grid grid-cols-[4.5rem_minmax(0,1.2fr)_minmax(0,1fr)] gap-x-3 border-b border-border/40 px-4 py-2 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground sm:px-5">
        <span>type</span>
        <span>name</span>
        <span className="hidden sm:inline">rdata</span>
        <span className="sm:hidden">value</span>
      </div>

      <ul className="divide-y divide-border/40">
        {ROWS.map((row, i) => (
          <motion.li
            key={`${row.type}-${row.name}`}
            initial={reduce ? false : { opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{
              duration: 0.35,
              delay: reduce ? 0 : 0.12 + i * 0.04,
              ease: [0.22, 1, 0.36, 1],
            }}
            className="grid grid-cols-[4.5rem_minmax(0,1.2fr)_minmax(0,1fr)] gap-x-3 px-4 py-2.5 font-mono text-[12px] leading-none sm:px-5 sm:text-[13px]"
          >
            <span
              className={
                row.type === "MBX"
                  ? "text-[oklch(0.78_0.09_230)]"
                  : "text-muted-foreground"
              }
            >
              {row.type}
            </span>
            <span className="truncate text-foreground/95">{row.name}</span>
            <span className="truncate text-muted-foreground">{row.value}</span>
          </motion.li>
        ))}
      </ul>

      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-[oklch(0.16_0.012_250)] to-transparent" />
    </div>
  )
}

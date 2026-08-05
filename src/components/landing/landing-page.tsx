"use client"

import Link from "next/link"
import { motion, useReducedMotion } from "motion/react"
import { ArrowUpRight, Lock, ShieldCheck } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { ZoneSheet } from "@/components/landing/zone-sheet"

const DOMAINS = ["yehia.dev", "hiy.me", "zokm.me", "restoqd.com"] as const

export function LandingPage() {
  const reduce = useReducedMotion()

  return (
    <div className="relative flex min-h-full flex-1 flex-col overflow-hidden">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_80%_50%_at_70%_-10%,oklch(0.35_0.06_230/0.35),transparent),radial-gradient(ellipse_60%_40%_at_10%_100%,oklch(0.28_0.04_250/0.25),transparent)]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.35] [background-image:linear-gradient(to_right,oklch(1_0_0/0.03)_1px,transparent_1px),linear-gradient(to_bottom,oklch(1_0_0/0.03)_1px,transparent_1px)] [background-size:48px_48px] [mask-image:radial-gradient(ellipse_at_center,black_20%,transparent_75%)]"
      />

      <header className="relative z-10 mx-auto flex w-full max-w-6xl items-center justify-between px-5 py-5 sm:px-8">
        <Link
          href="/"
          className="font-mono text-sm tracking-tight text-foreground transition-colors hover:text-[oklch(0.82_0.08_230)]"
        >
          email.yehia.dev
        </Link>
        <Button
          size="sm"
          variant="outline"
          nativeButton={false}
          render={<Link href="/login" />}
        >
          <Lock data-icon="inline-start" />
          Secure Admin Login
        </Button>
      </header>

      <main className="relative z-10 mx-auto flex w-full max-w-6xl flex-1 flex-col px-5 pb-16 pt-6 sm:px-8 sm:pt-10 lg:pt-14">
        <div className="grid items-center gap-12 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)] lg:gap-14">
          <motion.div
            initial={reduce ? false : { opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
            className="max-w-xl"
          >
            <h1 className="text-[clamp(2.25rem,5vw,3.5rem)] font-semibold leading-[1.05] tracking-[-0.035em] text-balance text-foreground">
              Directory ops for Stalwart mail.
            </h1>
            <p className="mt-5 max-w-[38ch] text-base leading-relaxed text-muted-foreground sm:text-lg">
              Manage domains, mailboxes, catch-alls, and passwords against live
              JMAP — with Roundcube as the webmail door, not a fake SSO tunnel.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Button
                size="lg"
                nativeButton={false}
                render={<Link href="/login" />}
              >
                <ShieldCheck data-icon="inline-start" />
                Secure Admin Login
              </Button>
              <Button
                size="lg"
                variant="ghost"
                nativeButton={false}
                render={
                  <a
                    href="https://mail.zokm.me"
                    target="_blank"
                    rel="noreferrer"
                  />
                }
              >
                Open Roundcube
                <ArrowUpRight data-icon="inline-end" />
              </Button>
            </div>
            <p className="mt-6 font-mono text-[11px] tracking-wide text-muted-foreground/90">
              {DOMAINS.join("  ·  ")}
            </p>
          </motion.div>

          <motion.div
            initial={reduce ? false : { opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{
              duration: 0.6,
              delay: reduce ? 0 : 0.08,
              ease: [0.22, 1, 0.36, 1],
            }}
          >
            <ZoneSheet />
          </motion.div>
        </div>

        <Separator className="my-16 opacity-60 sm:my-20" />

        <section className="grid gap-10 sm:grid-cols-2 lg:grid-cols-3 lg:gap-12">
          <div>
            <h2 className="text-lg font-medium tracking-tight">
              Stalwart is source of truth
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              Every list and mutation goes through JMAP. The UI never invents
              mailbox state.
            </p>
          </div>
          <div>
            <h2 className="text-lg font-medium tracking-tight">
              Full addresses, always
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              Multi-domain local-parts are ambiguous. You operate on{" "}
              <span className="font-mono text-[13px] text-foreground/90">
                hi@yehia.dev
              </span>
              , not bare{" "}
              <span className="font-mono text-[13px] text-foreground/90">hi</span>
              .
            </p>
          </div>
          <div className="sm:col-span-2 lg:col-span-1">
            <h2 className="text-lg font-medium tracking-tight">
              Danger stays labeled
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              Password policy, destroy domain, and catch-all retargets require
              typed confirm — no silent deletes.
            </p>
          </div>
        </section>
      </main>

      <footer className="relative z-10 border-t border-border/60">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-3 px-5 py-6 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between sm:px-8">
          <span className="font-mono text-xs">email.yehia.dev · Email Manager</span>
          <div className="flex flex-wrap gap-x-5 gap-y-2">
            <a
              className="transition-colors hover:text-foreground"
              href="https://mail.yehia.dev/admin"
              target="_blank"
              rel="noreferrer"
            >
              Stalwart Admin
            </a>
            <a
              className="transition-colors hover:text-foreground"
              href="https://mail.zokm.me"
              target="_blank"
              rel="noreferrer"
            >
              Roundcube
            </a>
            <Link
              className="transition-colors hover:text-foreground"
              href="/login"
            >
              Admin login
            </Link>
          </div>
        </div>
      </footer>
    </div>
  )
}

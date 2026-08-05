"use client"

import Link from "next/link"
import { motion, useReducedMotion } from "motion/react"
import {
  AtSign,
  FileUp,
  Globe,
  KeyRound,
  Radar,
  ShieldCheck,
  type LucideIcon,
} from "lucide-react"

import { BrandMark } from "@/components/layout/brand-mark"
import { ThemeToggle } from "@/components/layout/theme-toggle"
import { Button } from "@/components/ui/button"
import { ZoneSheet } from "@/components/landing/zone-sheet"

type Capability = {
  icon: LucideIcon
  title: string
  body: string
  span: string
  tint?: boolean
}

const CAPABILITIES: Capability[] = [
  {
    icon: Globe,
    title: "Domains and catch-all routing",
    body: "Add a domain, set its catch-all target, toggle sub-addressing, and disable routing without deleting anything.",
    span: "lg:col-span-3",
    tint: true,
  },
  {
    icon: AtSign,
    title: "Mailboxes and quotas",
    body: "Create accounts on any managed domain, adjust disk quota, and work on full addresses instead of bare local-parts.",
    span: "lg:col-span-3",
  },
  {
    icon: KeyRound,
    title: "Password resets",
    body: "Generate a strong password, copy it once, and never surface the stored hash.",
    span: "lg:col-span-2",
  },
  {
    icon: Radar,
    title: "DNS health",
    body: "MX, SPF, DKIM, and DMARC expectations per domain, written against your configured mail host.",
    span: "lg:col-span-2",
  },
  {
    icon: FileUp,
    title: "Bulk CSV import",
    body: "Upload, validate, commit in chunks, then download the rows that failed with the reason attached.",
    span: "sm:col-span-2 lg:col-span-2",
  },
]

const STEPS = [
  {
    title: "Point it at Stalwart",
    body: "Set the JMAP endpoint and an admin principal in your environment. Credentials stay server-side; the browser never receives them.",
  },
  {
    title: "Run the directory",
    body: "Domains, mailboxes, catch-alls, quotas, and bulk imports all read and write through JMAP, so the console never invents state.",
  },
  {
    title: "Hand off to webmail",
    body: "Open any mailbox in Roundcube through a signed token that expires in seconds. Mailbox passwords are never required.",
  },
] as const

export function LandingPage() {
  const reduce = useReducedMotion()

  return (
    <div className="relative flex min-h-full flex-1 flex-col overflow-hidden">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-[70vh] bg-[radial-gradient(ellipse_75%_60%_at_72%_-15%,var(--brand),transparent_62%)] opacity-[0.09] dark:opacity-[0.2]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-[70vh] [background-image:linear-gradient(to_right,var(--border)_1px,transparent_1px),linear-gradient(to_bottom,var(--border)_1px,transparent_1px)] [background-size:48px_48px] [mask-image:radial-gradient(ellipse_at_50%_0%,black_10%,transparent_70%)]"
      />

      <header className="relative z-10 border-b border-border/50">
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-5 sm:px-8">
          <Link
            href="/"
            className="rounded-md text-base text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <BrandMark glyph />
          </Link>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <Button
              size="sm"
              variant="outline"
              nativeButton={false}
              render={<Link href="/login" />}
            >
              <ShieldCheck data-icon="inline-start" strokeWidth={1.5} />
              Secure Admin Login
            </Button>
          </div>
        </div>
      </header>

      <main className="relative z-10 flex-1">
        <section className="mx-auto w-full max-w-6xl px-5 pb-20 pt-14 sm:px-8 lg:pb-28 lg:pt-20">
          <div className="grid items-center gap-12 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)] lg:gap-16">
            <motion.div
              initial={reduce ? false : { opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
              className="max-w-xl"
            >
              <h1 className="text-[clamp(2.25rem,5vw,3.5rem)] font-semibold leading-[1.05] tracking-[-0.035em] text-balance">
                Directory operations for Stalwart mail.
              </h1>
              <p className="mt-5 max-w-[42ch] text-base leading-relaxed text-muted-foreground sm:text-lg">
                Domains, mailboxes, catch-alls, quotas, and DNS health in one
                console, backed by live JMAP.
              </p>
              <div className="mt-8">
                <Button
                  size="lg"
                  nativeButton={false}
                  render={<Link href="/login" />}
                >
                  <ShieldCheck data-icon="inline-start" strokeWidth={1.5} />
                  Secure Admin Login
                </Button>
              </div>
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
        </section>

        <section className="border-t border-border/50 bg-surface/40">
          <div className="mx-auto w-full max-w-6xl px-5 py-20 sm:px-8 lg:py-24">
            <h2 className="max-w-2xl text-2xl font-semibold tracking-[-0.025em] sm:text-3xl">
              Everything a mail operator opens a control panel for.
            </h2>

            <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-6">
              {CAPABILITIES.map((item, i) => (
                <motion.article
                  key={item.title}
                  initial={reduce ? false : { opacity: 0, y: 18 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, amount: 0.3 }}
                  transition={{
                    duration: 0.5,
                    delay: reduce ? 0 : i * 0.05,
                    ease: [0.22, 1, 0.36, 1],
                  }}
                  className={`relative overflow-hidden rounded-xl border border-border/70 bg-card p-5 sm:p-6 ${item.span} ${
                    item.tint
                      ? "bg-[linear-gradient(140deg,color-mix(in_oklch,var(--brand),transparent_92%),transparent_62%)]"
                      : ""
                  }`}
                >
                  <item.icon
                    className="size-5 text-brand"
                    strokeWidth={1.5}
                    aria-hidden
                  />
                  <h3 className="mt-4 text-base font-medium tracking-tight">
                    {item.title}
                  </h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                    {item.body}
                  </p>
                </motion.article>
              ))}

              <motion.article
                initial={reduce ? false : { opacity: 0, y: 18 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, amount: 0.3 }}
                transition={{
                  duration: 0.5,
                  delay: reduce ? 0 : 0.25,
                  ease: [0.22, 1, 0.36, 1],
                }}
                className="relative overflow-hidden rounded-xl border border-border/70 bg-card p-5 sm:col-span-2 sm:p-6 lg:col-span-6"
              >
                <div
                  aria-hidden
                  className="pointer-events-none absolute inset-0 [background-image:linear-gradient(to_right,var(--border)_1px,transparent_1px)] [background-size:24px_100%] [mask-image:linear-gradient(to_left,black,transparent_65%)]"
                />
                <div className="relative max-w-2xl">
                  <h3 className="text-base font-medium tracking-tight">
                    Stalwart stays the source of truth
                  </h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                    Every list and every mutation goes through JMAP against your
                    own server. There is no shadow database, no cached directory,
                    and no second place for mailbox state to drift.
                  </p>
                </div>
              </motion.article>
            </div>
          </div>
        </section>

        <section className="border-t border-border/50">
          <div className="mx-auto w-full max-w-6xl px-5 py-20 sm:px-8 lg:py-24">
            <h2 className="max-w-2xl text-2xl font-semibold tracking-[-0.025em] sm:text-3xl">
              How it works
            </h2>
            <div className="mt-10 divide-y divide-border/60 border-t border-border/60">
              {STEPS.map((step, i) => (
                <motion.div
                  key={step.title}
                  initial={reduce ? false : { opacity: 0, y: 14 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, amount: 0.4 }}
                  transition={{
                    duration: 0.5,
                    delay: reduce ? 0 : i * 0.07,
                    ease: [0.22, 1, 0.36, 1],
                  }}
                  className="grid gap-3 py-7 md:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)] md:gap-10"
                >
                  <h3 className="text-lg font-medium tracking-tight text-balance">
                    {step.title}
                  </h3>
                  <p className="max-w-[62ch] text-sm leading-relaxed text-muted-foreground sm:text-base">
                    {step.body}
                  </p>
                </motion.div>
              ))}
            </div>
          </div>
        </section>

        <section className="border-t border-border/50 bg-surface/40">
          <div className="mx-auto w-full max-w-3xl px-5 py-20 text-center sm:px-8 lg:py-24">
            <ShieldCheck
              className="mx-auto size-6 text-brand"
              strokeWidth={1.5}
              aria-hidden
            />
            <h2 className="mt-5 text-2xl font-semibold tracking-[-0.025em] text-balance sm:text-3xl">
              The console is private by default.
            </h2>
            <p className="mx-auto mt-4 max-w-[52ch] text-sm leading-relaxed text-muted-foreground sm:text-base">
              There is no public sign-up and no tenant directory. Operator
              credentials are configured at deploy time, and the session is an
              HttpOnly cookie scoped to this instance.
            </p>
            <div className="mt-8">
              <Button
                size="lg"
                nativeButton={false}
                render={<Link href="/login" />}
              >
                <ShieldCheck data-icon="inline-start" strokeWidth={1.5} />
                Secure Admin Login
              </Button>
            </div>
          </div>
        </section>
      </main>

      <footer className="relative z-10 border-t border-border/50">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-2 px-5 py-8 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between sm:px-8">
          <BrandMark className="text-base text-foreground" />
          <span>Directory operations for Stalwart mail.</span>
        </div>
      </footer>
    </div>
  )
}

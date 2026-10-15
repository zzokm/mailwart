import type { Metadata } from "next"
import Link from "next/link"

import { LoginForm } from "@/components/auth/login-form"
import { BrandMark } from "@/components/layout/brand-mark"
import { ThemeToggle } from "@/components/layout/theme-toggle"
import { GithubIcon } from "@/components/icons/github-icon"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"

import { redirectIfAuthenticated } from "@/lib/actions/auth"

export const metadata: Metadata = {
  title: "Sign in",
  description: "Sign in to access your mailwart console.",
}

export default async function LoginPage() {
  await redirectIfAuthenticated()

  return (
    <div className="relative flex h-full max-h-dvh min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-[60vh] bg-[radial-gradient(ellipse_70%_60%_at_50%_-10%,var(--brand),transparent_62%)] opacity-[0.09] dark:opacity-[0.2]"
      />

      <header className="relative z-10">
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-5 sm:px-8">
          <Link
            href="/"
            aria-label="Back to home"
            className="group inline-flex items-center gap-2 rounded-md text-base text-foreground outline-none transition-opacity hover:opacity-85 focus-visible:ring-2 focus-visible:ring-ring"
          >
            <BrandMark glyph />
          </Link>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon-sm"
              nativeButton={false}
              render={
                <a
                  href="https://github.com/zzokm/mailwart"
                  target="_blank"
                  rel="noreferrer"
                  title="GitHub repository"
                />
              }
              aria-label="GitHub repository"
            >
              <GithubIcon className="size-4" />
            </Button>
            <ThemeToggle />
          </div>
        </div>
      </header>

      <main className="relative z-10 flex flex-1 flex-col items-center justify-center px-5 pb-16 pt-4">
        <div className="w-full max-w-md">
          <Card className="border-border/80 bg-card/80 backdrop-blur-sm overflow-hidden">
            <LoginForm />
          </Card>
        </div>
      </main>

      <footer className="relative z-10 border-t border-border/50">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-3 px-5 py-6 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between sm:px-8">
          <span className="text-xs">Directory operations for Stalwart mail.</span>
          <span className="text-xs">
            Made by{" "}
            <a
              href="https://github.com/zzokm"
              target="_blank"
              rel="noreferrer"
              className="font-medium text-foreground underline underline-offset-4 hover:text-brand transition-colors"
            >
              zzokm
            </a>
          </span>
        </div>
      </footer>
    </div>
  )
}

import type { Metadata } from "next"
import Link from "next/link"

import { LoginForm } from "@/components/auth/login-form"
import { BrandMark } from "@/components/layout/brand-mark"
import { ThemeToggle } from "@/components/layout/theme-toggle"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
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
          <ThemeToggle />
        </div>
      </header>

      <main className="relative z-10 flex flex-1 flex-col items-center justify-center px-5 pb-16 pt-4">
        <div className="w-full max-w-md">
          <Card className="border-border/80 bg-card/80 backdrop-blur-sm pt-2">
            <CardHeader className="space-y-1 pb-4 pt-1 sm:pt-2">
              <CardTitle className="text-xl font-semibold tracking-[-0.02em]">
                Sign in
              </CardTitle>
              <CardDescription>
                Enter your account credentials to access your console.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <LoginForm />
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  )
}

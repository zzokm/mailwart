import type { Metadata } from "next"
import Link from "next/link"

import { LoginForm } from "@/components/auth/login-form"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { redirectIfAuthenticated } from "@/lib/actions/auth"

export const metadata: Metadata = {
  title: "Secure Admin Login · email.yehia.dev",
  description: "Sign in to Email Manager",
}

export default async function LoginPage() {
  await redirectIfAuthenticated()

  return (
    <div className="relative flex min-h-full flex-1 flex-col items-center justify-center px-5 py-16">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_70%_50%_at_50%_0%,oklch(0.32_0.05_230/0.28),transparent)]"
      />
      <div className="relative z-10 w-full max-w-md">
        <div className="mb-8 text-center">
          <Link
            href="/"
            className="font-mono text-sm tracking-tight text-muted-foreground transition-colors hover:text-foreground"
          >
            email.yehia.dev
          </Link>
          <h1 className="mt-4 text-2xl font-semibold tracking-[-0.03em]">
            Secure Admin Login
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Operator access to the Stalwart directory console.
          </p>
        </div>
        <Card className="border-border/80 bg-card/80 backdrop-blur-sm">
          <CardHeader className="pb-4">
            <CardTitle className="text-base font-medium">Sign in</CardTitle>
            <CardDescription>
              Use app admin credentials — not your mailbox password.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <LoginForm />
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

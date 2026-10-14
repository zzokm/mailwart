import type { Metadata } from "next"
import { redirect } from "next/navigation"

import { AppShell } from "@/components/layout/app-shell"
import { getHealth } from "@/lib/actions/mail"
import { getSession, isAuthenticated } from "@/lib/auth/session"
import { getStalwartAdminUiUrl } from "@/lib/env"

export const metadata: Metadata = {
  title: {
    default: "Dashboard",
    template: "%s · mailwart",
  },
}

export const runtime = "nodejs"

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  if (!(await isAuthenticated())) {
    redirect("/login")
  }

  const [health, session] = await Promise.all([
    getHealth(),
    getSession(),
  ])

  return (
    <AppShell
      health={health}
      adminUiUrl={session.role === "admin" ? getStalwartAdminUiUrl() : ""}
      userRole={session.role}
      impersonatingFrom={session.impersonatingFrom}
    >
      {children}
    </AppShell>
  )
}

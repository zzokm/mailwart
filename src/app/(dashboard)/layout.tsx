import type { Metadata } from "next"
import { redirect } from "next/navigation"

import { AppShell } from "@/components/layout/app-shell"
import { getHealth } from "@/lib/actions/mail"
import { isAuthenticated } from "@/lib/auth/session"
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

  const health = await getHealth()

  return (
    <AppShell health={health} adminUiUrl={getStalwartAdminUiUrl()}>
      {children}
    </AppShell>
  )
}

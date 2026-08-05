import type { Metadata } from "next"
import { Geist, Geist_Mono } from "next/font/google"
import { Toaster } from "@/components/ui/sonner"
import { TooltipProvider } from "@/components/ui/tooltip"
import "./globals.css"

const geistSans = Geist({
  variable: "--font-sans",
  subsets: ["latin"],
})

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
})

export const metadata: Metadata = {
  title: {
    default: "Email Manager · email.yehia.dev",
    template: "%s · email.yehia.dev",
  },
  description:
    "Stalwart directory ops for domains, mailboxes, catch-alls, and Roundcube deep-links.",
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html
      lang="en"
      className={`dark ${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col bg-background text-foreground">
        {/*
          THESIS: Zone-file precision — the mailbox directory reads like a named zone sheet, not a SaaS feature grid.
          OWN-WORLD: Near-black ink ground, cool zone-blue accent, hairline record rules, mono for addresses only.
          STORY: Operator sees live-shaped directory truth, then enters Secure Admin Login.
          FIRST VIEWPORT: Brand + headline + one CTA left; synthetic zone/mailbox sheet right; no eyebrow, no metric strip.
          FORM: Zone-file precision sheet · ordered candidate 3 · seed eed4bab9 (degraded roll, no challengers).
          FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, and DESIGN.md
        */}
        <TooltipProvider>
          {children}
          <Toaster theme="dark" richColors closeButton position="top-center" />
        </TooltipProvider>
      </body>
    </html>
  )
}

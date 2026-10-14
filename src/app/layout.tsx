import type { Metadata } from "next"
import { Bricolage_Grotesque, Plus_Jakarta_Sans, Geist_Mono } from "next/font/google"
import { Toaster } from "@/components/ui/sonner"
import { ThemeProvider } from "@/components/layout/theme-provider"
import { TooltipProvider } from "@/components/ui/tooltip"
import "./globals.css"

const plusJakartaSans = Plus_Jakarta_Sans({
  variable: "--font-sans",
  subsets: ["latin"],
})

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
})

const bricolage = Bricolage_Grotesque({
  variable: "--font-bricolage",
  subsets: ["latin"],
  weight: ["200"],
  display: "swap",
})

export const metadata: Metadata = {
  title: {
    default: "mailwart",
    template: "%s · mailwart",
  },
  description:
    "Directory operations for Stalwart mail: domains, mailboxes, catch-alls, quotas, DNS health, and webmail hand-off.",
  icons: {
    icon: [
      { url: "/icon.png", type: "image/png" },
      { url: "/favicon.ico" },
    ],
    apple: [{ url: "/apple-icon.png", type: "image/png" }],
  },
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${plusJakartaSans.variable} ${geistMono.variable} ${bricolage.variable} h-dvh max-h-dvh overflow-hidden antialiased`}
    >
      <body className="flex h-dvh max-h-dvh min-h-0 flex-col overflow-hidden bg-background text-foreground">
        {/*
          THESIS: Zone-file precision — the mailbox directory reads like a named zone sheet, not a SaaS feature grid.
          OWN-WORLD: Cool paper by day, near-black ink by night; zone-blue accent, hairline record rules, mono for addresses only.
          STORY: Operator sees live-shaped directory truth, then signs in.
          FORM: Zone-file precision sheet · brand wordmark in Bricolage Grotesque ExtraLight 200.
        */}
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <TooltipProvider>
            {children}
            <Toaster richColors closeButton position="top-center" />
          </TooltipProvider>
        </ThemeProvider>
      </body>
    </html>
  )
}

# Design System — mailwart

> Phase 2 state: brand, theming, landing, and dashboard chrome are shipped. Feature depth (mutations, routing, logs) is Phase 3+.

## Mode

- **`/` (landing):** Persuade — operator entry
- **`/login`:** Operate-adjacent — auth chrome
- **`/dashboard/*`:** Operate — directory ops console

## Brand

- Product name in UI: **mailwart** (always lowercase)
- Wordmark: **Bricolage Grotesque ExtraLight 200**, loaded via `next/font/google` as `--font-bricolage` and exposed as the `font-brand` utility
- `BrandMark` / `BrandGlyph` in `src/components/layout/brand-mark.tsx` are the only places the wordmark is typeset
- Deployment hostnames are configuration, never brand marks. Sample data uses RFC 2606 domains (`example.com`, `example.net`, `example.org`, `internal.test`)

## World

**Zone-file precision.** Hairline record rows, mono for addresses and record data, prose sans for everything else, one cool zone-blue accent on a near-neutral ground. No purple-gradient SaaS clichés, no card farms, no personal-domain branding in chrome.

## Theming

`next-themes` with `attribute="class"`, `defaultTheme="system"`, and `disableTransitionOnChange`. The toggle lives in the landing header, the login header, and the dashboard top bar.

Both themes are first-class. Every color goes through a CSS variable in `src/app/globals.css`; no component hardcodes an `oklch()` literal.

| Token | Job |
|-------|-----|
| `--background` / `--foreground` | Page ground and ink. Never pure white or pure black |
| `--surface` (`bg-surface`) | Raised panels: metric strips, zone sheet, landing section bands |
| `--brand` (`text-brand`) | The single accent. Record types, capability icons, active data |
| `--success` / `--warn` | Health and sample-data states only |
| `--destructive` | Danger zone and failures only |

## Typography

- **Brand wordmark:** Bricolage Grotesque, weight 200, lowercase, `tracking-[-0.015em]`
- **UI:** Geist Sans
- **Data, addresses, record values:** Geist Mono
- **Display:** `tracking-[-0.035em]` at hero scale, `tracking-[-0.025em]` at section scale

## Layout signatures

1. Landing: split hero, then asymmetric capability bento (6 cells), then a rule-separated step stack, then a centered access panel. Four sections, four distinct layout families
2. Dashboard: sidebar, top bar with health and theme toggle, breadcrumbs, dense tables
3. One primary action per page header
4. Secure Admin Login is the single conversion label on the landing page, repeated verbatim in nav, hero, and access panel
5. Corner radius: `rounded-xl` for panels and cards, `rounded-lg` for buttons and inputs

## Navigation

- `Breadcrumbs` (`src/components/layout/breadcrumbs.tsx`) renders through `PageHeader` on every route below `/dashboard`. Entity segments are mono
- Detail routes carry a `back` control so a deep link never dead-ends
- Cross-links are two-way: a domain links to its mailboxes, a mailbox links back to its domain

## Motion

Restrained. Hero and zone-sheet entry, `whileInView` reveals on landing sections, no motion inside the console. Everything is gated on `useReducedMotion()`.

## Copy rules

- Active and specific; no apology fluff and no filler verbs
- Full email addresses, never bare local-parts
- Empty values read as `none`, `not configured`, or `-`
- No em-dashes in user-visible strings

## Out of scope (Phase 3+)

Mutation depth, forwarding and routing UI, Sieve and spam controls, delivery and audit logs, analytics.

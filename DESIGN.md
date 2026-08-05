# Design System — Email Manager

> Recorded from the Phase 2 built world (landing + auth). Seed `eed4bab9`, candidate 3: zone-file precision sheet. Degraded roll (no challengers / quality-bar boards).

## Mode

- **`/` (landing):** Persuade — operator entry and product thesis
- **`/login`:** Operate-adjacent — auth chrome
- **`/dashboard/*`:** Operate — directory ops console (Phase 3)

## World

**Zone-file precision.** The mailbox directory is presented like a DNS zone / named.conf sheet: hairline record rows, mono for addresses and types, cool zone-blue accent on near-black ink. Not a SaaS feature-card grid, not neon cyberpunk. Dashboard inherits the same ink / zone-blue / mono-address language at Operate density.

## Palette (dark preferred; `html.dark` forced)

| Token | Role |
|-------|------|
| Background `oklch(0.135 0.012 250)` | Near-black ink |
| Foreground `oklch(0.93 0.01 230)` | Soft paper ink |
| Primary `oklch(0.78 0.08 230)` | Zone-blue action |
| Muted foreground `oklch(0.68 0.02 230)` | Secondary copy |
| Border ~12% white-blue | Hairline rules |
| Destructive | Standard shadcn red for danger |

## Typography

- **UI / display:** Geist Sans (`--font-sans`)
- **Data / addresses / brand mark:** Geist Mono
- Display scale: clamp ~2.25–3.5rem, tracking ≈ −0.035em
- Mono for zone rows at 12–13px

## Components

shadcn/ui **base-nova** + Tailwind v4 CSS variables. Essentials under `src/components/ui/`. Lucide icons (CLI default). Motion via `motion/react` for hero + row stagger; respects `prefers-reduced-motion`.

## Layout signatures

1. Landing first viewport: brand + headline + one CTA group left; synthetic zone/mailbox sheet right
2. No eyebrow kickers; no hero metric strip
3. Secure Admin Login is the primary action (`/login`)
4. Dashboard: sidebar + zone-sheet tables; overview metric strip as record cells (not SaaS card farm)

## Motion

One orchestrated entrance (copy + sheet), staggered zone rows. Exponential ease-out. Content visible by default when reduced motion is on.

## Brand surface

**email.yehia.dev** — domains yehia.dev, hiy.me, zokm.me, restoqd.com. Outbound: Stalwart Admin, Roundcube.

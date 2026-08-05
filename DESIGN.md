# Design System — mailwart

> Light Phase 1 update: product renamed to **mailwart**. Full visual world refresh is Phase 2+ (do not treat this file as a finished redesign brief).

## Mode

- **`/` (landing):** Persuade — operator entry
- **`/login`:** Operate-adjacent — auth chrome
- **`/dashboard/*`:** Operate — directory ops console

## Brand

- Product name in UI: **mailwart** (lowercase)
- Wordmark: **Bricolage Grotesque ExtraLight 200**
- Deployment hostnames are not brand marks

## World (incumbent — evolve in Phase 2)

**Zone-file precision** remains the working Operate language until Phase 2 redesign: hairline record rows, mono for addresses, cool accent on ink. Avoid purple-gradient SaaS clichés, card farms in the hero, and personal-domain branding in chrome.

## Palette (current code; may shift in Phase 2)

Dark-preferred ops console using existing CSS variables / shadcn tokens. Light theme must be first-class in Phase 2 (`next-themes`).

## Typography

- **Brand wordmark:** Bricolage Grotesque ExtraLight 200
- **UI:** existing sans stack until Phase 2 typeset pass
- **Data / addresses:** mono

## Layout signatures

1. Dashboard: sidebar + breadcrumbs + dense tables (Operate)
2. One primary action per page header
3. Secure Admin Login as landing primary CTA
4. No personal domains as product identity in first viewport

## Motion

Restrained in Operate (`MOTION_INTENSITY: 3`). Respect `prefers-reduced-motion`.

## Out of scope (this file / Phase 1)

Landing redesign, theme toggle implementation, dashboard feature UI — deferred to Phase 2+.

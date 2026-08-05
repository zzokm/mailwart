# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

Next.js 16 App Router + Tailwind CSS v4 + shadcn/ui (Node runtime). Deploy target: Dokploy behind Traefik. Stalwart JMAP + Roundcube SSO.

## Users

**Primary — Operator:** technical operator managing Stalwart mailboxes across one or more domains on a single deployment. Needs cPanel-grade directory ops without Admin density or Python one-offs.

**Secondary — Helper:** same tasks with audit clarity; no separate RBAC in v1.

**Out of scope:** end-users reading mail (they use Roundcube).

## Product Purpose

**mailwart** — production email management dashboard for Stalwart: domains, mailboxes, quotas, routing, DNS health, bulk CSV, delivery/audit visibility, with Roundcube webmail via short-lived SSO. Does not replace Stalwart Admin or Roundcube.

Success: create a mailbox in under 30s including password copy; bulk 50 accounts with clear failure report; catch-all and DNS health without Stalwart Admin.

## Positioning

Server truth is Stalwart JMAP (`urn:stalwart:jmap`). Full email addresses everywhere. Roundcube SSO uses signed, short-lived tokens and Stalwart impersonation; mailbox passwords never enter the browser. **Single-tenant deploy, multi-domain** — not multi-tenant SaaS in v1.

## Brand Commitments

- Product name: **mailwart** (all lowercase in UI)
- Wordmark font: **Bricolage Grotesque ExtraLight 200**
- Completely generalized — deployment hostnames and managed domains are env/Dokploy config, not brand
- Voice: active, specific, no apology fluff

## Constraints

- Stalwart v0.16.x — management via JMAP at `/jmap` (no legacy REST management assumption)
- Stalwart admin credentials server-side only
- App login (`APP_ADMIN_*`) distinct from Stalwart admin (`STALWART_ADMIN_*`)
- Preserve Roundcube `em_sso`, `/api/webmail/sso`, Dockerfile, compose roundcube service
- No mail-tester / deliverability automation in-app
- No reading/sending mail in-app
- Responsive web only

## Terminology

| Term | Meaning |
|------|---------|
| mailwart | This product |
| Domain | Stalwart `x:Domain` |
| Mailbox / Account | Stalwart `x:Account` (User) |
| Catch-all | `Domain.catchAllAddress` |
| Roundcube | Integrated webmail (path from `ROUNDCUBE_URL`) |

## Evidence

- `docs/ARCHITECTURE.md`, `docs/PRODUCT_SPEC.md`, `docs/ARCHITECTURE_REVIEW_LOG.md`
- Live integration: `src/lib/stalwart/*`, `roundcube/plugins/em_sso`

## Open Decisions

- Dashboard public hostname — deploy-time
- Exact live `quotas` / `aliases` / app-password / 2FA shapes — probe Phase 2–3
- Local Windows JMAP URL: public HTTPS vs SSH tunnel — per machine

## Binding Visual Constraints

- Brand wordmark **mailwart** with Bricolage Grotesque ExtraLight 200
- Public landing: Persuade (Phase 2+ polish); dashboard: Operate under `/dashboard/*`
- Light and dark themes required (Phase 2)
- Breadcrumbs on dashboard entity routes

> Phase 1 architecture pass. UI feature work starts Phase 2.

# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

Next.js 16 App Router + Tailwind CSS v4 + shadcn/ui (Node runtime). Deploy target: Dokploy project **Email** behind Traefik (later phase).

## Users

**Primary — Operator:** single technical operator managing Stalwart mailboxes across personal/business domains. Needs fast directory ops (create/reset/inspect/bulk) without Stalwart Admin density or Python one-offs.

**Secondary — Future helper:** same tasks with audit clarity; no separate RBAC in v1.

**Out of scope:** end-users reading mail (they use Roundcube).

## Product Purpose

A production admin dashboard for Stalwart domains, accounts (mailboxes), aliases, catch-alls, quotas, and passwords — with safe Roundcube deep-links for “open webmail.” Does not replace Stalwart Admin or Roundcube.

Success: create a mailbox in under 30s including password copy; bulk 50 accounts with clear failure report; catch-all editable without Stalwart Admin.

## Positioning

Server truth is Stalwart JMAP (`urn:stalwart:jmap`). UI never invents mailbox state. Full email addresses everywhere. Roundcube is a door, not a tunnel (no fake SSO). Single-operator deployment against one Stalwart instance — not multi-tenant SaaS.

## Brand Commitments

- Product host / brand surface: **email.yehia.dev**
- Domains managed: `yehia.dev`, `hiy.me`, `zokm.me`, `restoqd.com`
- Stalwart Admin: `https://mail.yehia.dev/admin`
- Webmail: `https://mail.zokm.me`
- Voice: active, specific, no apology fluff

## Constraints

- Stalwart v0.16.16 — management via JMAP at `/jmap` only (no REST `/api`)
- Stalwart admin credentials server-side only; never in browser Network as Stalwart Basic Auth
- App login (`APP_ADMIN_*`) distinct from Stalwart admin (`STALWART_ADMIN_*`)
- No mail-tester / deliverability automation in-app
- No reading/sending mail in-app
- Responsive web only (no mobile-native app)

## Terminology

| Term | Meaning |
|------|---------|
| Domain | Stalwart `x:Domain` |
| Mailbox / Account | Stalwart `x:Account` (User) |
| Catch-all | `Domain.catchAllAddress` |
| Roundcube | External webmail at mail.zokm.me |

## Evidence

- `docs/ARCHITECTURE.md`, `docs/PRODUCT_SPEC.md`
- Live scripts: `scripts/mail-restore/*.py`
- Stalwart image `stalwartlabs/stalwart:v0.16.16`; Roundcube 1.6.11

## Open Decisions

- Dashboard hostname at deploy (candidate: mailadmin.yehia.dev vs email.yehia.dev)
- Exact live `quotas` / `aliases` shapes pending Phase 2+ probe
- Local Windows JMAP URL: public HTTPS vs SSH tunnel — per developer machine

## Binding Visual Constraints (from Phase 2 brief)

- Public landing at `/`: modern, techy, clean; dark-mode preferred
- Secure Admin Login entry point required
- High-quality typography; subtle motion allowed
- Dashboard Phase 3: Operate console under `/dashboard/*` (overview, domains, mailboxes, import, settings)

> Inferred from `docs/PRODUCT_SPEC.md` + Phase 2 mission brief (subagent; no live interview). Facts marked open remain undecided.

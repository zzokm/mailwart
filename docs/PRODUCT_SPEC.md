# Email Manager — Product Specification

> Phase 1 product brief. Companion to [ARCHITECTURE.md](./ARCHITECTURE.md).  
> Mode: **Operate** (Impeccable) — task completion for a mail operator, not a marketing site.  
> Design dials (taste-skill): `DESIGN_VARIANCE: 4` · `MOTION_INTENSITY: 3` · `VISUAL_DENSITY: 6`

**Design read:** B2B ops console for a single technical operator managing Stalwart mailboxes across four personal/business domains, with Roundcube as the webmail escape hatch — Linear-adjacent density, editorial restraint, zero SaaS-landing tropes.

---

## 1. Problem

Mail on this VPS is already healthy (Stalwart + Roundcube + DNS). Day-to-day pain is **directory ops**: creating mailboxes, resetting passwords, inspecting domains/catch-alls, and bulk-adding accounts — today done via Python one-offs against JMAP or Stalwart’s dense `/admin` UI. Operators need a focused, safer, faster surface that speaks the same JMAP objects the restore scripts already use.

---

## 2. Users

| Persona | Need |
|---------|------|
| **Primary — Operator** (you) | CRUD domains/mailboxes, catch-all, quotas, bulk import, open Roundcube for a user |
| **Secondary — Future helper** | Same, with audit clarity; no separate RBAC in v1 |
| **Out of scope** | End-users reading mail (they use Roundcube) |

---

## 3. Product principles

1. **Server truth is Stalwart.** UI never invents mailbox state; always JMAP.
2. **Full email addresses everywhere.** Multi-domain local-parts are ambiguous.
3. **Partial success is honest.** Bulk ops report per-row outcomes.
4. **Danger is labeled.** Password policy / destroy domain / delete catch target.
5. **Roundcube SSO is explicit and short-lived.** Signed tokens select a mailbox; server-only Stalwart impersonation performs mail authentication.
6. **Minimum surface.** Prefer one good mailboxes table over five overlapping pages.

---

## 4. Information architecture

```
/login
/                     Overview (counts, health, recent actions later)
/domains              Domain list
/domains/[id]         Domain detail (catch-all, enabled, DNS summary read-only later)
/mailboxes            Cross-domain mailbox table (filter by domain)
/mailboxes/new        or dialog on list
/mailboxes/[id]       Detail: password reset, quota, aliases (edit after live shape probe), open Roundcube
/import               Bulk CSV/JSON wizard
/settings             Roundcube URL (read), session, danger zone
```

No top-level `/aliases` in v1 — aliases belong to mailbox detail.

---

## 5. Feature specifications

### 5.1 Overview

**Job:** Answer “is mail admin reachable, and how big is the directory?”

- Stalwart JMAP health (latency / ok / fail).
- Optional Roundcube HEAD soft-check.
- Counts: domains, accounts (Users).
- Links: Stalwart Admin (`https://mail.yehia.dev/admin`), Roundcube home.

**Not on Overview:** deliverability scores, queue depth, mail-tester (ops scripts).

### 5.2 Domains

**List columns:** name, enabled, catch-all address, mailbox count (derived), actions.

**Create domain:** name (+ description). Prefer **minimal** `x:Domain/set` create `{ name, description }` as proven by `provision.py` on this VPS. If Stalwart returns `notCreated` for missing fields, retry with full defaults (`certificateManagement`/`dnsManagement` Manual, `dkimManagement` Automatic, `subAddressing` Enabled). DNS/DKIM on this deployment are often managed outside the dashboard — do not build a DNS editor in v1.

**Detail:**
- Edit description, `isEnabled`.
- Catch-all: select existing mailbox on domain or clear.
- Sub-addressing toggle if exposed cleanly.
- Read-only: createdAt; later DNS zone snippet if useful.

**Destroy:** typed confirm; block if accounts remain (unless force with second confirm).

### 5.3 Mailboxes (Accounts)

**List:** email (computed), domain, description, quota summary, actions (edit, reset password, open Roundcube, delete).

**Create:**
- Domain (required select).
- Local-part (validate RFC-ish: allowed chars, no `@`).
- Password (generate button; show once).
- Optional description (default `local@domain`).
- Optional initial quota fields if we map Stalwart `quotas` keys clearly after probing live objects.

**Update password:** replace credentials via `x:Account/set` update; never display stored hash.

**Aliases:** Phase 2 probes live `Account/get` for `aliases` shape. Until confirmed: show raw/read-only if present; **do not** ship an editor that guesses the map format. Edit lands in Phase 3 after probe.

**Delete:** typed full email confirm; block if account is domain catch-all target.

**Open Roundcube:** new tab already authenticated as the selected mailbox; copy-email remains available.

### 5.4 Bulk import

**Input:** CSV columns `email,password,description` (description optional) or JSON array.

**Flow:**
1. Upload / paste.
2. Validate rows (parse email → local + domain; domain must exist).
3. Preview with duplicate detection against live directory.
4. Commit in chunks; progress UI.
5. Results table + download failures.

**Failure modes:** invalid email, unknown domain, duplicate, password policy, timeout mid-chunk (resume guidance: re-import skips existing).

### 5.5 Settings

- Display configured Roundcube URL & Stalwart URL (host only in UI).
- Change app login password (when app credentials are separate).
- Danger: view/edit authentication password policy (`x:Authentication`) — collapsed, warning copy.
- Link out to Stalwart Admin for everything else.

### 5.6 Auth (app)

- Login form; session cookie; logout.
- Unauthenticated users only see `/login`.
- No public marketing pages in v1 (placeholder home redirects to login or shows “Email Manager — Phase 1 scaffold”).

---

## 6. UI/UX component hierarchy (product view)

Matches Architecture §8. Concrete component jobs:

| Component | Job |
|-----------|-----|
| `AppShell` | Persistent nav + main landmark |
| `HealthPill` | Compact Stalwart status |
| `DomainSwitcher` | Filter context for mailboxes |
| `MailboxTable` | Primary working surface |
| `MailboxCreateDialog` | Single create |
| `PasswordField` | Generate / show once / copy |
| `CatchAllSelect` | Domain detail control |
| `BulkImportWizard` | 4-step: upload → validate → commit → report |
| `ConfirmDestroy` | Typed confirm pattern |
| `EmptyState` | First mailbox / no filter results — action-oriented copy |
| `ErrorState` | Timeout vs auth vs validation — different recovery CTAs |
| `ToastRegion` | Transient success/failure |

**Copy voice:** Active, specific, no apology fluff.  
- Error: “Stalwart did not respond within 15s. Retry.”  
- Empty: “No mailboxes in yehia.dev. Create one.”  
- Success: “Created me@yehia.dev.”

---

## 7. Edge cases (product acceptance)

| Scenario | Expected UX |
|----------|-------------|
| Stalwart timeout | Toast + inline retry; no infinite spinner |
| Stalwart 401 | “Mail server rejected admin credentials” — check env; do not loop |
| Bulk 10 fail / 40 ok | Summary “40 created, 10 failed”; download failed rows |
| Quota rejected | Field-level or row-level message from server reason |
| Catch-all → missing mailbox | Block save; explain |
| Delete catch mailbox | Block; must clear/retarget catch-all first |
| Roundcube down | Soft warning; link still available |
| Roundcube SSO unavailable | Show the route error; never fall back to exposing a mailbox or impersonator password |
| Duplicate `hi@yehia.dev` create | Skip or fail clearly in bulk; single create shows conflict |
| Admin account in list | Badge; destroy disabled or dual-confirm |
| Domain filter empty | Empty state, not error |
| Very long account list | Search + pagination or virtualize (≥200) |

---

## 8. Domains & inventory (current production truth)

**Domains:** yehia.dev, hiy.me, zokm.me, restoqd.com  

**Known mailboxes (non-exhaustive; live query is source of truth):**  
hi@, me@, noreply@ on yehia.dev; coolify@, support@, appflowy@, games@ on zokm.me; catch@ on each domain (catch-all).

**Webmail:** integrated at https://email.yehia.dev/webmail/; mailbox buttons use signed SSO.

**Admin UI:** https://mail.yehia.dev/admin  

---

## 9. Success metrics (qualitative v1)

- Create a mailbox in under 30 seconds including password copy.
- Bulk 50 accounts with clear failure report without SSH/Python.
- Catch-all visible and editable without Stalwart Admin.
- Zero incidents of Stalwart admin password appearing in browser Network tab (except dashboard’s own login).

---

## 10. Explicit out of scope

- Reading/sending mail in-app  
- Sieve script editor (Roundcube ManageSieve remains)  
- DNS record editing UI (Cloudflare scripts / Stalwart DNS automation)  
- mail-tester / deliverability automation  
- Multi-operator RBAC / SSO  
- Mobile-native app (responsive web only)  
- Replacing Stalwart Admin for MTA/queue/IP allowlists  

---

## 11. Phase plan

| Phase | Deliverable | Verify |
|-------|-------------|--------|
| **1** | Next.js 16 scaffold + architecture/product docs + 3 review passes | `package.json` has Next 16+; docs at `email-manager/docs/{ARCHITECTURE,PRODUCT_SPEC,ARCHITECTURE_REVIEW_LOG}.md`; placeholder only |
| **2** | Design system + auth + read-only domains/mailboxes | Login works; lists match Stalwart |
| **3** | Mutations + catch-all + Roundcube links | Create/reset/delete verified on staging or VPS |
| **4** | Bulk import + harden + Dokploy deploy | Partial failure report; HTTPS behind Traefik |

**Phase 1 complete criterion:** scaffold + docs + review log; ready for Phase 2 UI — **no deploy, no mail-tester.**

---

## 12. Open questions (do not block Phase 1)

1. App-level login distinct from Stalwart admin? **Decision for Phase 2: yes** (`APP_ADMIN_*` separate from `STALWART_ADMIN_*`).
2. Exact `quotas` and `aliases` object shapes from a live `Account/get` — confirm in Phase 2 with one authenticated probe.
3. Hostname for the dashboard itself (e.g. `mailadmin.yehia.dev`) — decide at deploy time.
4. Local Windows `STALWART_JMAP_URL`: public `https://mail.yehia.dev/jmap` vs SSH tunnel — choose per developer machine.

These are logged so Phase 2 does not silently guess.

---

## 13. Source of truth

Product behavior for Stalwart must stay consistent with:

- [ARCHITECTURE.md](./ARCHITECTURE.md)
- `../docs/mail/stalwart-restore.md` (repo root docs)
- `scripts/mail-restore/provision.py`, `catchall-setup.py`, `verify-roundcube-login.py`

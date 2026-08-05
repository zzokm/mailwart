# Email Manager — Architecture

> Phase 1 foundation doc. App: `d:\Yehia Uni\vpsredo\email-manager`  
> Stack target: **Stalwart v0.16.16** (JMAP management) + **Roundcube 1.6.11**  
> Live endpoints: Admin/API `https://mail.yehia.dev`, Webmail `https://email.yehia.dev/webmail/`
> Domains: `yehia.dev`, `hiy.me`, `zokm.me`, `restoqd.com`  
> Dokploy project: **Email**

---

## 1. Purpose and non-goals

**Purpose.** A production admin dashboard that manages Stalwart domains, accounts (mailboxes), aliases, catch-alls, quotas, and passwords — with safe Roundcube deep-links for “open webmail” — without replacing Stalwart Admin UI or Roundcube itself.

**Non-goals (Phase 1–N).**
- Not a full webmail client (no message list/compose UI).
- Not a replacement for Stalwart’s built-in `/admin` console for low-level MTA/queue/DNS ACME ops (those stay optional deep-links).
- No mail-tester automation in-app (ops scripts remain in `scripts/mail-restore/`).
- No multi-tenant SaaS; single operator deployment against one Stalwart instance.

---

## 2. Constraints from the live VPS

| Fact | Implication |
|------|-------------|
| Stalwart image `stalwartlabs/stalwart:v0.16.16` | **REST `/api/...` is gone.** All management is JMAP at `/jmap` with capability `urn:stalwart:jmap`. |
| Public admin URL `https://mail.yehia.dev`; HTTP API also on VPS `127.0.0.1:8080` | Dashboard server talks to Stalwart via `STALWART_JMAP_URL` (prefer private URL when co-located; public HTTPS when remote). |
| Admin principal `admin@zokm.me`; bootstrap/recovery historically used bare `admin` via `STALWART_RECOVERY_ADMIN` | Env must use the **current** admin email principal for JMAP. App stores Stalwart admin creds **server-side** only; never ship them to the browser. |
| Roundcube at `https://email.yehia.dev/webmail/` | Same-origin sibling service. A custom plugin verifies Email Manager tokens and uses Stalwart impersonation for IMAP/SMTP. |
| Traefik terminates TLS for both | Dashboard will also sit behind Traefik/Dokploy when deployed (Phase later). |
| Catch-all mailboxes `catch@{domain}` + `Domain.catchAllAddress` already provisioned | Dashboard must treat catch-all as a first-class domain setting, not an afterthought. |
| Proven scripts in `scripts/mail-restore/` | Integration layer must mirror their JMAP shapes (`x:Domain/*`, `x:Account/*`, `x:Authentication/*`). |

---

## 3. High-level system diagram

```
┌─────────────────────┐     HTTPS      ┌──────────────────────────┐
│ Operator browser    │ ─────────────► │ Next.js Email Manager    │
│ (session cookie)    │ ◄───────────── │ App Router (Node runtime)│
└─────────────────────┘                │  /api/* route handlers   │
                                       └────────────┬─────────────┘
                                                    │ Basic Auth + JSON
                                                    │ POST /jmap
                                                    ▼
                                       ┌──────────────────────────┐
                                       │ Stalwart v0.16.16        │
                                       │ mail.yehia.dev / :8080   │
                                       └────────────┬─────────────┘
                                                    │ IMAP/SMTP/Sieve
                                                    ▼
                                       ┌──────────────────────────┐
                                       │ Roundcube (integrated)   │
                                       │ /webmail                 │
                                       └──────────────────────────┘
```

**Data flow rule:** Browser → Next.js Route Handlers / Server Actions only. Stalwart credentials and JMAP calls never leave the server.

---

## 4. Folder structure (target)

Minimal Phase 1 scaffold exists today (`src/app`, Tailwind, TS). Target layout for later phases — **do not invent abstractions early**; grow into this:

```
email-manager/
├── docs/
│   ├── ARCHITECTURE.md          ← this file
│   ├── PRODUCT_SPEC.md
│   └── ARCHITECTURE_REVIEW_LOG.md
├── public/
├── src/
│   ├── app/
│   │   ├── layout.tsx
│   │   ├── page.tsx             ← Phase 1: placeholder only
│   │   ├── (auth)/
│   │   │   └── login/page.tsx
│   │   ├── (dashboard)/
│   │   │   ├── layout.tsx       ← shell: nav, domain switcher
│   │   │   ├── page.tsx         ← overview
│   │   │   ├── domains/
│   │   │   ├── mailboxes/       ← aliases edited on mailbox detail (no /aliases route)
│   │   │   ├── import/
│   │   │   └── settings/
│   │   └── api/
│   │       ├── auth/
│   │       ├── domains/
│   │       ├── accounts/
│   │       └── health/
│   ├── components/              ← UI primitives + feature widgets
│   │   ├── ui/                  ← button, input, table, dialog, toast
│   │   ├── layout/              ← AppShell, Sidebar, TopBar
│   │   └── mail/                ← DomainTable, MailboxForm, QuotaBar…
│   ├── lib/
│   │   ├── env.ts               ← zod-validated env
│   │   ├── auth/                ← iron-session sealed cookie
│   │   ├── stalwart/
│   │   │   ├── client.ts        ← JMAP POST helper (timeouts, retries)
│   │   │   ├── types.ts         ← Domain, Account, method envelopes
│   │   │   ├── domains.ts
│   │   │   ├── accounts.ts
│   │   │   └── errors.ts        ← map notCreated / HTTP / timeout
│   │   └── roundcube.ts         ← deep-link URL builder only
│   └── styles/                  ← tokens if not in CSS vars
├── .env.example
├── package.json
└── …
```

**Simplicity gate (Karpathy):** Until a second consumer appears, keep one `stalwart/client.ts`. Do not add a repository pattern, DI container, or ORM.

---

## 5. Stalwart integration strategy (JMAP — match live VPS)

### 5.1 Endpoint and capabilities

| Item | Value used on this VPS |
|------|------------------------|
| URL | `POST {STALWART_JMAP_URL}` where default production candidate is `https://mail.yehia.dev/jmap` (scripts used `http://127.0.0.1:8080/jmap` on-host) |
| Content-Type | `application/json` |
| Auth | HTTP Basic: `Authorization: Basic base64(user:pass)` |
| `using` | Always include `urn:ietf:params:jmap:core` and `urn:stalwart:jmap` for management objects. Add `urn:ietf:params:jmap:mail` only if reading mail-protocol objects (usually not needed for admin CRUD). |

**Note on docs vs practice:** Official Stalwart docs sometimes show `https://mail.example.com/api` in curl samples; **this deployment’s working path is `/jmap`**, as proven by `scripts/mail-restore/*.py`. Prefer `/jmap`. If a future Stalwart build aliases `/api` → JMAP, treat that as optional — do not hard-code both without a single config knobs.

### 5.2 Request envelope

```json
{
  "using": ["urn:ietf:params:jmap:core", "urn:stalwart:jmap"],
  "methodCalls": [
    ["x:Domain/query", { "filter": null, "limit": 50 }, "d0"]
  ]
}
```

Response shape: `{ "methodResponses": [ ["x:Domain/query", { "ids": [...] }, "d0"] ] }`.

Client helper must:
1. Parse `methodResponses` by call id.
2. Surface `notCreated` / `notUpdated` / `notDestroyed` maps (JMAP partial failure).
3. Treat HTTP 401/403 as auth failure; 5xx and network errors as transport failure.

### 5.3 Objects and methods we will use

| Object | Methods | Dashboard use |
|--------|---------|---------------|
| `x:Domain` | `query`, `get`, `set` | List domains; create; update `catchAllAddress`, `description`, `isEnabled`, sub-addressing |
| `x:Account` | `query`, `get`, `set` | Mailboxes: create User accounts, update password/credentials, quotas, aliases, destroy |
| `x:Authentication` | `get`, `set` | Optional: password policy (`passwordMinLength`, `passwordMinStrength`) — read-mostly; mutate only with explicit danger UI |
| `x:Bootstrap` | `get` | Health/readiness diagnostics only (do not re-bootstrap from the app) |

**Domain create — VPS-proven minimal (prefer first):**

```json
{ "name": "example.com", "description": "example.com" }
```

`provision.py` created domains with only these fields on this deployment. Official docs also show required `certificateManagement`, `dkimManagement`, `dnsManagement`, `subAddressing`. Implementation rule: attempt **minimal create**; if `notCreated` cites missing fields, retry once with explicit defaults (`Manual` cert/DNS, `Automatic` DKIM, `Enabled` sub-addressing) matching [stalw.art Domain docs](https://stalw.art/docs/ref/object/domain/).

**Account email resolution algorithm (must match restore scripts):**

1. Collect candidates from `description` when it contains `@`.
2. Normalize `emails`: if array, take string entries or `email` keys on objects; if dict, take values the same way.
3. Reconstruct `name@{domainName}` when `domainId` maps to a known domain.
4. Primary display address: prefer reconstructed `name@domain` if domain known; else first email candidate; else `description`.
5. Index maps are **case-insensitive** (scripts lowercased keys).

**Account create shape (proven on VPS):**

```json
{
  "@type": "User",
  "name": "localpart",
  "description": "localpart@domain.tld",
  "domainId": "<Domain id>",
  "credentials": { "0": { "@type": "Password", "secret": "<plaintext or hash>" } },
  "memberGroupIds": {},
  "roles": { "@type": "User" },
  "permissions": { "@type": "Inherit" },
  "quotas": {},
  "aliases": {},
  "encryptionAtRest": { "@type": "Disabled" }
}
```

**Email identity resolution:** Stalwart v0.16 accounts use local `name` + `domainId`. Scripts reconstruct `name@domain` and also store full address in `description`. Dashboard UI must always display **full email**, never bare local-part alone across multi-domain.

**Domain catch-all (proven):**

```json
["x:Domain/set", { "update": { "<domainId>": { "catchAllAddress": "catch@yehia.dev" } } }, "d2"]
```

Catch-all target mailbox should exist first (`catch@{domain}` pattern already used).

### 5.4 Batching and bulk upload

JMAP allows many creates in one `x:Account/set` `create` map. Strategy:

1. **Validate CSV/JSON client-side** (format, domain membership, duplicate local-parts).
2. **Chunk** server-side — **default 25** accounts per JMAP call (configurable later only if needed).
3. **Per-chunk result:** collect `created` vs `notCreated`; continue remaining chunks; return a structured job report.
4. **Idempotency:** before create, `query`+`get` existing accounts; skip or update password only when operator chose “overwrite passwords”.
5. **No silent policy bypass:** if Stalwart rejects weak passwords, return the `notCreated` type/description; optional admin-only path to adjust `x:Authentication` (danger zone) matching restore-script behavior — default **off**.

### 5.5 Timeouts, retries, concurrency

| Concern | Policy |
|---------|--------|
| Per-request timeout | 15s default (`AbortSignal`); bulk chunk 30s |
| Retry | Idempotent `query`/`get`: 1 retry on network/5xx with 500ms backoff. Mutations: **no automatic retry** (avoid duplicate creates); operator re-runs with idempotent skip. |
| Concurrency | Single in-flight mutation per resource from UI; server serializes bulk chunks. |
| Circuit | After 3 consecutive transport failures, `/api/health` reports Stalwart unreachable; UI shows banner. |

### 5.6 What we will not call from the dashboard (initially)

- MTA queue purge, blocked-IP lists, DNS provider secrets, Bootstrap/set — keep in ops scripts / Stalwart Admin until product need is proven.
- End-user JMAP Mail methods for reading mailboxes — Roundcube owns that UX.

### 5.7 Runtime and local development

- All Stalwart route handlers / server actions use **Node.js runtime** (`runtime = "nodejs"`). Edge is unsuitable for private Docker DNS names and long bulk calls.
- **On VPS / Docker Compose:** `STALWART_JMAP_URL=http://stalwart-mail:8080/jmap` (or `http://127.0.0.1:8080/jmap` on host network).
- **Windows local dev:** host cannot reach VPS loopback. Use `https://mail.yehia.dev/jmap` over HTTPS, or an SSH tunnel to `8080`. Document the chosen URL in `.env.local` (gitignored).
- Dokploy compose reference for Stalwart: project **Email**, compose id `ZHxvknPKmn9V0LDDL5GFh`.

### 5.8 Source of truth (existing automation)

Mirror method shapes from these proven scripts before inventing new payloads:

- `scripts/mail-restore/provision.py` — Domain/Account create
- `scripts/mail-restore/catchall-setup.py` — catch-all + identity parsing
- `scripts/mail-restore/create-hashed.py` — credential / password-policy interplay
- `scripts/mail-restore/bootstrap.py` — Bootstrap (read-only from app)
- `scripts/mail-restore/verify-roundcube-login.py` — Roundcube login limitations

---

## 6. Admin authentication flow

### 6.1 Threat model (simple)

- Operator is trusted human with Stalwart admin rights.
- Browser is hostile; XSS must not exfiltrate Stalwart admin password.
- Network path Next.js → Stalwart may be private Docker network or public HTTPS.

### 6.2 Chosen approach: App session + server-held Stalwart admin

**Phase 2 implementation plan (documented now, not coded yet):**

1. **Env (deployment secrets):**
   - `STALWART_JMAP_URL`
   - `STALWART_ADMIN_USER` (e.g. `admin@zokm.me`)
   - `STALWART_ADMIN_PASSWORD`
   - `SESSION_SECRET` (≥32 random bytes)
   - `ROUNDCUBE_URL` (`https://mail.zokm.me`)
   - Optional: `ADMIN_LOGIN_USER` / `ADMIN_LOGIN_PASSWORD` if we want an app-level password **distinct** from Stalwart (recommended for production so rotating Stalwart recovery does not equal dashboard login — **default recommendation: separate app credentials**).

2. **Login:**
   - Operator submits dashboard credentials (`APP_ADMIN_USER` / `APP_ADMIN_PASSWORD`).
   - Server verifies against app credentials (constant-time compare).
   - Rate limit: **5 attempts / 15 minutes / IP** on `POST /api/auth/login` (in-memory is fine for single-node; Redis only if we multi-instance later).
   - On success: set **HttpOnly, Secure, SameSite=Lax** cookie via **iron-session**. Session payload: `{ role: "admin", exp }` — **never** Stalwart password.

3. **Authenticated API:**
   - Middleware / helper `requireSession()`.
   - Route handlers call `stalwartClient` using **env** `STALWART_ADMIN_USER` / `STALWART_ADMIN_PASSWORD` (typically `admin@zokm.me`).

4. **Logout:** destroy session cookie.

5. **No client-side Stalwart Basic auth.** Ever.

### 6.3 Alternatives considered

| Option | Verdict |
|--------|---------|
| Pass-through: user types Stalwart admin into browser each time; proxy with those creds | Rejected for Phase 1–2: harder XSS blast radius; session still needed. May revisit for “break-glass”. |
| OAuth/OIDC | Overkill for single-operator VPS; defer. |
| Stalwart OAuth tokens | Possible later if Stalwart issues API tokens; not required while Basic works for admin. |

### 6.4 CSRF

SameSite cookies + Next.js Server Actions origin checks. For cookie-auth POST APIs, require same-origin or CSRF token.

---

## 7. Roundcube integration

| Capability | Support |
|------------|---------|
| Open webmail home | `ROUNDCUBE_URL` → `https://email.yehia.dev/webmail/` |
| SSO token | Authenticated `/api/webmail/sso` signs mailbox, expiry, and nonce with `WEBMAIL_SSO_SECRET`; lifetime is 30 seconds. |
| IMAP/SMTP auth | `em_sso` verifies the token and authenticates as `target%impersonator` using server-only Stalwart credentials. |
| Per-mailbox “Open” | Button opens a new tab already authenticated as that mailbox. No mailbox password is stored or sent to the browser. |
| Health probe | Best-effort `GET ROUNDCUBE_URL/` expecting HTTP 200 HTML. **Never** POST login credentials from the dashboard health job. |

Roundcube auth boundaries:
- Roundcube keeps its own session cookie under `/webmail/`.
- Session timeout independent of dashboard.
- IMAP SSL to `stalwart-mail:993` is internal; dashboard must not assume Roundcube uptime equals Stalwart JMAP uptime — JMAP health is authoritative for admin ops; Roundcube health is advisory.

---

## 8. UI/UX component hierarchy (Operate mode)

**Design read (Impeccable Operate + taste-skill dials):** Mail ops console for a technical operator. Density mid-high (`VISUAL_DENSITY: 6`), motion low (`MOTION_INTENSITY: 3`), variance restrained (`DESIGN_VARIANCE: 4`). Brand = typography + precise chrome, not marketing hero. Avoid purple-gradient SaaS clichés; prefer a cool editorial ops palette (ink / paper / signal amber for warnings) — finalized in Phase 2 `DESIGN.md`.

```
AppShell
├── TopBar (product name, Stalwart health pill, operator menu)
├── Sidebar
│   ├── Overview
│   ├── Domains
│   ├── Mailboxes
│   ├── Bulk import
│   └── Settings (Roundcube URL, danger: password policy)
└── Main
    ├── PageHeader (title, one sentence, primary actions)
    ├── FilterBar (domain select, search, status)
    ├── DataTable | EmptyState | ErrorState | Skeleton
    └── Overlays: CreateMailboxDialog, ConfirmDestroy, BulkImportWizard, ToastRegion
```

**Hierarchy rules:**
- One primary action per page header.
- Destructive actions require typed confirm (email address).
- Quota shown as compact meter, not a card farm.
- Catch-all controls live on Domain detail, not buried in global settings.

---

## 9. Edge cases (must handle)

### 9.1 API timeouts / Stalwart down
- Abort after timeout; UI toast + inline error with “Retry”.
- Distinguish: DNS failure, TLS failure, HTTP 401, HTTP 5xx, JMAP method error.
- Overview health: green/amber/red for JMAP reachability.

### 9.2 Bulk upload failures
- Partial success is normal: show table of rows → `created` | `skipped` | `failed` + Stalwart reason.
- Allow download of failure CSV.
- Do not roll back successful creates automatically (no distributed transaction).

### 9.3 Quota errors
- On set/update, if Stalwart returns quota-related `notUpdated`/`notCreated`, map to human copy: “Quota rejected by mail server.”
- Display current quotas from `Account.quotas` when present; empty `{}` means default/unlimited per server policy — label as “Default (server)”.

### 9.4 Catch-all domains
- Setting `catchAllAddress` to a non-existent mailbox → mail may bounce or reject; UI validates target exists in account list for that domain.
- Clearing catch-all: set null/omit per API; confirm dialog warns unknown recipients will reject.
- `catch@` mailboxes are normal Users; deleting them while still referenced by catch-all is blocked in UI.

### 9.5 Multi-domain local-part collisions
- `support@zokm.me` and `support@yehia.dev` are different accounts. Tables always show domain column; create form requires domain select first.

### 9.6 Password policy
- Weak passwords may fail `x:Account/set`. Surface server error. Do not auto-weaken `x:Authentication` without explicit Settings › Danger action + audit log note.

### 9.7 Roundcube deep-link / auth limitations
- No password in URL.
- No guarantee of logged-in session.
- If Roundcube is down, button still opens URL; optional HEAD/GET health check soft-warns.

### 9.8 Admin principal safety
- UI never offers Destroy on `admin@…` or accounts with admin roles without dual confirm.
- Domain destroy requires empty (or force) and typed domain name.

### 9.9 Pagination / limits
- Scripts used `limit: 200`. Client must page or raise limit consciously; if `ids` truncated, follow with another query or document max.

### 9.10 Concurrent edits
- Last-write-wins via JMAP `set`. Optimistic UI; on conflict/error, refetch row.

---

## 10. Environment & deployment posture

| Variable | Required | Notes |
|----------|----------|-------|
| `STALWART_JMAP_URL` | yes | e.g. `http://stalwart-mail:8080/jmap` in Docker, or `https://mail.yehia.dev/jmap` |
| `STALWART_ADMIN_USER` | yes | `admin@zokm.me` |
| `STALWART_ADMIN_PASSWORD` | yes | from secrets — never commit |
| `SESSION_SECRET` | yes | app session |
| `ROUNDCUBE_URL` | yes | `https://email.yehia.dev/webmail/` |
| `WEBMAIL_SSO_SECRET` | yes | Shared HMAC secret, at least 32 characters |
| `ROUNDCUBE_DES_KEY` | yes | Roundcube session credential encryption key |
| `WEBMAIL_IMPERSONATOR_USER` / `WEBMAIL_IMPERSONATOR_PASSWORD` | optional | Dedicated Stalwart principal with `impersonate`; compose falls back to `STALWART_ADMIN_*` |
| `APP_ADMIN_USER` / `APP_ADMIN_PASSWORD` | recommended | dashboard login |

Deploy later via Dokploy (same **Email** project or sibling). Phase 1: **no deploy**.

---

## 11. Security checklist

- [ ] Secrets only in env / Dokploy secrets
- [ ] HttpOnly session cookie
- [ ] Server-only Stalwart Basic auth header construction
- [ ] Rate-limit login route
- [ ] Audit log (later): who created/deleted which mailbox
- [ ] No credentials in client bundles / Next public env
- [ ] Disable directory listing; strict CSP when UI ships

---

## 12. Testing strategy (later phases)

| Layer | What |
|-------|------|
| Unit | JMAP response parsers; email/domain validators; bulk chunker |
| Integration | Against Stalwart in Docker or staging URL with throwaway domain |
| E2E | Login → create mailbox → appear in list → Roundcube link href |
| Manual | Catch-all set/clear; quota edge; bulk partial failure |

Do **not** run mail-tester from this app in Phase 1.

---

## 13. Phase boundary

| Phase | Scope |
|-------|--------|
| **1 (this)** | Next.js scaffold + docs + review log. Placeholder page only. |
| 2 | Design tokens, AppShell, auth, domain/mailbox read UI |
| 3 | Create/update/delete, catch-all, quotas, Roundcube links |
| 4 | Bulk import, harden errors, deploy to Dokploy |

**Success criteria for Phase 1:**
- Next.js **16+** App Router + TS + Tailwind at `email-manager/`
- Docs: `docs/ARCHITECTURE.md`, `docs/PRODUCT_SPEC.md`, `docs/ARCHITECTURE_REVIEW_LOG.md` (3 passes)
- Placeholder page only; no dashboard feature UI; no deploy; no mail-tester
- Docs match live JMAP usage (`/jmap`, `x:Domain/*`, `x:Account/*`)

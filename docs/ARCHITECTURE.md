# mailwart — System Architecture

> Phase 1 foundation. Product brand: **mailwart** (all lowercase).  
> Repo / deploy folder: `email-manager` (historical path; product name is mailwart).  
> Stack: **Next.js 16+** App Router · Tailwind · Stalwart **v0.16.x** JMAP · Roundcube **1.6.x**  
> Mode: **Operate** (Impeccable) for `/dashboard/*`; **Persuade** for public landing (later phases).

Personal/deployment hostnames (e.g. operator domains, Traefik hosts) belong in **env / Dokploy only**. They are not product identity.

---

## 1. Purpose and non-goals

**Purpose.** Production-grade email management dashboard for a Stalwart Mail Server deployment: cPanel-class directory ops (domains, mailboxes, quotas, routing, DNS health, bulk CSV, delivery visibility) with Roundcube as the webmail surface via short-lived SSO — not a replacement for Stalwart Admin or Roundcube itself.

**Non-goals.**
- Not an in-app webmail client (no message list/compose).
- Not a full replacement for Stalwart `/admin` MTA/queue/IP/ACME low-level ops (deep-link out).
- No mail-tester / deliverability scoring automation in-app.
- Phase 1 does not ship feature UI redesigns; this document defines the target architecture.

---

## 2. Product identity vs deployment config

| Layer | What lives here |
|-------|-----------------|
| **Brand** | `mailwart` wordmark · font **Bricolage Grotesque ExtraLight 200** · generalized copy |
| **Deployment** | `STALWART_JMAP_URL`, Traefik hostnames, managed domain inventory, Roundcube public URL |
| **Secrets** | Dokploy / `.env.local` only — never committed, never `NEXT_PUBLIC_*` |

UI strings, package display name (later), and docs refer to **mailwart**. Docker image/service names may remain `email-manager` until a deliberate rename PR; that rename is optional and not Phase 1.

---

## 3. High-level system diagram

```
┌──────────────────────┐   HTTPS    ┌─────────────────────────────────┐
│ Operator browser     │ ─────────► │ mailwart (Next.js App Router)   │
│ iron-session cookie  │ ◄───────── │ RSC · Server Actions · /api/*   │
└──────────────────────┘            │ React Query (client islands)    │
                                    └────────────┬────────────────────┘
                                                 │ Basic Auth + JSON
                                                 │ POST /jmap  (Node)
                                                 ▼
                                    ┌─────────────────────────────────┐
                                    │ Stalwart Mail Server            │
                                    │ JMAP management + IMAP/SMTP     │
                                    └────────────┬────────────────────┘
                                                 │ IMAP/SMTP/Sieve
                                                 ▼
                                    ┌─────────────────────────────────┐
                                    │ Roundcube (/webmail)            │
                                    │ em_sso plugin + impersonation   │
                                    └─────────────────────────────────┘
```

**Hard rule:** Browser → Next.js only. Stalwart admin credentials and JMAP calls never leave the server. Webmail SSO tokens are short-lived HMAC payloads; mailbox passwords never enter the browser.

---

## 4. Stack and runtime boundaries

| Concern | Choice | Why |
|---------|--------|-----|
| Framework | Next.js **16+** App Router, React 19, TypeScript | Already in repo; RSC + Server Actions fit admin CRUD |
| Styling | Tailwind v4 + shadcn/ui | Existing; Operate density console |
| Session | **iron-session** HttpOnly cookie | Sealed payload; no Stalwart secret in cookie |
| Validation | zod | Env + form + CSV row schemas |
| Stalwart I/O | Node.js runtime only | Private Docker DNS + long bulk jobs; **not Edge** |
| Client cache | **TanStack React Query** (Phase 2+) | Interactive tables, polling health, mutation invalidation |
| Deploy | Dokploy + Docker Compose + Traefik | Existing `Dockerfile` / `docker-compose.yml` / Roundcube |

### 4.1 RSC / Server Actions / React Query — responsibility split

```
┌─ Server Components (RSC) ─────────────────────────────────────┐
│ First paint for authenticated shells: layout chrome,          │
│ overview counts, domain/mailbox lists when filters are simple.│
│ Call stalwart/* helpers directly. No React Query on server.   │
└───────────────────────────────────────────────────────────────┘
         │ navigate / soft refresh
         ▼
┌─ Server Actions ("use server") ───────────────────────────────┐
│ Mutations: create/update/destroy domain & account, catch-all, │
│ password reset, CSV commit chunks, SSO token mint (or /api).  │
│ return { ok, data } | { ok:false, error } — never throw raw   │
│ secrets. revalidatePath / revalidateTag after success.        │
└───────────────────────────────────────────────────────────────┘
         │ optional client islands
         ▼
┌─ React Query (client) ────────────────────────────────────────┐
│ Use when: search/filter debounce, live health polling,        │
│ bulk-import job progress (`jobId` report), DNS refresh,       │
│ detail panes that refetch without full RSC round-trip.        │
│ queryFn → thin /api/* GET wrappers OR server-action readers.  │
│ invalidateQueries on mutation settle; do not duplicate        │
│ Stalwart state in a second client store.                      │
│ Bulk: React Query is read-only observer; chunk Server Actions │
│ are the only writers to the job report.                       │
└───────────────────────────────────────────────────────────────┘
```

**Simplicity gate:** Prefer RSC + Server Action until a page needs client polling or multi-step wizard state. Do not wrap every list in React Query by default.

### 4.2 API route handlers

Keep `/api/*` for:
- Cookie session login/logout (if not purely Server Action).
- Webmail SSO mint (`/api/webmail/sso`) — Roundcube plugin consumes URL/token.
- Health probes suitable for uptime monitors.
- Optional streaming/progress endpoints for long CSV jobs.

CRUD that the dashboard owns should prefer Server Actions; avoid a parallel REST surface unless a non-browser client appears.

---

## 5. Folder structure (evolve, do not wipe)

Preserve production-critical paths: `roundcube/plugins/em_sso`, `src/app/api/webmail/sso`, `Dockerfile`, `docker-compose.yml` (Roundcube service).

```
email-manager/                    # repo root (git)
├── docs/
│   ├── ARCHITECTURE.md           ← this file
│   ├── PRODUCT_SPEC.md
│   └── ARCHITECTURE_REVIEW_LOG.md
├── PRODUCT.md                    # Impeccable product context (mailwart)
├── DESIGN.md                     # visual world (evolves Phase 2+)
├── roundcube/                    # KEEP — em_sso plugin + config
├── src/
│   ├── app/
│   │   ├── (auth)/login/
│   │   ├── (dashboard)/dashboard/…
│   │   ├── api/webmail/sso/      # KEEP
│   │   ├── layout.tsx
│   │   └── page.tsx              # landing (Persuade — later polish)
│   ├── components/
│   │   ├── ui/                   # shadcn primitives
│   │   ├── layout/               # AppShell, breadcrumbs, theme
│   │   └── mail/                 # domain/mailbox/DNS/import widgets
│   ├── lib/
│   │   ├── env.ts                # zod env (deployment URLs as config)
│   │   ├── auth/                 # session, credentials, rate-limit
│   │   ├── stalwart/             # single JMAP client + domain/account modules
│   │   ├── dns/                  # SPF/DKIM/DMARC/MX validators (Phase 2+)
│   │   ├── bulk/                 # CSV parse, chunk, job report
│   │   └── webmail-sso.ts        # KEEP — token sign/verify helpers
│   └── middleware.ts             # session gate for /dashboard
├── docker-compose.yml            # KEEP — email-manager + roundcube
├── Dockerfile                    # KEEP
└── package.json                  # next 16+
```

**Karpathy gate:** One `stalwart/client.ts` until a second consumer forces extraction. No DI container, no repository layer for fashion.

---

## 6. Stalwart integration (JMAP)

### 6.1 Endpoint

| Item | Value |
|------|-------|
| URL | `POST {STALWART_JMAP_URL}` — typically `http://stalwart-mail:8080/jmap` in-cluster or public `https://{mail-host}/jmap` |
| Auth | HTTP Basic from **server env** `STALWART_ADMIN_USER` / `STALWART_ADMIN_PASSWORD` |
| `using` | `urn:ietf:params:jmap:core` + `urn:stalwart:jmap` |

Stalwart v0.16.x management is **JMAP**, not legacy REST `/api`. Prefer `/jmap` as the single configured path.

### 6.2 Method map (product surface)

| Object | Methods | mailwart use |
|--------|---------|--------------|
| `x:Domain` | query, get, set | Domains, catch-all, enabled, description, sub-addressing |
| `x:Account` | query, get, set | Mailboxes, passwords, quotas, aliases, app passwords, destroy |
| `x:Authentication` | get, set | Password policy (danger zone) |
| `x:Bootstrap` | get | Readiness only — never re-bootstrap from UI |
| Sieve / filters | via ManageSieve or Stalwart objects as available | Autoresponders / filter summaries — prefer Roundcube ManageSieve deep-link when API is awkward |
| Telemetry / logs | Stalwart admin APIs or log ship | Delivery/audit views — read-only adapters |

### 6.3 Domain & account shapes (proven patterns)

**Domain create — try minimal first:**

```json
{ "name": "example.com", "description": "example.com" }
```

On `notCreated` for missing fields, retry once with explicit defaults (`Manual` cert/DNS, `Automatic` DKIM, `Enabled` sub-addressing) per Stalwart Domain docs.

**Account create (User):** local `name` + `domainId` + credentials + roles; UI always displays **full email** (`local@domain`).

**Email resolution algorithm** (for list/detail keys):
1. Candidates from `description` when it contains `@`.
2. Normalize `emails` (array or dict).
3. Reconstruct `name@{domainName}` from `domainId`.
4. Prefer reconstructed address when domain known; else first candidate; else description.
5. Index maps **case-insensitive**.

### 6.4 Timeouts, retries, concurrency

| Concern | Policy |
|---------|--------|
| Timeout | 15s default; bulk chunk 30s |
| Retry | Idempotent query/get: 1× on network/5xx, 500ms backoff. Mutations: **no auto-retry** |
| Concurrency | One in-flight mutation per resource from UI; bulk chunks serial |
| Health | After 3 consecutive transport failures, health = unreachable |

### 6.5 Local vs cluster URLs

- **Docker/Dokploy:** internal hostname on shared network.
- **Local Windows:** public HTTPS JMAP URL or SSH tunnel — never assume VPS loopback.

---

## 7. Admin authentication

1. Operator logs in with `APP_ADMIN_USER` / `APP_ADMIN_PASSWORD` (distinct from Stalwart).
2. Rate limit login: **5 attempts / 15 minutes / IP** (in-memory OK for single node).
3. Session: iron-session `{ role: "admin", exp }` — **never** Stalwart password.
4. Middleware `requireSession` for `/dashboard/*` and protected APIs.
5. Server builds Stalwart Basic Auth from env only.

**CSRF:** SameSite cookies + Server Action origin checks; same-origin for cookie POSTs.

**Deferred:** OAuth/OIDC, multi-operator RBAC (document hooks for later multi-tenant — see review log).

---

## 8. Roundcube SSO (preserve)

Existing flow — do not regress:

1. Authenticated operator clicks “Open webmail” on a mailbox.
2. `GET/POST /api/webmail/sso` mints HMAC token (`WEBMAIL_SSO_SECRET`).
3. Browser opens Roundcube with token; `em_sso` verifies and authenticates as `target%impersonator` using server-only impersonator credentials.
4. Roundcube session is independent of mailwart session.

### 8.1 Token claims & abuse controls

| Claim / control | Rule |
|-----------------|------|
| `mailbox` | Full email; must exist in directory at mint time |
| `exp` | ≤ **30 seconds** from mint |
| `nonce` | Unique; plugin should reject replay when practical |
| `aud` | Fixed audience string e.g. `roundcube-em-sso` |
| Authz | Mint only if mailwart session valid; optional: operator cannot SSO as admin@ unless dual-confirm |
| Impersonator | Prefer dedicated `WEBMAIL_IMPERSONATOR_*` principal with **impersonate-only** rights; fall back to Stalwart admin only if unavoidable |
| Audit | Log SSO mint: timestamp, operator session id, target mailbox (never token or secrets) |

Health: best-effort GET of Roundcube URL expecting HTML 200 — never POST mailbox or impersonator passwords from health jobs.

---

## 9. CSV bulk operations

1. Parse CSV/JSON client-side + server-side (never trust client alone). Max upload size: **2 MB** / **5 000 rows** (reject above with clear error).
2. Validate: email → local + domain; domain must exist; password policy hints.
3. Preview duplicates against live directory.
4. **Job session (not one giant request):**
   - Server creates `jobId` + in-memory report (TTL **1 hour**).
   - Wizard commits **one chunk per Server Action** (default **25** rows).
   - Client (React Query) polls/refetches `getBulkJob(jobId)` between chunks.
   - Operator can pause/abort; completed rows stay created (no distributed rollback).
5. Per-row report: created | skipped | failed + reason; download failure CSV.
6. Idempotency: skip existing unless operator chose overwrite-password mode.
7. **Double-submit guard:** chunk action is idempotent on `(jobId, chunkIndex)`; ignore replay.

**Upgrade path:** if Dokploy runs multiple replicas or jobs must survive restarts, move job store to SQLite/Redis — default stays memory for single-node simplicity (Pass 3).

### 9.1 Stalwart pacing / rate limits

| Signal | Behavior |
|--------|----------|
| HTTP 429 / 503 | Backoff using `Retry-After` when present, else 1s → 2s → 4s (max 3 waits), then fail chunk |
| Sustained >10s latency | Health pill → amber; do not open parallel mutating pipelines |
| Concurrency | **One** mutating JMAP pipeline process-wide for bulk; interactive single-row mutations queue behind or run only when no bulk job active (UI disables conflicting actions) |

Login rate limit (auth) remains separate: **5 / 15 min / IP**.

---

## 10. DNS validation

Read-only health for each managed domain (Phase 2+). Checks use the **mailwart server’s resolver view** (often the VPS) — UI must warn that split-horizon DNS may differ from public checkers.

| Check | Pass | Warn | Fail |
|-------|------|------|------|
| MX | ≥1 MX; target matches `DNS_EXPECTED_MX` (env, optional) or non-empty | MX exists but target ≠ expected | No MX |
| SPF | TXT `v=spf1` present and includes expected mechanism from env when set | Present but missing expected include/ip | Missing / multiple conflicting hard-fail stories |
| DKIM | At least one configured selector (`DNS_DKIM_SELECTORS` CSV env) resolves `selector._domainkey` | Some selectors missing | All selectors missing when selectors configured; or none configured → warn “not checked” |
| DMARC | `_dmarc` TXT `v=DMARC1` present | `p=none` only | Missing |
| PTR / A | Optional advisory for mail host | Mismatch | — |

Implementation: Node `dns.promises` from server — never open an unauthenticated recursive resolver to the public internet beyond normal lookups. Cache ~5 minutes; manual refresh busts cache. Show raw snippets for copy; **no DNS write UI in v1**.

---

## 11. UI shell (Operate — later phases)

```
AppShell
├── TopBar (mailwart wordmark, theme toggle, health, operator menu)
├── Breadcrumbs (section › domain › mailbox)
├── Sidebar (Overview, Domains, Mailboxes, Routing, DNS, Logs, Import, Settings)
└── Main (PageHeader, filters, tables, wizards, toasts)
```

Brand wordmark: **mailwart** in Bricolage Grotesque ExtraLight 200. Light/dark via `next-themes` (already a dependency). Density: Operate mid-high; motion restrained.

---

## 12. Deployment (Dokploy)

- Build from repo `Dockerfile` (standalone Next).
- Compose services: `email-manager` + `roundcube` (existing).
- Traefik labels attach public host + `/webmail` path (deployment-specific hosts in compose/env).
- Shared Docker network with Stalwart for internal JMAP/IMAP.
- Secrets via Dokploy env — never git.

| Variable | Required | Notes |
|----------|----------|-------|
| `STALWART_JMAP_URL` | yes | In-cluster or public `/jmap` |
| `STALWART_ADMIN_USER` / `STALWART_ADMIN_PASSWORD` | yes | Server-only JMAP Basic Auth |
| `STALWART_ADMIN_UI_URL` | optional | Deep-link out |
| `ROUNDCUBE_URL` | yes | Public webmail base |
| `WEBMAIL_SSO_SECRET` | yes | ≥32 chars HMAC |
| `WEBMAIL_IMPERSONATOR_USER` / `PASSWORD` | recommended | Least-privilege impersonate |
| `APP_ADMIN_USER` / `APP_ADMIN_PASSWORD` | yes (prod) | Dashboard login |
| `SESSION_SECRET` | yes | iron-session seal |
| `DNS_EXPECTED_MX` | optional | DNS health rubric |
| `DNS_DKIM_SELECTORS` | optional | CSV selectors |

Phase 1: **document only; no redeploy; no git push.**

---

## 13. Security checklist

- [ ] Secrets only in env / Dokploy
- [ ] HttpOnly Secure SameSite session
- [ ] Server-only Stalwart Basic Auth construction
- [ ] Login rate limit
- [ ] SSO tokens short-lived + single-use nonce when feasible
- [ ] Impersonator principal least-privilege (`impersonate` only) when available
- [ ] No credentials in client bundles
- [ ] Audit log for destructive/directory mutations (Phase 4+)
- [ ] CSP when UI polish ships

---

## 14. Testing strategy (later)

| Layer | What |
|-------|------|
| Unit | JMAP parsers, email/DNS validators, CSV chunker |
| Integration | Stalwart Docker or staging throwaway domain |
| E2E | Login → create mailbox → list → SSO open |
| Manual | Catch-all, bulk partial failure, DNS amber states |

No mail-tester from this app.

---

## 15. Phase map

| Phase | Scope |
|-------|--------|
| **1 (this)** | Architecture + product spec + 3 review passes; foundation healthy; no feature UI push |
| **2** | Design system (mailwart brand), auth polish, theme, breadcrumbs, read views, DNS health |
| **3** | Mutations: mailboxes, quotas, app passwords, 2FA hooks, catch-all, forwarding/routing |
| **4** | Autoresponders/Sieve/spam controls, CSV bulk harden, delivery logs/audit |
| **5** | Analytics overview, polish, Dokploy production cutover readiness |

**Phase 1 success:** Next 16+ builds conceptually; docs exhaustive; review log has 3 passes; Roundcube/SSO/compose preserved; **no push**.

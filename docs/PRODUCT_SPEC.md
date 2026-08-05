# mailwart — Product Specification

> Companion to [ARCHITECTURE.md](./ARCHITECTURE.md).  
> Brand: **mailwart** (lowercase). Wordmark font: **Bricolage Grotesque ExtraLight 200**.  
> Mode: **Operate** for dashboard · **Persuade** for landing (Phase 2+).  
> Design dials (taste-skill, Operate): `DESIGN_VARIANCE: 4` · `MOTION_INTENSITY: 3` · `VISUAL_DENSITY: 6`

**Design read:** B2B mail-ops console for a technical operator managing Stalwart across one or more domains — Linear-adjacent density, editorial restraint, zero SaaS-landing tropes inside the dashboard. Deployment hostnames are config, not brand.

---

## 1. Problem

Stalwart + Roundcube already deliver mail. Day-to-day pain is **directory and policy ops**: mailboxes, quotas, catch-alls, forwarding, DNS health, bulk provisioning, and safe webmail entry — today split across dense Admin UI, ManageSieve, and one-off scripts. Operators need a focused cPanel-grade surface that speaks Stalwart JMAP and preserves Roundcube SSO.

---

## 2. Users

| Persona | Need |
|---------|------|
| **Primary — Operator** | Full directory/routing/DNS/bulk/audit control for the Stalwart instance |
| **Secondary — Helper** | Same tasks with audit clarity; no separate RBAC in v1 |
| **Out of scope** | End-users reading mail (Roundcube) |

---

## 3. Product principles

1. **Server truth is Stalwart.** UI never invents mailbox state.
2. **Full email addresses everywhere.** Multi-domain local-parts are ambiguous.
3. **Partial success is honest.** Bulk ops report per-row outcomes.
4. **Danger is labeled.** Policy, destroy, impersonation, catch-all clear.
5. **SSO is short-lived.** Signed tokens + server-only impersonation; no mailbox passwords in browser.
6. **Brand is mailwart.** Domains/hosts are deployment config.
7. **Minimum surface that still feels cPanel-complete.** Prefer depth on mailboxes/routing over decorative pages.

---

## 4. Information architecture

```
/                         Landing (Persuade — later)
/login                    App auth
/dashboard                Overview / analytics
/dashboard/domains
/dashboard/domains/[id]   Detail: catch-all, DNS health, enabled
/dashboard/mailboxes
/dashboard/mailboxes/[id] Password, quota, aliases, app passwords, 2FA, webmail
/dashboard/routing        Forwarding, aliases overview, catch-alls summary
/dashboard/filters        Autoresponders / Sieve / spam (or deep-links)
/dashboard/dns            Cross-domain DNS health
/dashboard/logs           Delivery / audit
/dashboard/import         CSV/JSON bulk wizard
/dashboard/settings       Session, URLs (host only), theme, danger zone
```

Breadcrumbs on all dashboard routes: `Dashboard › Section › Entity`.

No top-level `/aliases` — aliases live on mailbox detail + routing summary.

---

## 5. Feature specifications (Phases 2–5)

### 5.1 Overview & analytics (Phase 2 / 5)

**Job:** “Is mail admin healthy, and what is the shape of the directory?”

- Stalwart JMAP health (ok / latency / fail).
- Roundcube soft health (advisory).
- Counts: domains, mailboxes, catch-alls configured.
- Quota pressure: mailboxes near limit (when quotas present).
- Phase 5: simple time-window charts (creates, failures, SSO opens) from audit log — not marketing vanity metrics.
- Outbound links: Stalwart Admin UI URL from env (not hardcoded brand domains).

**Not on Overview:** mail-tester scores, queue depth (unless cheap read-only later).

### 5.2 Domains (Phase 2–3)

**List:** name, enabled, catch-all, mailbox count, DNS health pill, actions.

**Create:** name + description; minimal JMAP create then fallback defaults (see Architecture).

**Detail:**
- Edit description, `isEnabled`, sub-addressing when exposed.
- Catch-all: select existing mailbox on domain or clear (typed warn).
- DNS health panel (MX/SPF/DKIM/DMARC) with refresh.
- Destroy: typed domain name; block if accounts remain unless force + second confirm.

### 5.3 Mailboxes (Phase 2–3)

**List:** email, domain, quota summary, status, actions.

**Create:** domain select → local-part → password (generate) → optional quota → optional description.

**Detail:**
- Reset password (show once; never store plaintext client-side beyond that moment).
- Quota edit / clear to server default.
- Aliases editor after live shape probe.
- **App passwords:** list/create/revoke application-specific credentials when Stalwart supports them on the account object (or document deep-link to Admin if not).
- **2FA / TOTP:** enable/disable/status when Stalwart exposes it; otherwise status + Admin deep-link — do not fake UI.
- Open Roundcube via SSO.
- Delete: typed full email; block if catch-all target.

### 5.4 Catch-alls, forwarding, routing (Phase 3)

- Domain catch-all as first-class control.
- Forwarding rules: external or internal targets where Stalwart account/domain fields allow; otherwise Sieve-based forward via filters module.
- Routing summary page: catch-alls + high-signal aliases/forwards across domains.
- Validate targets exist (internal) or warn (external).

### 5.5 Autoresponders, Sieve, spam (Phase 4)

- Autoresponder: subject/body/dates when representable via ManageSieve or Stalwart; else “Open in Roundcube ManageSieve” with SSO.
- Sieve: list scripts / active flag if API allows; full editor may remain Roundcube.
- Spam: expose available Stalwart spam/policy toggles readably; no pretend Bayesian UI without API.

### 5.6 CSV bulk (Phase 3–4)

**Columns:** `email,password,description` (+ optional `quota`).

**Limits:** 2 MB / 5 000 rows max per job.

**Flow:** upload → validate → preview duplicates → create `jobId` → commit **one chunk per action** (25) with React Query watching job report → results + failure CSV download. Pause/abort allowed; no rollback of successes. Chunk `(jobId, chunkIndex)` idempotent.

**Modes:** create-only (skip existing) · create-or-reset-password (explicit opt-in).

**While bulk runs:** disable conflicting directory mutations in UI; honor Stalwart 429/503 backoff (Architecture §9.1).

### 5.7 DNS health (Phase 2+)

Per-domain and cross-domain matrix: MX, SPF, DKIM, DMARC with pass/warn/fail rubric (Architecture §10) and raw record snippets for copy. Env-tunable expectations: `DNS_EXPECTED_MX`, `DNS_DKIM_SELECTORS`. Banner: results reflect **server resolver view**. Advisory only — no DNS write UI in v1.

### 5.8 Delivery logs & audit (Phase 4–5)

- **Audit (mailwart):** who logged in; who created/deleted/reset which mailbox; bulk job summaries; SSO opens (mailbox id, not token).
- **Delivery (Stalwart):** read-only recent delivery/reject snippets if API or log adapter available; else deep-link to Admin + honest empty state.

### 5.9 Webmail SSO (existing — preserve)

Per-mailbox Open → short-lived token → Roundcube authenticated session. Copy-email still available. Errors never reveal impersonator secrets.

### 5.10 Theme, chrome, breadcrumbs (Phase 2)

- Light / dark toggle (`next-themes`); persist preference.
- **mailwart** wordmark (Bricolage Grotesque ExtraLight 200) in shell.
- Breadcrumbs on entity pages.
- Responsive Operate layout (sidebar collapse on small screens).

### 5.11 Settings (Phase 2+)

- Show configured Stalwart/Roundcube **hosts** (not full secrets).
- App login password change when using `APP_ADMIN_*`.
- Danger: authentication password policy (`x:Authentication`).
- Session logout-all (single node: destroy cookie).

### 5.12 Auth (app)

Login, session cookie, logout, rate limit. Unauthenticated users cannot reach `/dashboard/*`.

---

## 6. Component hierarchy (product view)

| Component | Job |
|-----------|-----|
| `AppShell` | Nav + breadcrumbs + theme + main landmark |
| `BrandMark` | mailwart wordmark |
| `HealthPill` | Stalwart / Roundcube status |
| `DnsHealthBadge` | Compact MX/SPF/DKIM/DMARC |
| `MailboxTable` | Primary working surface |
| `QuotaBar` | Compact meter |
| `PasswordField` | Generate / show once / copy |
| `AppPasswordPanel` | List/create/revoke |
| `CatchAllSelect` | Domain catch-all |
| `BulkImportWizard` | Upload → validate → commit → report |
| `ConfirmDestroy` | Typed confirm |
| `AuditTable` / `DeliveryTable` | Logs |
| `EmptyState` / `ErrorState` / `ToastRegion` | Recovery UX |

**Copy voice:** Active, specific.  
- “Stalwart did not respond within 15s. Retry.”  
- “No mailboxes in this domain. Create one.”  
- “Created user@example.com.”

---

## 7. Edge cases (acceptance)

| Scenario | Expected UX |
|----------|-------------|
| Stalwart timeout | Toast + inline retry; no infinite spinner |
| Stalwart 401 | “Mail server rejected admin credentials” |
| Bulk partial | Summary + download failed rows |
| Quota rejected | Row/field message from server reason |
| Catch-all → missing mailbox | Block save |
| Delete catch mailbox | Block until retarget/clear |
| SSO unavailable | Route error; no password fallback |
| Duplicate create | Clear conflict / skip in bulk |
| Admin account | Badge; destroy dual-confirm or disabled |
| DNS split-horizon | Warn that checks use server resolver view |
| DKIM multi-selector | Pass if any configured selector hits; warn if partial |
| Bulk proxy timeout | Chunked job survives; do not rely on one 60s request |
| Stalwart 429 mid-bulk | Backoff then resume chunk; surface waits in progress UI |
| SSO replay / expired | Plugin rejects; dashboard offers “Open again” |
| SSO as privileged admin | Dual-confirm or block |
| 2FA/app-password unsupported | Honest empty + Admin link |
| Theme | No flash of wrong theme on load (as practical) |

---

## 8. Deployment inventory (config, not brand)

Managed domains, public hosts, and Admin/Webmail URLs are **environment / Dokploy configuration**. Document them in deploy runbooks and `.env.example` placeholders (`https://mail.example.com`), not as mailwart product identity.

---

## 9. Success metrics

- Create mailbox + copy password in under 30 seconds.
- Bulk 50 accounts with clear failure report without SSH.
- Catch-all and DNS health visible without Stalwart Admin.
- SSO open works without mailbox password in browser Network tab.
- Zero Stalwart admin Basic Auth headers visible to the browser.

---

## 10. Explicit out of scope

- Reading/sending mail in-app  
- mail-tester / deliverability automation  
- Full DNS write/edit UI (v1)  
- Multi-operator RBAC / OIDC (v1) — architecture leaves seams  
- Mobile-native apps  
- Replacing Stalwart Admin for MTA/queue/IP allowlists  
- Renaming Docker service paths in Phase 1  

---

## 11. Phase plan

| Phase | Deliverable | Verify |
|-------|-------------|--------|
| **1** | Architecture + product + 3 review passes; foundation intact | Docs at `docs/*`; Next 16+; Roundcube/SSO/compose preserved; no push |
| **2** | mailwart brand chrome, theme, breadcrumbs, auth polish, read views, DNS health | Login; lists match Stalwart; DNS badges |
| **3** | Mutations, quotas, app passwords/2FA hooks, catch-all, forwarding/routing, CSV v1 | CRUD verified on staging/VPS |
| **4** | Filters/Sieve/spam, bulk harden, delivery/audit logs | Partial failure + audit rows |
| **5** | Analytics polish, a11y/CSP, Dokploy cutover readiness | Metrics + deploy checklist |

**Phase 1 complete:** docs + review log; ready for Phase 2 UI — **no deploy, no push, no mail-tester.**

---

## 12. Open questions (do not block Phase 1)

1. Exact live `quotas`, `aliases`, app-password, 2FA field shapes — probe in Phase 2–3.
2. Dashboard public hostname — deploy-time env.
3. Whether forwarding is native Stalwart fields vs Sieve-only on this build.
4. Audit storage: file/SQLite vs Stalwart-only — decide Phase 4 (prefer simplest that survives restart).

---

## 13. Source of truth

- [ARCHITECTURE.md](./ARCHITECTURE.md)
- [ARCHITECTURE_REVIEW_LOG.md](./ARCHITECTURE_REVIEW_LOG.md)
- Existing integration: `src/lib/stalwart/*`, `src/lib/webmail-sso.ts`, `roundcube/plugins/em_sso`
- Stalwart docs for Domain/Account objects; live JMAP probe before inventing field editors

# mailwart

**mailwart** is a cPanel-grade Stalwart Mail Server admin console — domains, mailboxes, routing, DNS health, bulk provisioning, audit, Roundcube SSO — with an embedded **AI Copilot** that drives the same Server Actions operators use in the UI.

| | |
|---|---|
| **Production** | **https://email.yehia.dev** |
| **Webmail (SSO)** | **https://email.yehia.dev/webmail/** |
| **Gitea** | https://git.yehia.dev/zzokm/mailwart |
| **GitHub** | https://github.com/zzokm/yehia-email-manager *(repo name kept)* |

> Docker service / folder may still say `email-manager` — that is historical pathing, not the brand.

---

## Highlights

### AI Copilot (embedded chatbot)

Right-hand panel on every `/dashboard/*` route (desktop shrinks the workspace; mobile uses a sheet). Copilot is **not** a second Stalwart client — it orchestrates the existing Server Action layer.

- **Multi-provider LLM catalog** (server-only keys): OpenAI, Anthropic, Google, Cerebras, Groq, Mistral, DeepSeek, Moonshot, Ollama, OpenRouter
- Streaming chat with tool-call cards and conversation history (persist / resume / clear)
- **Allowlisted tools** mapped 1:1 to mail ops: health/overview, domains (CRUD, DNS refresh, DKIM/DMARC), mailboxes (CRUD, quota, passwords, app passwords), routing (forwarding, aliases, catch-alls, MX), filters/autoresponders/spam, bulk CSV jobs (prepare/commit/pause/abort), delivery + audit logs, in-app navigation, operator clarification prompts
- **Destructive approval gate** — high-risk tools require explicit operator approval before Stalwart side effects
- Loop caps, rate limits, and payload sanitization so secrets never land in the browser

### Hosted mail admin

Live at **https://email.yehia.dev** (Dokploy + Traefik + Let's Encrypt). Roundcube at `/webmail` with signed-token SSO via Stalwart impersonation — mailbox passwords never appear in the browser Network tab.

---

## Feature list

### Auth & shell
- App login with session cookie, logout, rate limiting
- Light / dark theme (`next-themes`), breadcrumbs, responsive Operate layout
- **mailwart** wordmark (Bricolage Grotesque ExtraLight 200)

### Overview & health
- Stalwart JMAP health (ok / latency / fail)
- Roundcube soft health (advisory)
- Directory counts: domains, mailboxes, catch-alls
- Quota pressure when quotas are present

### Domains & DNS
- List / create / update / suspend / destroy domains
- Catch-all: bind to an existing mailbox on the domain or clear
- DNS health matrix: **MX / SPF / DKIM / DMARC** (pass / warn / fail) with raw snippets
- Generate DKIM / DMARC guidance; env-tunable expected MX and DKIM selectors
- Advisory only — no DNS write UI in v1

### Mailboxes
- Full-address identity (multi-domain safe)
- Create with generated password, optional quota / description
- Reset password (show once), edit quota, aliases editor
- App passwords: list / create / revoke when Stalwart exposes them (probe-or-deep-link)
- 2FA / TOTP: same probe-or-deep-link honesty
- Open Roundcube via short-lived SSO token
- Typed confirm on destroy; block if mailbox is a catch-all target

### Routing & forwarding
- Domain catch-alls as first-class control
- Forwarding rules (internal / external where Stalwart allows)
- Aliases on mailbox detail + routing overview
- Mail exchanger updates where supported

### Filters, autoresponders, spam
- Autoresponder upsert / destroy
- Filter rules upsert / destroy
- Spam / policy toggles when Stalwart exposes them
- Honest empty states + Admin deep-links when APIs are absent

### Bulk CSV / jobs
- Upload → validate → preview → chunked commit (idempotent `(jobId, chunkIndex)`)
- Modes: create-only or create-or-reset-password
- Pause / resume / abort; partial-success reports + failure CSV download
- Bulk destroy / reset passwords / suspend mailboxes
- UI disables conflicting mutations while a job runs; backs off on Stalwart 429/503

### Logs & audit
- **mailwart audit** (JSONL volume): logins, mailbox CRUD/resets, bulk summaries, SSO opens
- **Delivery logs** from Stalwart when available; otherwise Admin deep-link

### Webmail SSO
- Per-mailbox Open → signed short-lived token → Roundcube `em_sso` plugin
- Uses Stalwart impersonation server-side; no password fallback in the browser

### Settings
- Configured Stalwart / Roundcube hosts (not secrets)
- App admin password change
- Copilot provider status (configured/missing, model, key last-4 mask only)
- Danger zone (auth policy, session logout)

### Deployment
- Next.js standalone Docker image + Roundcube sidecar
- Compose: `email-manager` + Roundcube at `/webmail`, volume `mailwart_audit`
- Dokploy auto-deploy from GitHub `zzokm/yehia-email-manager` `main`
- Product / architecture: `docs/PRODUCT_SPEC.md`, `docs/ARCHITECTURE.md`

---

## Local development

```bash
cp .env.example .env.local
# STALWART_*, APP_ADMIN_*, SESSION_SECRET, webmail SSO secrets, optional COPILOT_* keys
npm install
npm run dev
```

## Production

- Dashboard: https://email.yehia.dev
- Webmail: https://email.yehia.dev/webmail/
- Deploy runbook (parent VPS workspace): `docs/mail/email-manager-deploy.md`

## Security notes

- Server truth is Stalwart; UI never invents mailbox state
- Copilot API keys are server-only — never `NEXT_PUBLIC_*` or localStorage
- Do not commit Gitea/MySQL/admin secrets into this repository

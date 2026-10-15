# mailwart 📬

[![License: AGPL-3.0](https://img.shields.io/badge/License-AGPL%20v3-blue.svg)](https://www.gnu.org/licenses/agpl-3.0)
[![Next.js](https://img.shields.io/badge/Next.js-15-black.svg)](https://nextjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-blue.svg)](https://www.typescriptlang.org/)
[![Stalwart](https://img.shields.io/badge/Powered%20By-Stalwart%20Mail%20Server-orange.svg)](https://stalw.art/)
[![Roundcube](https://img.shields.io/badge/Webmail-Roundcube-green.svg)](https://roundcube.net/)

**mailwart** is an open-source, cPanel-grade administration console and deliverability control plane for [Stalwart Mail Server](https://stalw.art/) and [Roundcube Webmail](https://roundcube.net/).

Equipped with an **embedded AI Copilot**, **1-Click Cloudflare DNS Sync**, a **full 10-point Deliverability Audit Engine**, and **Zero-Password Webmail SSO**, mailwart makes running a modern, self-hosted, sovereign mail infrastructure enjoyable and production-ready.

| Resource | URL |
|---|---|
| **Live Production Console** | [https://email.yehia.dev](https://email.yehia.dev) |
| **Webmail (Signed SSO)** | [https://email.yehia.dev/webmail/](https://email.yehia.dev/webmail/) |
| **Source Code** | [https://github.com/zzokm/yehia-email-manager](https://github.com/zzokm/yehia-email-manager) |

---

## 🌟 Key Features

### 🛡️ 10-Point Deliverability Suite & Egress Engine
- **Automated Score & Letter Grade (A+ through F)** across every hosted domain.
- **Comprehensive DNS Audit**: Validates MX, SPF, dual DKIM (RSA + Ed25519 dual-key verification), DMARC policies, and PTR (Reverse DNS pointer).
- **Anti-Spam Blacklist Probing (DNSBL)**: Checks IP reputation live against major anti-spam lists (Spamhaus, Barracuda, SpamCop).
- **Automated Inbound & Outbound Loopback Testing**: Spins up an ephemeral test mailbox, signs an outbound test message with TLSv1.3 / STARTTLS, verifies queue acceptance, confirms IMAP delivery, and cleans up automatically.
- **Active Internet Egress Probe**: Actively probes external mail exchangers (`gmail-smtp-in.l.google.com:25`, `reception.mail-tester.com:25`) and external relays. If your VPS hosting provider blocks outbound Port 25, the system immediately drops the score to **0/10 Grade F** and displays actionable remediation steps.
- **1-Click Deliverability Tester**: Send test verification codes and sample payloads to external mailboxes or [mail-tester.com](https://www.mail-tester.com/) directly from the console.

### ☁️ Cloudflare 1-Click DNS Sync
- **Automatic Zone Detection**: Detects whether a domain's nameservers point to Cloudflare.
- **Instant Record Provisioning**: Automatically generates and pushes standard MX, SPF, DKIM public keys (RSA 2048 & Ed25519), and DMARC enforcement records straight into Cloudflare via the Cloudflare API with a single click.

### 🤖 AI Copilot (Built-in Mail Ops Chatbot)
- Embedded right-hand slide-over assistant on every `/dashboard/*` route.
- **Multi-LLM Catalog**: Works with OpenAI, Anthropic Claude, Google Gemini, Cerebras, Groq, Mistral, DeepSeek, Ollama, and OpenRouter.
- **Direct Server Action Orchestration**: The AI does not bypass security; it invokes allowlisted server actions with typed arguments.
- **Destructive Approval Gates**: High-risk operations (deleting domains, resetting passwords, destroying mailboxes) require explicit human confirmation in the UI before execution.

### 👥 Domain & Mailbox Administration
- Multi-domain support with active/suspended states.
- Complete mailbox lifecycle: secure random password generation, quota configuration, aliases, and forwarders.
- **Domain Catch-All Routing**: Route all unmatched inbound emails to a designated mailbox with one click.
- **1-Click System Noreply Mailbox**: Easily provision a dedicated `noreply@` mailbox for automated transactional emails and migrate it between domains seamlessly.
- App Passwords and 2FA/TOTP management interfaces.

### 📦 Bulk CSV Provisioning
- High-throughput CSV uploads with client validation, chunked commits, idempotency tracking, and progress reporting.
- Pause, resume, and abort capabilities with detailed failure reports and CSV downloads.

### 🔐 Zero-Password Webmail SSO (Roundcube)
- Open Roundcube webmail directly from any mailbox card.
- Authenticates via HMAC-SHA256 signed, short-lived tokens through the `em_sso` Roundcube plugin—mailbox passwords are never exposed in browser URLs, local storage, or network payloads.

### 📜 Structured Audit Logs & Telemetry
- Persistent JSONL audit logging tracking logins, password changes, mailbox CRUD, and SSO requests.
- Real-time Stalwart JMAP health and queue telemetry.

---

## 🏗️ Architecture

```
                       ┌───────────────────────────────┐
                       │          mailwart UI          │
                       │   Next.js 15 App Router       │
                       │   (Tailwind, React 19, Auth)  │
                       └───────┬───────────────┬───────┘
                               │               │
                     REST/JMAP │               │ Cloudflare API
                               ▼               ▼
        ┌─────────────────────────────┐   ┌───────────────────────────┐
        │    Stalwart Mail Server     │   │      Cloudflare DNS       │
        │   (SMTP, IMAP, JMAP, MTA)   │   │ (Auto SPF/DKIM/DMARC/MX)  │
        └──────────────┬──────────────┘   └───────────────────────────┘
                       │
             IMAP/SSL  │ Signed Token SSO
                       ▼
        ┌─────────────────────────────┐
        │     Roundcube Webmail       │
        │       (em_sso plugin)       │
        └─────────────────────────────┘
```

---

## 🚀 Quickstart & Local Development

### 1. Clone the repository
```bash
git clone https://github.com/zzokm/yehia-email-manager.git mailwart
cd mailwart
```

### 2. Configure Environment Variables
Copy the template and fill in your Stalwart and session secrets:
```bash
cp .env.example .env.local
```

Key variables:
```dotenv
# App Security
SESSION_SECRET=your-secure-random-session-secret-at-least-32-chars
APP_ADMIN_USERNAME=admin
APP_ADMIN_PASSWORD=your-secure-admin-password

# Stalwart Mail Server
STALWART_API_URL=https://mail.yourdomain.com
STALWART_API_USER=admin
STALWART_API_PASS=your-stalwart-admin-password
STALWART_PUBLIC_FQDN=mail.yourdomain.com

# Webmail SSO
ROUNDCUBE_SSO_SECRET=your-roundcube-hmac-shared-secret
ROUNDCUBE_URL=https://email.yourdomain.com/webmail/

# Optional: Cloudflare 1-Click DNS Sync
CLOUDFLARE_API_TOKEN=your-cloudflare-api-token

# Optional: AI Copilot Providers (Server-Side Only)
OPENAI_API_KEY=
ANTHROPIC_API_KEY=
GOOGLE_GENERATIVE_AI_API_KEY=
GROQ_API_KEY=
```

### 3. Install & Run
```bash
npm install
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) to view the dashboard.

---

## 🐳 Docker Deployment

mailwart includes a production multi-stage `Dockerfile`:

```bash
# Build the production Docker image
docker build -t mailwart:latest .

# Run container
docker run -d \
  --name mailwart \
  -p 3000:3000 \
  --env-file .env.local \
  -v mailwart-audit:/app/data \
  mailwart:latest
```

Or deploy alongside Roundcube and Stalwart using Docker Compose or Dokploy (see `docs/ARCHITECTURE.md` for full stack definitions).

---

## 🧪 Testing & CI

mailwart enforces strict code quality and security standards:

```bash
# Run security audit
npm run audit

# TypeScript typecheck
npm run typecheck

# ESLint strict check (zero warnings permitted)
npm run lint -- --max-warnings=0

# Vitest unit and integration test suite
npm test

# Full CI check
npm run ci
```

---

## 📄 License & Open-Source Harmony

mailwart is licensed under the **[GNU Affero General Public License v3.0 (AGPL-3.0)](LICENSE)**.

### Why AGPL-3.0?
mailwart is built to accompany and orchestrate two outstanding open-source projects:
1. **[Stalwart Mail Server](https://github.com/stalwartlabs/mail-server)** — licensed under **AGPL-3.0**.
2. **[Roundcube Webmail](https://github.com/roundcube/roundcubemail)** — licensed under **GPL-3.0-or-later**.

By choosing AGPL-3.0:
- **Full Legal & Architectural Harmony**: Mailwart adheres to the same copyleft principles as Stalwart Mail Server, ensuring seamless compatibility under Section 13 of GPLv3.
- **Protecting the Community**: If anyone modifies mailwart and offers it as a network service or cloud control plane, they are required to share their source code with the community, preventing proprietary lock-in.

---

## 🤝 Acknowledgments

- **[Stalwart Labs](https://stalw.art/)** for creating the modern, memory-safe Rust mail server.
- **[Roundcube](https://roundcube.net/)** for the reliable open-source webmail interface.
- Built with [Next.js](https://nextjs.org/), [Tailwind CSS](https://tailwindcss.com/), and [Lucide Icons](https://lucide.dev/).

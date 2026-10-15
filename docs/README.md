# mailwart — Technical Documentation

Welcome to the comprehensive technical documentation for **mailwart**, a modern, cPanel-grade Stalwart Mail Server & Roundcube Webmail management console with an integrated AI Copilot.

mailwart is built with **Next.js 16 (App Router)**, **React 19**, **Tailwind CSS v4**, **TypeScript**, and **PostgreSQL**, deployed via **Docker Compose** behind **Traefik** in Dokploy.

---

## Documentation Structure

This documentation directory is organized into modular guides covering every layer of the system:

| Document | Title | Description |
| :--- | :--- | :--- |
| **[01_ARCHITECTURE.md](./01_ARCHITECTURE.md)** | **System Architecture & Infrastructure** | Complete topology, container networking, runtime isolation, data flow lifecycles, and mock vs. live dual runtime engine. |
| **[02_PAGES_AND_ROUTES.md](./02_PAGES_AND_ROUTES.md)** | **Frontend Pages, Navigation & UX** | Exhaustive mapping of all 11 UI pages, AppShell chrome, navigation sidebar, modals, wizards, and interactive components. |
| **[03_API_REFERENCE.md](./03_API_REFERENCE.md)** | **HTTP API Endpoints** | Specifications for all Next.js API route handlers (`/api/auth`, `/api/copilot`, `/api/deliverability`, `/api/diagnostics`, `/api/webmail/sso`, etc.). |
| **[04_SERVER_ACTIONS.md](./04_SERVER_ACTIONS.md)** | **Server Actions Catalog** | In-depth technical catalog of all 80+ server actions across mail, users, Cloudflare, copilot, deliverability, and auth. |
| **[05_STALWART_INTEGRATION.md](./05_STALWART_INTEGRATION.md)** | **Stalwart Mail Server Integration** | JMAP protocol specification, method calls, data normalization, catch-all handling, app passwords, and mock engine. |
| **[06_ROUNDCUBE_SSO.md](./06_ROUNDCUBE_SSO.md)** | **Roundcube Webmail & SSO** | Custom `em_sso` PHP plugin, HMAC SHA-256 token minting, master impersonation protocol (`user%impersonator`), and Traefik routing. |
| **[07_CLOUDFLARE_AUTOMATION.md](./07_CLOUDFLARE_AUTOMATION.md)** | **Cloudflare DNS Automation** | Multi-account token pooling, automated zone discovery, 1-click DNS record provisioning (MX, SPF, DKIM, DMARC), and conflict detection. |
| **[08_DELIVERABILITY_SUITE.md](./08_DELIVERABILITY_SUITE.md)** | **Email Deliverability Suite** | 10-point deliverability audit engine, port & TLS probes, DNSBL blacklist monitoring, SMTP banner & EHLO checks, and mail-tester scoring. |
| **[09_AI_COPILOT.md](./09_AI_COPILOT.md)** | **AI Copilot & Tool Registry** | Architecture with Vercel AI SDK, 10 supported LLM providers, 48 registered administrative tools, and human-in-the-loop approval workflows. |
| **[10_DATABASE_AND_SECURITY.md](./10_DATABASE_AND_SECURITY.md)** | **Database, Security & Deployment** | PostgreSQL 12-table schema, iron-session encryption, RBAC, operator impersonation, OTP recovery, audit logging, and Dokploy deployment. |

---

## High-Level System Architecture

```
                                  HTTPS (Port 443)
                                          │
                                          ▼
                            ┌───────────────────────────┐
                            │      Traefik Ingress      │
                            │  (Dokploy Reverse Proxy)  │
                            └─────────────┬─────────────┘
                                          │
            ┌─────────────────────────────┼─────────────────────────────┐
            │                             │                             │
    Host: email.domain.com        Path: /webmail                Direct Webmail
            │                             │               webmail.* / mail.*
            ▼                             ▼                             ▼
┌───────────────────────┐     ┌───────────────────────┐                 │
│     email-manager     │     │  Roundcube Container  │ ◄───────────────┘
│   (Next.js 16 App)    │     │    (PHP 8 + Apache)   │
│  - React Server Comp. │     │  - Elastic Skin       │
│  - Server Actions     │     │  - em_sso Plugin      │
│  - Copilot Engine     │     │  - ManageSieve        │
└───────────┬───────────┘     └───────────┬───────────┘
            │                             │
            │ JMAP (Port 8080)            │ IMAP (993) / SMTP (587)
            │ Basic Auth + JSON           │ Master Impersonation (user%admin)
            ▼                             ▼
┌─────────────────────────────────────────────────────┐
│                 Stalwart Mail Server                │
│    Directory, MTA, IMAP, SMTP, Sieve, JMAP Server   │
└─────────────────────────────────────────────────────┘
            │
            │ PostgreSQL Connection
            ▼
┌───────────────────────┐
│   mailwart-postgres   │
│   (PostgreSQL 16)     │
│  - Users & RBAC       │
│  - Audit Logs         │
│  - Delivery Logs      │
│  - Copilot History    │
│  - System Settings    │
└───────────────────────┘
```

---

## Core Product Principles

1. **Stalwart is the Source of Truth:** Mailbox existence, domain states, catch-all configurations, and email routing are always verified against Stalwart JMAP. The local PostgreSQL database mirrors directory state to power RBAC domain ownership and cached analytics without desynchronizing from the server.
2. **Zero Plaintext Mailbox Passwords in Browser:** User mailbox passwords are generated or reset in single-flight operations. When opening webmail, administrators never enter or view the mailbox password—short-lived signed HMAC tokens and Stalwart SASL PLAIN master impersonation handle authentication transparently.
3. **Graceful Fallback & Mock Runtime:** If Stalwart or PostgreSQL credentials are unset (e.g. during local frontend development or automated testing), the application boots cleanly in `mock` mode with a stateful in-memory directory store.
4. **Strict Isolation & Safe Operations:** Destructive actions (deleting domains, removing mailboxes, mass password resets) require explicit typed confirmations or operator approval modals in the AI Copilot.

---

## Quick Reference Commands

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Run type check
npm run typecheck

# Run linter
npm run lint

# Run test suite (Vitest)
npm test

# Build production bundle
npm run build
```

# 02 — Frontend Pages, Navigation & UX Workflows

## 1. Overview & Navigation System

**mailwart** adopts the **Operate** design aesthetic: dense, information-rich, and engineered for high-throughput technical operators. The application is organized under Next.js App Router route groups:
- `(auth)`: Public authentication screens (`/login`).
- `(dashboard)`: Authenticated administrative console (`/dashboard/*`).
- Root (`/`): Public landing page with product capabilities and operator sign-in.

---

## 2. AppShell Chrome (`src/components/layout/app-shell.tsx`)

Every route under `/dashboard/*` is wrapped by `AppShell`, providing persistent layout chrome:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ Exit Impersonation Banner (Visible only when administrator impersonates a user) │
├──────────────┬──────────────────────────────────────────────────────────────┤
│              │ [Toggle]  Breadcrumbs: Dashboard › Domains › example.com    │
│              │ [JMAP Health Pill]  [Webmail Health Pill]  [Theme]  [Copilot]│
│  Navigation  ├──────────────────────────────────────────────────────────────┤
│   Sidebar    │                                                              │
│              │                                                              │
│  - Overview  │                                                              │
│  - Domains   │                     Page Main Content Area                   │
│  - Mailboxes │                                                              │
│  - Routing   │                                                              │
│  - Filters   │                                                              │
│  - Bulk CSV  │                                                              │
│  - Logs      │                                                              │
│  - Settings  │                                                              │
│              ├──────────────────────────────────────────────────────────────┤
│  [Sign out]  │ Copilot Slide-out Rail (Desktop: right dock; Mobile: sheet)  │
└──────────────┴──────────────────────────────────────────────────────────────┘
```

### Components in AppShell:
1. **Collapsible Sidebar (`Sidebar`):**
   - Collapsible between full drawer and icon-only rail.
   - Highlights active route with exact matching for `/dashboard` and prefix matching for sub-resources.
   - User identity indicator with role badge (`admin` or `user`).
2. **Header Breadcrumbs (`HeaderBreadcrumbs`):**
   - Automatically tracks routing segments (e.g., `Dashboard › Mailboxes › ops@example.com`).
   - Identifiers (domain names, email addresses) render in monospace styling (`font-mono`).
3. **Health Status Pills (`HealthPill`):**
   - **JMAP Health Pill:** Displays Stalwart connection status (`ok`, `latency: 42ms`, or `fail`) with green/yellow/red pulse indicators.
   - **Webmail Health Pill:** Verifies Roundcube reachability and SSO readiness.
4. **Theme Toggle (`ThemeToggle`):**
   - Toggles light, dark, and system themes via `next-themes` (`src/app/globals.css`).
5. **Copilot Toggle (`CopilotToggleButton`):**
   - Slides open the integrated AI Copilot panel on the right desktop rail or a mobile sheet.
6. **Impersonation Bar (`ExitImpersonationButton`):**
   - When an administrator impersonates a regular user, a prominent amber top banner warns that an impersonation session is active, with a one-click "Exit Impersonation" action.

---

## 3. Detailed Page Directory

### 3.1 Public Landing (`/`)
- **File:** `src/app/page.tsx` &rarr; `src/components/landing/landing-page.tsx`
- **Purpose:** Informational landing page for the mailwart instance.
- **Sections:**
  - **Split Hero:** Brand headline, live instance status summary, primary call-to-action button: *Secure Admin Login*.
  - **Capabilities Bento (6 cells):** Visual cards highlighting Stalwart JMAP directory management, Roundcube zero-password SSO, Cloudflare DNS automation, Sieve filters & catch-alls, chunked bulk CSV provisioning, and AI Copilot.
  - **Step Stack:** Visual diagram explaining the 3-step provisioning workflow.
  - **Zone Sheet:** Real-time preview of zone file generation (MX, SPF, DKIM, DMARC).
  - **Access Panel:** Direct operator entry point leading to `/login`.

---

### 3.2 Authentication (`/login`)
- **File:** `src/app/(auth)/login/page.tsx` &rarr; `src/components/auth/login-form.tsx`
- **Purpose:** Operator authentication into the console.
- **Key Features:**
  - **Credentials Form:** Validates username and password via `loginAction`.
  - **Redirect Protection:** If already authenticated, automatically redirects to `/dashboard` (or the `?from=` parameter).
  - **Forgot Password Modal:** Triggers a 3-step OTP recovery flow:
    1. Enter account email.
    2. Receive 6-digit OTP code (sent via outbound system SMTP).
    3. Enter OTP code and set new password.
  - **Rate Limiting:** Protects against brute-force attacks via sliding-window IP/username limits.

---

### 3.3 Dashboard Overview (`/dashboard`)
- **File:** `src/app/(dashboard)/dashboard/page.tsx`
- **Purpose:** High-level operational overview of Stalwart health and directory metrics.
- **Components & Metrics:**
  - **Metric Strips:**
    - **Domains:** Total configured domains and count of active domains.
    - **Mailboxes:** Total active accounts and count of mailboxes with quotas.
    - **Catch-alls:** Number of domains with catch-all routing enabled.
    - **Storage Used:** Total disk usage vs. allocated storage quota formatted in human-readable bytes (e.g. `1.24 GB / 10 GB`).
  - **Storage Meter (`StorageMeter`):** Visual progress bar showing directory storage utilization.
  - **System Health Panel (`SystemHealthPanel`):** Reports JMAP latency, webmail reachability, and memory metrics.
  - **Recent Domains List:** Quick table of top domains with status badges and mailbox counts.
  - **Quick Action Buttons:** Direct shortcuts to Create Mailbox, Add Domain, Bulk Import, and Stalwart Admin.

---

### 3.4 Domains Directory (`/dashboard/domains`)
- **File:** `src/app/(dashboard)/dashboard/domains/page.tsx` & `src/components/mail/domains-table-client.tsx`
- **Purpose:** List, search, filter, and create Stalwart domains.
- **Features:**
  - **Search & Filter:** Instant client-side search across domain names and descriptions.
  - **Status Indicators:** Enabled/disabled toggle and DNS health pill (`pass`, `warn`, `fail`, `propagating`).
  - **Create Domain Dialog (`CreateDomainDialog`):**
    - Modal form accepting domain name (e.g., `example.com`) and optional description.
    - Optional Cloudflare DNS auto-provision checkbox to immediately create DNS records.
    - Commits via `createDomainAction`.

---

### 3.5 Domain Detail (`/dashboard/domains/[id]`)
- **File:** `src/app/(dashboard)/dashboard/domains/[id]/page.tsx` & `src/components/mail/domain-detail-client.tsx`
- **Purpose:** Comprehensive domain settings, catch-all policy, DNS records, and deletion.
- **Sections:**
  1. **General Settings:**
     - Toggle domain enabled/disabled (`isEnabled`).
     - Edit domain description and sub-addressing delimiter (e.g., `+`).
  2. **Catch-All Routing:**
     - Select how unknown recipients are handled: Forward to existing mailbox, Reject (Bounce), or Drop (Blackhole).
     - Dedicated helper creates a `catch@domain` mailbox if none exists.
  3. **Mail Exchanger Posture (`MailExchangerMode`):**
     - Local Exchanger (`allowRelaying: false`), Backup Exchanger (`allowRelaying: true`), or Remote Exchanger.
  4. **DNS Health & Record Generator (`DnsHealthPanel` & `DnsRecordGenerator`):**
     - Live DNS query checking MX, SPF, DKIM, and DMARC against public recursive resolvers.
     - 1-click copy for required DNS records (Type, Name, Value, Priority).
     - 1-click **Provision to Cloudflare** button if Cloudflare is linked.
  5. **Danger Zone (`ConfirmDestroyDialog`):**
     - Domain deletion requires typing the exact domain name.
     - Blocks deletion if active mailboxes remain unless explicit override is provided.

---

### 3.6 Mailboxes Directory (`/dashboard/mailboxes`)
- **File:** `src/app/(dashboard)/dashboard/mailboxes/page.tsx` & `src/components/mail/mailbox-table.tsx`
- **Purpose:** Directory of all email accounts across all or selected domains.
- **Features:**
  - **Domain Filter Dropdown:** Filter accounts by domain (e.g. `?domain=dom_123`).
  - **Datatable:** Columns for full email address, domain badge, storage quota progress bar, status (active/suspended), and action dropdown.
  - **Bulk Selection & Actions:**
    - Select multiple mailboxes via checkboxes.
    - Bulk Suspend / Activate.
    - Bulk Reset Passwords (generates secure passwords with CSV export).
    - Bulk Delete with confirmation dialog.
  - **Create Mailbox Dialog (`CreateMailboxDialog`):**
    - Domain dropdown, local-part input, password generator with strength meter, optional quota in MB/GB, and name/description.
    - Commits via `createMailboxAction`.

---

### 3.7 Mailbox Detail (`/dashboard/mailboxes/[id]`)
- **File:** `src/app/(dashboard)/dashboard/mailboxes/[id]/page.tsx` & `src/components/mail/mailbox-detail-client.tsx`
- **Purpose:** Manage an individual email account's credentials, quotas, and security.
- **Features:**
  1. **One-Click Webmail Launch (`RoundcubeButton`):** Mints a short-lived HMAC SSO token and opens Roundcube directly into the mailbox.
  2. **Password Reset Card:** Generate or enter a new password. Copies to clipboard with one click. Plaintext is never stored.
  3. **Quota Manager:** Set custom storage quotas in MB/GB or leave unlimited (server default).
  4. **Account Suspension:** Suspend or reactivate login and message delivery.
  5. **Email Aliases Panel (`AliasesPanel`):** Add/remove alternate local-parts that route into this mailbox (e.g. `billing@domain` &rarr; `admin@domain`).
  6. **App Passwords Panel (`AppPasswordPanel`):** Generate and revoke dedicated application passwords for IMAP/SMTP clients (Thunderbird, Apple Mail, Outlook).
  7. **Two-Factor Authentication Status (`TwoFactorStatus`):** Displays Stalwart TOTP status and instructions for configuring 2FA in Roundcube.
  8. **Forwarding Rules Display:** Displays active email forwarders sending mail out of this mailbox.

---

### 3.8 Routing & Forwarding (`/dashboard/routing`)
- **File:** `src/app/(dashboard)/dashboard/routing/page.tsx` & `src/components/mail/routing-client.tsx`
- **Purpose:** Centralized management of email forwarders, aliases, and catch-alls.
- **Sections:**
  - **Catch-All Summary Table:** Overview of all domains and their configured fallback destinations.
  - **Mailbox Aliases Table:** Cross-domain view of all registered aliases and destination mailboxes.
  - **Forwarding Rules Manager:**
    - Create user-level forwarders (`source@domain` &rarr; `dest1@other.com, dest2@other.com`).
    - Create domain-level forwarders (`*@domain` &rarr; `target-domain.com`).
    - **Keep Local Copy:** Toggle whether the original mailbox retains a copy of forwarded messages.
    - Target address validation preventing mail loops.

---

### 3.9 Filters & Sieve Rules (`/dashboard/filters`)
- **File:** `src/app/(dashboard)/dashboard/filters/page.tsx` & `src/components/mail/filters-client.tsx`
- **Purpose:** Vacation autoresponders, server-side Sieve filtering, and spam thresholds.
- **Sections:**
  - **Vacation Autoresponders:** Configure out-of-office replies per mailbox with optional start and end date ranges, custom subject, and message body.
  - **Sieve Filter Rules:** Define server-side incoming message sorting rules based on headers (From, Subject, Size) with actions: Move to Folder, Mark as Read, or Discard.
  - **Spam Posture:** Inspect and adjust spam filtering sensitivity (Spam score threshold, discard vs. Junk folder placement).

---

### 3.10 Bulk CSV Import (`/dashboard/import`)
- **File:** `src/app/(dashboard)/dashboard/import/page.tsx` & `src/components/mail/bulk-import-wizard.tsx`
- **Purpose:** Provision hundreds of mailboxes or forwarders via CSV uploads.
- **Wizard Steps:**
  1. **Template & Upload:** Download standardized CSV templates for mailboxes or forwarders. Drag-and-drop CSV file.
  2. **Validation & Preview:** Client-side and server-side validation against schema rules. Flags duplicate rows, missing domains, or invalid quotas.
  3. **Chunked Execution:** Runs import in batches of 25 rows per Server Action request to prevent reverse proxy timeouts.
  4. **Job Controls:** Pause, resume, or abort running jobs with live progress bar and downloadable outcome report.

---

### 3.11 System & Delivery Logs (`/dashboard/logs`)
- **File:** `src/app/(dashboard)/dashboard/logs/page.tsx` & `src/components/mail/logs-client.tsx`
- **Purpose:** Monitor live email delivery and audit administrative changes.
- **Tabs:**
  - **SMTP Delivery Traces:** Real-time log of outbound and inbound message delivery attempts, recipient status (`delivered`, `bounced`, `queued`), latency, and queue IDs.
  - **Console Audit Trail:** Immutable log of all changes made in mailwart (actor, action, target, timestamp, and metadata payload).

---

### 3.12 Settings Console (`/dashboard/settings`)
- **File:** `src/app/(dashboard)/dashboard/settings/page.tsx` & `src/components/mail/settings-client.tsx`
- **Purpose:** Centralized administrative settings split across 6 tabs.
- **Tabs:**
  1. **Deliverability Suite:** Run full 10-point deliverability checks, review blacklist results, inspect port connectivity, and view overall score.
  2. **DNS Automation:** Manage linked Cloudflare API tokens, review discovered zones, run DNS conflict audits, and propagate records.
  3. **AI Copilot:** Select active LLM provider (OpenAI, Anthropic, Google, Groq, Ollama, etc.), configure model IDs, and set API keys.
  4. **Users & Access:** Create and manage console user accounts, assign domain ownership, reset passwords, and trigger admin impersonation.
  5. **System & Endpoints:** View service URLs (Stalwart Admin, JMAP host, Roundcube), configure outbound SMTP for system notifications, and view Danger Zone.
  6. **Account Profile:** View current operator identity, role, and execute OTP-secured password updates.

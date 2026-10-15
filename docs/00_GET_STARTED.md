# Getting Started with mailwart

This guide walks you through setting up **mailwart** from scratch, configuring your email server credentials, provisioning your first domain, creating user mailboxes, and launching Roundcube Webmail with zero-password single sign-on.

---

## 1. Prerequisites

Before running mailwart, ensure your host environment meets the following requirements:

| Component | Minimum Version | Notes |
| :--- | :--- | :--- |
| **Node.js** | `>= 20.x` (Recommended: 22 LTS) | Required for local development. |
| **npm** / **pnpm** | `>= 10.x` | Package manager. |
| **Docker & Docker Compose** | `>= 24.x` / Compose v2 | Required for containerized deployment. |
| **Stalwart Mail Server** | `>= 0.16.x` | Running in cluster or reachable via HTTPS. |
| **PostgreSQL** | `>= 15.x` (Included in Compose) | Database store for users, RBAC, and audit logs. |

---

## 2. Quick Local Development Setup

To explore mailwart on your local machine:

### Step 1: Clone the Repository
```bash
git clone https://github.com/zzokm/mailwart.git
cd mailwart
```

### Step 2: Install Dependencies
```bash
npm install
```

### Step 3: Configure Environment
Copy the example environment template:
```bash
cp .env.example .env.local
```

For immediate local exploration, you can run mailwart in **Mock Mode** without configuring live Stalwart or PostgreSQL credentials. If you have live credentials, populate `.env.local`:

```env
# Required for live console authentication
APP_ADMIN_USER=yehia
APP_ADMIN_PASSWORD=YourSecurePassword123!
SESSION_SECRET=make_sure_this_is_at_least_32_random_characters_long

# Stalwart JMAP Connection
STALWART_JMAP_URL=https://mail.example.com/jmap
STALWART_ADMIN_USER=admin@example.com
STALWART_ADMIN_PASSWORD=YourStalwartAdminPassword

# Roundcube Webmail SSO
ROUNDCUBE_URL=https://mail.example.com/webmail/
WEBMAIL_SSO_SECRET=another_random_32_character_secret_key
```

### Step 4: Start Development Server
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) in your browser. You will be greeted by the public landing page.

---

## 3. Provisioning Your First Domain

Once signed in to `/dashboard`:

1. Navigate to **Domains** in the left sidebar or press `/dashboard/domains`.
2. Click **Add Domain** (`+`).
3. Enter the fully qualified domain name (e.g. `example.com`).
4. *(Optional)* Add a description for internal documentation.
5. *(Optional)* If you have linked a Cloudflare API token, toggle **Auto-provision DNS records** to immediately publish MX, SPF, DKIM, and DMARC records to your zone.
6. Click **Create Domain**.

The domain is registered immediately in Stalwart's directory via JMAP and synchronized to the local PostgreSQL database.

---

## 4. Creating Mailboxes & Managing Quotas

With your domain active:

1. Click **Mailboxes** in the sidebar.
2. Click **Create Mailbox**.
3. Select your managed domain from the dropdown.
4. Enter the local-part (e.g., `hello` for `hello@example.com`).
5. Generate a secure random password using the built-in generator, or type a custom password.
6. *(Optional)* Set a storage quota in Megabytes or Gigabytes (e.g., `2048` for 2 GB).
7. Click **Create Mailbox**.
8. **Copy the generated credentials.** Mailwart never stores plaintext mailbox passwords in the database.

---

## 5. Setting Up Zero-Password Webmail SSO

Mailwart integrates directly with Roundcube via the custom `em_sso` plugin:

1. On the **Mailboxes** page, find your created account.
2. Click the **Webmail** action button.
3. Mailwart mints an HMAC SHA-256 token and redirects your browser to Roundcube.
4. Roundcube verifies the signature, authenticates with Stalwart via master impersonation (`user%impersonator`), and opens the inbox without prompting for credentials.

---

## 6. Automating DNS with Cloudflare

To eliminate manual DNS record entry:

1. Open **Settings** (`/dashboard/settings`) and switch to the **DNS Automation** tab.
2. Click **Add Cloudflare Account**.
3. Provide an API token with `Zone:DNS:Edit` permissions across your zones.
4. Mailwart scans and pools all available zones.
5. In **Domains** &rarr; **[Domain Detail]**, click **Provision to Cloudflare** to automatically deploy:
   - `MX` records pointing to `mail.<domain>` (Priority: 10)
   - `A` record pointing to the server's public IP
   - `TXT` record with compliant SPF mechanisms
   - `TXT` record with 2048-bit DKIM public key
   - `TXT` record with RFC 7489 DMARC policy
   - `CNAME` record for `webmail.<domain>`

---

## 7. Running Deliverability Audits

Verify that outgoing emails will not land in spam:

1. Navigate to **Settings** &rarr; **Deliverability**.
2. Click **Run Health Checkup**.
3. The 10-point inspection engine tests:
   - SPF, DKIM, and DMARC validity.
   - Forward-Confirmed Reverse DNS (FCrDNS / PTR).
   - SSL/TLS handshakes on ports 993, 465, and 587.
   - Public IP presence across Spamhaus, Barracuda, and SpamCop blacklists.
   - Clean SMTP 220 banner response.
4. Review your overall deliverability score (target: `10 / 10`).

---

## 8. Navigating the Documentation

Use the navigation sidebar to explore deeper topics:

- **[System Architecture](/docs/architecture):** Network boundaries, Docker topology, and container ingress.
- **[Pages & UX Workflows](/docs/pages-and-routes):** Complete breakdown of every screen and modal.
- **[Roundcube Webmail SSO](/docs/roundcube-sso):** Cryptographic token architecture and impersonation security.
- **[HTTP API Reference](/docs/api-reference):** Endpoint parameters, responses, and authentication.
- **[Server Actions Catalog](/docs/server-actions):** Technical reference for all 80+ server actions.
- **[Stalwart JMAP Integration](/docs/stalwart-integration):** Directory schemas and method calls.
- **[AI Copilot & Tool Registry](/docs/ai-copilot):** 10 LLM providers and 48 administrative tools.
- **[Database & Security](/docs/database-and-security):** PostgreSQL schema, RBAC, and Dokploy deployment.

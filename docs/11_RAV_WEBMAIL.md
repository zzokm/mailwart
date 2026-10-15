# 11 — Rav Webmail & Dual-Engine Architecture

## 1. Overview & Dual-Engine Architecture

**Rav** ([github.com/naust-mail/rav](https://github.com/naust-mail/rav)) is a blazing-fast, modern webmail application built on **Next.js 16**, **React 19**, and a memory-safe **Rust Axum** backend. In **mailwart**, Rav is implemented as a modern drop-in replacement for classic Roundcube.

Rather than forcing an immediate breaking migration, mailwart runs a **dual-container topology**: both Rav and Roundcube run simultaneously on Docker Compose and Dokploy. Each user can independently select their preferred webmail client in **Settings &rarr; Webmail**, customize features specific to their chosen engine, and launch zero-password Single Sign-On (SSO) sessions in a single click.

```
┌────────────────────────────────────────────────────────┐
│                   Operator Browser                     │
│  Clicks "Open Webmail" on mailbox alice@example.com    │
└───────────────────────────┬────────────────────────────┘
                            │ 1. GET /api/webmail/sso?email=alice@...
                            ▼
┌────────────────────────────────────────────────────────┐
│               mailwart (Next.js 16)                    │
│  - Inspects user settings: client = "rav"              │
│  - Generates signed HMAC SHA-256 session token         │
│  - Records audit event: webmail.sso                    │
└───────────────┬────────────────────────┬───────────────┘
                │                        │
  2a. In-cluster handshake               │ 2b. Fallback redirect
      (Direct cookie injection)          │     (?email=...&_em_sso=...)
                ▼                        ▼
┌────────────────────────────────────────────────────────┐
│                 Rav Webmail Engine                     │
│   ghcr.io/naust-mail/rav:latest (Port 3001)           │
│  - Axum / Tokio asynchronous Rust backend              │
│  - SessionStore authentication & cookie issuance       │
│  - Tantivy local full-text search indexer              │
│  - WebSocket live push server                          │
└───────────────┬────────────────────────────────────────┘
                │ 3. Secure IMAP / SMTP
                ▼
┌────────────────────────────────────────────────────────┐
│              Stalwart Mail Server                      │
│  - IMAP SSL (Port 993)                                 │
│  - SMTP Submission TLS (Port 587)                      │
│  - ManageSieve (Port 4190)                             │
└────────────────────────────────────────────────────────┘
```

---

## 2. Engine Comparison: Rav vs Roundcube

| Dimension | Rav (Modern Engine) | Roundcube (Classic Engine) |
| :--- | :--- | :--- |
| **Frontend Framework** | React 19 + Next.js 16 + Tailwind CSS | PHP 8.2 + Apache + Elastic Skin |
| **Backend & Runtime** | Rust Axum + Tokio (memory safe) | PHP 8.2 with SQLite / MySQL |
| **Full-Text Search** | **Tantivy** local search engine (sub-millisecond) | IMAP SEARCH protocol (server-side scan) |
| **Mailbox Synchronization**| **WebSocket Push** + IMAP IDLE (real-time) | AJAX interval polling |
| **Privacy & Security** | Client-side **OpenPGP** + HMAC Link Proxy | Server-side Enigma PGP plugin |
| **Composer Experience** | **Tiptap** WYSIWYG + Markdown + Reaction Stickers | TinyMCE rich text editor |
| **Sieve Filter Rules** | In active development | Native **ManageSieve** (port 4190) |
| **Container Port** | `:3001` (`email-manager-rav`) | `:80` (`email-manager-roundcube`) |
| **Prefix Route** | `/rav/` | `/webmail/` |
| **Direct Subdomain** | `rav.<domain>` & `webmail.<domain>` | `roundcube.<domain>` |

---

## 3. Webmail Settings & Dynamic Feature Toggles

The **Settings &rarr; Webmail** tab allows operators and mailbox owners to configure their webmail environment. The UI dynamically adapts feature toggles according to the selected engine:

### Rav Engine Toggles
1. **Tantivy Local Full-Text Search**: Builds an instant Tantivy search index on per-user SQLite cache for sub-millisecond search across subject lines, sender headers, and email bodies.
2. **WebSocket Live Push Sync**: Maintains persistent connections via IMAP IDLE and pushes incoming email notifications instantly over WebSockets without battery-draining polling.
3. **Client-Side OpenPGP Suite**: In-browser PGP keypair generation, public key import, digital signing, and transparent message decryption without keys ever leaving the browser.
4. **HMAC Safe Link Proxy**: Outbound hyperlinks in HTML emails are proxied through a cryptographic HMAC redirector, preventing tracking pixels and IP leaks.
5. **Tiptap Markdown Composer**: Modern rich-text composer with markdown shortcuts, syntax-highlighted code blocks, and formatted tables.
6. **Mood Reaction Stickers**: Expressive animated stickers in composer and email replies.

### Roundcube Engine Toggles
1. **ManageSieve Rule Sync (Port 4190)**: Direct synchronization with Stalwart's Sieve interpreter for server-side incoming mail filtering.
2. **Out-of-Office Vacation Autoresponder**: Automated vacation scripts synchronized directly to Stalwart.
3. **Archive & Zipdownload Export**: Download multi-message threads and folder archives as compressed ZIP archives.
4. **Elastic Adaptive Layout**: Automatic responsive switching between desktop, tablet, and mobile views.
5. **3-Pane Split Preview**: Simultaneously view mailbox folders, message lists, and reading panes.

### Common Preferences
- **Open Webmail in New Browser Tab**: Controls whether clicking "Open Webmail" launches a new browser tab (`target="_blank"`) or opens in the current tab.
- **Service Endpoint Diagnostics**: One-click test probing both `http://email-manager-rav:3001` and `http://roundcube:80` with response status and latency indicators.

---

## 4. Single Sign-On (SSO) Flow & Authentication

Mailwart implements zero-password Single Sign-On across both webmail engines via `/api/webmail/sso`:

```typescript
// Query parameters:
// ?email=ops@example.com (Required)
// ?client=rav|roundcube   (Optional; falls back to user setting)
```

1. **Authentication Check**: Verifies the operator's active session cookie.
2. **Preference Resolution**: If `client` is omitted in the URL query, the endpoint queries PostgreSQL (`user_webmail_settings`) for the user's saved engine preference (defaulting to `rav`).
3. **HMAC Token Minting**: Creates a cryptographically signed HMAC SHA-256 token containing the mailbox email, timestamp, expiration (120s), and a random nonce.
4. **Handoff Strategy**:
   - **Roundcube**: Redirects to `${ROUNDCUBE_URL}?_task=login&_em_sso=${token}`. The PHP `em_sso` plugin validates the signature and performs Stalwart SASL master authentication (`user%admin`).
   - **Rav**: Attempts an in-cluster HTTP POST to `http://email-manager-rav:3001/api/auth/login`. On success, session cookies (`rav_browser`, `rav_session_*`) are directly attached to the redirect response. If in-cluster handshake is blocked by proxy or firewall, it gracefully falls back to client handoff via `${RAV_URL}?email=${email}&_em_sso=${token}&sso=1`.

---

## 5. Docker Compose & Traefik Routing

Both containers are orchestrated in `docker-compose.yml`:

```yaml
services:
  # 1. Modern Rav Webmail Client
  rav:
    build:
      context: ./rav
      dockerfile: Dockerfile
    image: email-manager-rav:latest
    container_name: email-manager-rav
    restart: always
    environment:
      IMAP_HOST: stalwart-mail
      IMAP_PORT: "993"
      SMTP_HOST: stalwart-mail
      SMTP_PORT: "587"
      TLS_ENABLED: "true"
      DATA_DIR: /data
      PORT: "3001"
      RUST_LOG: info
    volumes:
      - rav_data:/data
    labels:
      - traefik.enable=true
      - traefik.docker.network=dokploy-network
      # Route under dashboard prefix: /rav
      - traefik.http.routers.email-manager-rav.rule=Host(`email.yehia.dev`) && PathPrefix(`/rav`)
      - traefik.http.routers.email-manager-rav.middlewares=email-manager-rav-strip
      - traefik.http.middlewares.email-manager-rav-strip.stripprefix.prefixes=/rav
      # Direct subdomains for rav and webmail
      - traefik.http.routers.rav-direct-https.rule=HostRegexp(`^rav\..+$$`) || HostRegexp(`^webmail\..+$$`) || Host(`mail.zokm.me`)
      - traefik.http.routers.rav-direct-https.tls=true
      - traefik.http.routers.rav-direct-https.priority=105
      - traefik.http.services.email-manager-rav.loadbalancer.server.port=3001

  # 2. Classic Roundcube Webmail Client
  roundcube:
    build:
      context: ./roundcube
      dockerfile: Dockerfile
    image: email-manager-roundcube:latest
    container_name: email-manager-roundcube
    restart: always
    volumes:
      - roundcube_db:/var/roundcube/db
    labels:
      - traefik.enable=true
      - traefik.docker.network=dokploy-network
      # Route under dashboard prefix: /webmail
      - traefik.http.routers.email-manager-webmail.rule=Host(`email.yehia.dev`) && PathPrefix(`/webmail`)
      - traefik.http.routers.email-manager-webmail.middlewares=email-manager-webmail-strip
      - traefik.http.middlewares.email-manager-webmail-strip.stripprefix.prefixes=/webmail
      # Direct subdomain for roundcube
      - traefik.http.routers.webmail-direct-https.rule=HostRegexp(`^roundcube\..+$$`)
      - traefik.http.routers.webmail-direct-https.tls=true
      - traefik.http.routers.webmail-direct-https.priority=100
      - traefik.http.services.email-manager-webmail.loadbalancer.server.port=80
```

---

## 6. Persistence & PostgreSQL Schema

User webmail selections and custom feature toggle states are persisted in PostgreSQL:

```sql
CREATE TABLE IF NOT EXISTS user_webmail_settings (
  user_id VARCHAR(64) PRIMARY KEY,
  client VARCHAR(32) NOT NULL DEFAULT 'rav',
  features JSONB NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_user_webmail_user_id ON user_webmail_settings(user_id);
```

All preference changes are audited and logged with action `webmail.settings_update`, detailing whether Tantivy, ManageSieve, or alternative flags were toggled.

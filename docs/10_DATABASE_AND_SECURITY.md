# 10 - Database, Security & Deployment

## 1. PostgreSQL Relational Schema (`src/lib/db/index.ts`)

Mailwart utilizes **PostgreSQL 16** (`mailwart-postgres`) for persistent state, role-based access control, audit trails, and user management.

```mermaid
erDiagram
    users ||--o{ domains : "owns (1:N)"
    users ||--o{ cloudflare_accounts : "configures (1:N)"
    users ||--o{ copilot_conversations : "holds (1:N)"
    users ||--o{ audit_logs : "initiates (1:N)"
    domains ||--o{ mailboxes : "contains (1:N)"
    domains ||--o{ deliverability_reports : "audited by (1:N)"

    users {
        varchar id PK
        varchar username UK
        varchar email UK
        text password_hash
        varchar role "admin | user"
    }
    domains {
        varchar id PK
        varchar name UK
        varchar owner_id FK
        text description
    }
    mailboxes {
        varchar id PK
        varchar email UK
        varchar domain_id FK
        varchar owner_id FK
        bigint quota_bytes
        varchar status
    }
    audit_logs {
        varchar id PK
        timestamptz timestamp
        varchar actor
        varchar action
        text target
        jsonb meta
    }
    cloudflare_accounts {
        varchar id PK
        varchar user_id FK
        varchar account_name
        text api_token
        varchar status
    }
    deliverability_reports {
        varchar id PK
        varchar domain_id FK
        numeric score
        jsonb check_results
    }
```

### Table Definitions

#### 1. `users`
Stores console administrative and domain-scoped users:
- `id` (VARCHAR 64, PK): Unique user identifier (`usr_...`).
- `username` (VARCHAR 64, UNIQUE): Login username.
- `email` (VARCHAR 255, UNIQUE): Registered email for password recovery.
- `password_hash` (TEXT): Salted SHA-256 password hash.
- `salt` (TEXT): Cryptographically random salt.
- `role` (VARCHAR 32): `"admin"` (full instance access) or `"user"` (domain-scoped).
- `created_at` / `updated_at` (TIMESTAMPTZ).

#### 2. `domains`
Mirrors Stalwart domains and tracks tenant ownership:
- `id` (VARCHAR 128, PK): Domain identifier.
- `name` (VARCHAR 255, UNIQUE): FQDN (e.g. `example.com`).
- `description` (TEXT): Administrative label.
- `owner_id` (VARCHAR 64, FK &rarr; `users.id`): User who owns this domain.

#### 3. `mailboxes`
Mirrors Stalwart accounts for fast querying and quota tracking:
- `id` (VARCHAR 128, PK): Account identifier.
- `email` (VARCHAR 255, UNIQUE): Full mailbox address.
- `domain_id` (VARCHAR 128, FK &rarr; `domains.id`).
- `owner_id` (VARCHAR 64, FK &rarr; `users.id`).
- `quota_bytes` / `used_bytes` (BIGINT).
- `status` (VARCHAR 32): `"active"` or `"suspended"`.

#### 4. `audit_logs`
Immutable record of all console administrative operations:
- `id` (VARCHAR 64, PK): Unique audit event ID.
- `timestamp` (TIMESTAMPTZ): Event time.
- `actor` (VARCHAR 64): Username or Copilot agent that initiated the change.
- `action` (VARCHAR 64): Action identifier (e.g., `mailbox.create`, `domain.destroy`).
- `target` (TEXT): Affected domain or mailbox.
- `detail` (TEXT): Human-readable summary.
- `meta` (JSONB): Structured metadata payload.

#### 5. `delivery_logs`
Mirrors live MTA SMTP delivery traces:
- `id` (VARCHAR 64, PK), `timestamp` (TIMESTAMPTZ).
- `sender` (VARCHAR 255), `recipient` (VARCHAR 255).
- `status` (VARCHAR 64): `delivered`, `bounced`, `deferred`, `queued`.
- `size_bytes` (BIGINT), `queue_id` (VARCHAR 128), `detail` (TEXT).

#### 6. `cloudflare_accounts`
Encrypted pool of Cloudflare API tokens:
- `id` (VARCHAR 64, PK), `user_id` (VARCHAR 64).
- `account_name` (VARCHAR 255), `api_token` (TEXT).
- `zones_count` (INTEGER), `status` (VARCHAR 32).

#### 7. `copilot_settings` & `copilot_conversations`
Stores per-user LLM provider preferences, custom base URLs, API keys, and full multi-turn conversation histories.

#### 8. `deliverability_reports`
Stores historical 10-point deliverability audit scores and breakdown details.

#### 9. `password_reset_otps`
Stores single-use 6-digit OTP codes, verification salts, and reset tokens with 15-minute TTL.

#### 10. `system_settings`
Key-value store holding global configurations, including system outbound SMTP mailer credentials.

---

## 2. Authentication & Session Security

```mermaid
sequenceDiagram
    autonumber
    actor Operator as Operator Browser
    participant Server as mailwart (Next.js Server)
    participant DB as mailwart-pg (PostgreSQL 16)

    Operator->>Server: 1. POST /api/auth/login (username + password)
    Server->>DB: Query user by username
    DB-->>Server: User record (salt + password_hash)
    Note over Server: Verify SHA-256(password + salt) == password_hash
    Server->>Server: Seal iron-session cookie (AES-256-GCM)
    Server-->>Operator: 2. Set-Cookie: mailwart_session (HttpOnly, Secure, SameSite=Lax)
    Operator->>Server: 3. Subsequent Authenticated Requests (Cookie sent automatically)
    Server->>DB: Query tenant-scoped domains & mailboxes
    DB-->>Server: Records
    Server-->>Operator: Rendered Dashboard UI
```

### 1. `iron-session` Sealed Cookies
- Sessions are encrypted using AES-256-GCM via `iron-session`.
- The cookie payload contains:
  ```typescript
  export type SessionData = {
    userId: string
    username: string
    role: "admin" | "user"
    email?: string
    impersonatingFrom?: {
      userId: string
      username: string
      role: "admin"
    }
  }
  ```
- **Crucial Security Rule:** The cookie never contains the Stalwart master password, database credentials, or API keys.

### 2. Password Hashing
- User passwords are encrypted using SHA-256 with a unique 32-byte cryptographically secure random salt per user.

---

## 3. Role-Based Access Control (RBAC)

### Three-Tier Privilege Model:
1. **Primary Administrator (`APP_ADMIN_USER`, default: `yehia`):**
   - Cannot be deleted or degraded.
   - Master authority over system settings, outbound email config, and all hosted domains.
2. **Secondary Administrators (`role: "admin"`):**
   - Full access to create domains, mailboxes, manage other users, and view audit logs.
3. **Regular Users (`role: "user"`):**
   - Restricted to managing domains and mailboxes explicitly assigned to their `owner_id`.
   - Cannot view system settings, other users, or cross-domain logs.

### Administrator Impersonation
Administrators can temporarily impersonate regular users from `/dashboard/settings?tab=users`:
- Switches session context to the target user's ID while storing `impersonatingFrom`.
- Displays an amber warning banner at the top of the interface.
- Clicking "Exit Impersonation" immediately restores the original administrator session.

---

## 4. Production Deployment with Dokploy

Mailwart is packaged as a standard Git repository deployed via Dokploy.

### Required Production Environment Variables
| Variable Name | Purpose | Example / Guidance |
| :--- | :--- | :--- |
| `DATABASE_URL` | PostgreSQL connection string | `postgresql://mailwart:pass@mailwart-postgres:5432/mailwart` |
| `SESSION_SECRET` | 32+ char key for cookie encryption | `openssl rand -base64 32` |
| `APP_ADMIN_USER` | Primary admin username | `yehia` |
| `APP_ADMIN_PASSWORD`| Initial seed password | Strong password |
| `STALWART_JMAP_URL` | Private Stalwart JMAP URL | `http://stalwart-mail:8080/jmap` |
| `STALWART_ADMIN_USER`| Stalwart administrator username | `admin@example.com` |
| `STALWART_ADMIN_PASSWORD`| Stalwart admin password | Password from Stalwart setup |
| `ROUNDCUBE_URL` | Public webmail URL | `https://email.example.com/webmail/` |
| `WEBMAIL_SSO_SECRET`| Shared HMAC key (32+ chars) | `openssl rand -base64 32` |
| `ROUNDCUBE_DES_KEY` | Roundcube session encryption key | `openssl rand -base64 24` |
| `AUDIT_LOG_PATH` | Path for disk-persisted audit log | `/data/audit.jsonl` |

### Volume Persistence & Backups
To safeguard production data, backup the following Docker volumes:
1. `mailwart_postgres`: Contains console accounts, domain ownership mappings, and audit history.
2. `roundcube_db`: Contains Roundcube address books and user webmail preferences.
3. `mailwart_audit`: Append-only audit JSONL file.

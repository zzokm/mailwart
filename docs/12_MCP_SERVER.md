# Model Context Protocol (MCP) Server & Direct Mailbox Engine

Mailwart exposes a comprehensive, production-grade **Model Context Protocol (MCP)** server enabling external AI agents (e.g., Claude Desktop, Cursor, Antigravity, Cline, Windsurf, LangChain, or custom autonomous sidecars) to inspect, configure, and operate every capability of the mail platform.

In addition to full administrative management, the MCP server provides **first-class direct mailbox access** over Stalwart's JMAP engine (RFC 8620 & RFC 8621), allowing agents to list folders, perform multi-dimensional email searches, read full message bodies and attachment metadata, manage flags, move emails, and compose or draft outbound messages.

---

## 1. Architecture Overview

```
 +-----------------------------------------------------------------------------------+
 |                             External AI Clients                                  |
 |  (Claude Desktop, Cursor IDE, Antigravity CLI, Windsurf, Cline, Python/TS MCP)   |
 +-----------------------------------------------------------------------------------+
                               |                         |
               HTTP SSE / JSON-RPC 2.0               Stdio Pipe
            (Bearer mw_mcp_<hex_token>)       (Local node/tsx process)
                               |                         |
                               v                         v
 +-----------------------------------------------------------------------------------+
 |                               Mailwart MCP Server                                 |
 |  - Session Manager & SSE Writer (`src/lib/mcp/session-manager.ts`)                |
 |  - SHA-256 API Key Validator (`src/lib/db/mcp-keys.ts`)                           |
 |  - Ambient Admin Session Provider (`src/lib/auth/session.ts`)                     |
 |  - 56 Functional Tools across 12 Modules (`src/lib/mcp/tools.ts`)                 |
 +-----------------------------------------------------------------------------------+
                               |                         |
                  Server Actions & DB                 JMAP Mail Engine
                  (Full Admin Surface)             (Direct Mailbox Access)
                               |                         |
                               v                         v
               +-------------------------------------------------+
               |              Stalwart Mail Server               |
               |      JMAP RFC 8620 / 8621 (Port 8080/jmap)      |
               |       IMAP (993), Sieve (4190), SMTP (587)      |
               +-------------------------------------------------+
```

### Transport Mechanisms
1. **Remote HTTP SSE Transport (`/api/mcp/sse` + `/api/mcp/messages`)**:
   Standard SSE streaming transport. The client connects to `GET /api/mcp/sse` with `Authorization: Bearer <API_KEY>`, receives the endpoint URL event, and sends JSON-RPC requests via `POST /api/mcp/messages?sessionId=<uuid>`.
2. **Direct HTTP JSON-RPC 2.0 (`/api/mcp`)**:
   Stateless HTTP endpoint accepting standard JSON-RPC 2.0 `tools/list`, `tools/call`, `initialize`, and `resources/list` payloads.
3. **Local Stdio Transport (`bin/mcp-server.ts`)**:
   Local command-line runner using `@modelcontextprotocol/sdk/server/stdio.js`, ideal for local desktop clients and sandboxed runners (`npx tsx bin/mcp-server.ts`).

---

## 2. Authentication & Security

The MCP server enforces strict authentication using cryptographically generated API keys:
- **Token Format:** `mw_mcp_<48 hex chars>` (e.g. `mw_mcp_a3f892d1948b...`).
- **Storage:** Keys are hashed with SHA-256 (`key_hash`) before persisting to PostgreSQL (`mcp_api_keys`). Raw keys are never stored in plaintext and cannot be recovered if lost.
- **Constant-Time Verification:** API key authentication uses `crypto.timingSafeEqual` to guard against side-channel timing attacks.
- **Master Fallback:** If `process.env.MCP_API_KEY` is configured in the environment, it acts as an immutable primary admin token.
- **Ambient Admin Execution:** MCP tool calls run inside Node.js `AsyncLocalStorage` (`runWithAdminSession()`), ensuring all internal database mutations and Stalwart requests execute with primary administrator permissions and full audit logging attribution (`actor: admin-mcp`).

---

## 3. Direct Mailbox JMAP Operations

External AI agents can interact with individual mailboxes without requiring the user's IMAP/webmail password. The admin JMAP engine proxies requests directly to Stalwart's `urn:ietf:params:jmap:mail` and `urn:ietf:params:jmap:submission` endpoints.

### Key Mailbox Tools
| Tool Name | Parameters | Description |
|---|---|---|
| `mailbox_list_folders` | `emailOrAccountId` | Lists all folders (`inbox`, `sent`, `drafts`, `trash`, `junk`, `archive`, custom) with unread and total message counts. |
| `mailbox_query_emails` | `emailOrAccountId`, `filter` | Search emails with filters: `folderId`, `from`, `to`, `subject`, `text`, `after`, `before`, `isUnread`, `isFlagged`, `hasAttachment`, `limit`, `offset`. |
| `mailbox_get_email` | `emailOrAccountId`, `emailId` | Fetch full email contents: headers, plain text body, sanitized HTML body, preview, and attachment metadata. |
| `mailbox_set_email_flags` | `emailOrAccountId`, `emailId`, flags | Update message flags: `isRead`, `isFlagged`, `addKeywords`, `removeKeywords`. |
| `mailbox_move_email` | `emailOrAccountId`, `emailId`, target | Move message to destination folder ID or role (`inbox`, `trash`, `archive`, `junk`). |
| `mailbox_delete_email` | `emailOrAccountId`, `emailId`, permanent | Move message to Trash or permanently delete (`destroy`). |
| `mailbox_send_email` | `emailOrAccountId`, params | Send outbound email or save draft (`to`, `cc`, `bcc`, `subject`, `bodyText`, `bodyHtml`, `isDraft`). |

---

## 4. Complete Tool Catalog (56 Tools across 12 Modules)

### 1. System & Health
- `get_health`: Probe JMAP, Roundcube, and Rav health, response latency, and reachability.
- `get_overview`: Dashboard overview: domain/mailbox counts, dynamically scaled 0.25GB quota summary, unread counts, health, and URLs.
- `get_system_info`: Get system endpoints, Stalwart hostnames, webmail URLs, and application environment configurations.

### 2. Domain Management
- `list_domains`: List all configured email domains in Stalwart and database with MX/SPF/DKIM/DMARC status.
- `get_domain_detail`: Get detailed information, DNS status, and ownership for a single domain.
- `create_domain`: Create a new email domain in Stalwart with automatic DKIM keypair generation.
- `update_domain`: Update domain attributes (description, catch-all archival mirroring, etc.).
- `destroy_domain`: Delete a domain and all associated mailboxes and aliases.

### 3. DNS Diagnostics & Keys
- `refresh_domain_dns`: Force a live DNS check (MX, SPF, DKIM, DMARC) for a domain against upstream resolvers.
- `poll_domains_dns`: Batch poll live DNS status across multiple domains.
- `generate_dkim`: Generate RSA or Ed25519 DKIM keys in Stalwart and retrieve public DNS TXT record guidance.
- `generate_dmarc`: Generate an RFC 7489 compliant DMARC TXT record string.

### 4. Mailbox Administration
- `list_mailboxes`: List all mailboxes across domains with storage quotas and suspend status.
- `get_mailbox_detail`: Retrieve detailed mailbox metadata, quotas, aliases, and application passwords.
- `create_mailbox`: Provision a new mailbox account in Stalwart with quota, name, and initial password.
- `update_mailbox`: Update mailbox details: display name, quota in MB/unmetered, or active status.
- `destroy_mailbox`: Permanently delete a mailbox from Stalwart after email confirmation.
- `reset_mailbox_password`: Reset credentials for an individual mailbox.
- `suspend_mailbox`: Toggle mailbox suspension (disabling IMAP/SMTP/JMAP login).
- `update_mailbox_aliases`: Update the list of inbound aliases delivering into a mailbox.
- `create_app_password`: Generate a dedicated application password token for third-party clients.
- `revoke_app_password`: Revoke a dedicated application password token.

### 5. Direct Mailbox Operations (JMAP)
- `mailbox_list_folders`: List folders and message counts.
- `mailbox_query_emails`: Search and filter emails by sender, recipient, subject, text, date range, read/unread, flagged, or attachment.
- `mailbox_get_email`: Retrieve full email body (HTML + text) and attachments metadata.
- `mailbox_set_email_flags`: Update email flags (`$seen`, `$flagged`).
- `mailbox_move_email`: Move an email to a target folder or standard role.
- `mailbox_delete_email`: Move email to Trash or permanently delete.
- `mailbox_send_email`: Send an outbound email from a mailbox or save as draft.

### 6. Routing, Forwarding & Catch-Alls
- `get_routing_overview`: Full routing overview including forwarding rules, domain catch-alls, and aliases.
- `upsert_forwarding_rule`: Create or update an inbound email forwarding rule with local copy retention.
- `destroy_forwarding_rule`: Delete an email forwarding rule.
- `sync_domain_forwards`: Re-compile and deploy Sieve scripts for domain forwarding rules.
- `update_catch_all`: Configure domain-wide catch-all delivery mailbox.
- `sync_catch_all_archival`: Enforce automatic archival mirroring for all incoming emails on a domain.
- `purge_catch_all_postmaster`: System abstraction: purge all postmaster@ and automated DMARC/TLS reports from catch-all mailboxes.
- `update_mail_exchanger`: Configure primary and backup MX exchanger priority.

### 7. Sieve Sorting Rules & Spam Posture
- `get_filters_overview`: Retrieve all server-side Sieve sorting rules, autoresponders, and spam thresholds.
- `upsert_autoresponder`: Configure vacation auto-reply with date window and cooldown period.
- `destroy_autoresponder`: Delete an active vacation autoresponder.
- `upsert_filter_rule`: Create or update a server-side Sieve message sorting rule.
- `destroy_filter_rule`: Delete a server-side Sieve filter rule.
- `update_spam_settings`: Configure spam scoring sensitivity threshold and auto-discard rules.

### 8. Deliverability Suite
- `run_deliverability_audit`: Run comprehensive deliverability audit across domains (DNS, MX, SPF, DKIM, DMARC, rDNS, Blacklists, Ports, TLS).
- `get_latest_deliverability_report`: Fetch the most recent deliverability suite report with domain scores and issue breakdown.
- `probe_internet_egress`: Probe outbound internet egress across critical mail ports (25, 465, 587) to verify external ISP connectivity.

### 9. Cloudflare DNS Automation
- `get_cloudflare_status`: Get linked Cloudflare accounts, discovered zones, and auto-sync status.
- `add_cloudflare_account`: Add a Cloudflare API token to the encrypted multi-account token pool.
- `remove_cloudflare_account`: Remove a Cloudflare account from the token pool.
- `test_cloudflare_account`: Test and re-verify permissions for a stored Cloudflare token.
- `audit_dns_conflicts`: Audit a domain in Cloudflare for conflicting MX or SPF records before provisioning.
- `provision_cloudflare_dns`: Automatically create all required DNS records (MX, SPF, DKIM, DMARC, Webmail CNAME, Mail A) in Cloudflare.
- `propagate_webmail_dns`: Ensure webmail.<domain> records are propagated across all managed zones.

### 10. Bulk CSV Operations
- `prepare_bulk_mailboxes`: Parse and validate CSV data for bulk mailbox provisioning.
- `prepare_bulk_forwarding`: Parse and validate CSV data for bulk forwarding rules.
- `get_bulk_job_status`: Check execution progress, chunk completions, and errors of a bulk job.
- `commit_bulk_job_chunk`: Process the next execution chunk for an active bulk job.
- `pause_bulk_job`: Pause a running bulk operation job.
- `resume_bulk_job`: Resume a paused bulk operation job.
- `abort_bulk_job`: Abort a bulk operation and clean up staged resources.
- `bulk_destroy_mailboxes`: Permanently delete multiple mailboxes in a single atomic transaction.
- `bulk_reset_passwords`: Bulk update passwords across multiple mailboxes.
- `bulk_suspend_mailboxes`: Bulk toggle suspension status across multiple mailboxes.
- `bulk_set_storage_capacity`: Bulk update storage quotas across mailboxes (in MB or unmetered 0).

### 11. User Management & System Alerts
- `list_users`: List console users with their roles and domain ownership.
- `create_user`: Create a new dashboard user account.
- `delete_user`: Delete a console user account.
- `update_user_email`: Update the contact email address for a console user.
- `admin_set_user_password`: Force reset a password for a target console user account.
- `setup_noreply_email`: Automatically provision a system noreply@<domain> mailbox for outbound system alerts.
- `save_system_email_sender`: Configure outbound SMTP credentials for system notifications and password resets.
- `get_system_email_sender`: Retrieve the current system outbound SMTP configuration.
- `send_test_email`: Send an immediate test email to verify outbound SMTP delivery.

### 12. System Logs & Audit Trail
- `get_audit_logs`: Query administrative audit trail events with pagination, action, actor, and date filters.
- `get_delivery_logs`: Search Stalwart mail delivery logs with status, sender, and recipient filters.

---

## 5. Client Integration Configurations

### Claude Desktop
Add to your `claude_desktop_config.json`:
```json
{
  "mcpServers": {
    "mailwart": {
      "url": "https://email.yehia.dev/api/mcp/sse",
      "headers": {
        "Authorization": "Bearer mw_mcp_your_api_key_here"
      }
    }
  }
}
```

### Cursor / Windsurf
Add to `.cursor/mcp.json` in your project root:
```json
{
  "mcpServers": {
    "mailwart": {
      "url": "https://email.yehia.dev/api/mcp/sse",
      "headers": {
        "Authorization": "Bearer mw_mcp_your_api_key_here"
      }
    }
  }
}
```

### Antigravity / AGY CLI
Connect Mailwart MCP to your Antigravity environment:
```bash
agy mcp add mailwart --url "https://email.yehia.dev/api/mcp/sse" --header "Authorization=Bearer mw_mcp_your_api_key_here"
```

### Local Stdio (Command Line)
For running completely local agents directly on the host machine:
```bash
npm run mcp
```
Or in Claude Desktop configuration:
```json
{
  "mcpServers": {
    "mailwart": {
      "command": "npx",
      "args": ["tsx", "d:/Yehia Uni/mailwart/bin/mcp-server.ts"],
      "env": {
        "STALWART_URL": "http://stalwart-mail:8080",
        "STALWART_USER": "admin@zokm.me",
        "STALWART_PASSWORD": "...",
        "DATABASE_URL": "postgresql://..."
      }
    }
  }
}
```


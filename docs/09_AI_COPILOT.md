# 09 — AI Copilot & Tool Registry

## 1. Overview & Architecture

**mailwart Copilot** is an integrated AI assistant embedded into the right rail of the dashboard. Built with the **Vercel AI SDK (v7)** and React 19, Copilot understands the entire Stalwart directory schema, Cloudflare DNS configurations, and email routing rules.

Operators can manage their mail server using natural language (e.g. *"Create 5 mailboxes for the marketing team with 2GB quotas"* or *"Check why example.com is failing SPF"*).

```
┌─────────────────────────────────┐
│       Operator Browser          │
│   Copilot Chat Panel Drawer     │
│   (useChat hook from @ai-sdk)   │
└────────────────┬────────────────┘
                 │ 1. POST /api/copilot/chat (UI Message Stream)
                 ▼
┌─────────────────────────────────┐
│     Next.js AI Runtime          │
│   - Rate Limit Verification     │
│   - Provider Resolver           │
│   - Model Instantiation         │
│   - System Prompt Injection     │
└────────────────┬────────────────┘
                 │ 2. Streaming LLM Request (OpenAI, Claude, Gemini, etc.)
                 ▼
┌─────────────────────────────────┐
│      AI Model (External)        │
│   - Analyzes user request       │
│   - Selects Tools from Registry │
└────────────────┬────────────────┘
                 │ 3. Tool Calls (e.g. `create_mailbox`, `generate_dkim`)
                 ▼
┌─────────────────────────────────┐
│    mailwart Tool Executor       │
│  - Parameter Zod Validation     │
│  - Human-in-the-Loop Check      │
│  - Runs Server Action           │
│  - Records Audit Event          │
└─────────────────────────────────┘
```

---

## 2. Multi-Provider LLM Catalog (`src/lib/copilot/providers.ts`)

Mailwart supports 10 distinct LLM providers. API keys remain strictly server-side in PostgreSQL or environment variables:

| Provider ID | Provider Name | SDK Architecture | Default Recommended Model |
| :--- | :--- | :--- | :--- |
| `openai` | OpenAI | OpenAI-compatible (`@ai-sdk/openai`) | `gpt-4o` |
| `anthropic` | Anthropic Claude | Claude Messages API (`@ai-sdk/anthropic`) | `claude-sonnet-4-20250514` |
| `google` | Google Gemini | Google Generative AI (`@ai-sdk/google`) | `gemini-2.0-flash` |
| `cerebras` | Cerebras Inference | Ultra-fast OpenAI-compatible | `llama-3.3-70b` |
| `groq` | Groq LPU | Ultra-low latency OpenAI-compatible | `llama-3.3-70b-versatile` |
| `mistral` | Mistral AI | OpenAI-compatible | `mistral-large-latest` |
| `deepseek` | DeepSeek | OpenAI-compatible | `deepseek-chat` |
| `moonshot` | Moonshot / Kimi | OpenAI-compatible | `moonshot-v1-8k` |
| `ollama` | Ollama (Local) | Local OpenAI-compatible (no key needed) | `llama3.3:latest` |
| `openrouter` | OpenRouter | Universal multi-model gateway | `auto` |

---

## 3. The 48-Tool Administrative Registry (`src/lib/copilot/tools/registry.ts`)

Copilot has access to 48 strongly-typed administrative tools that map directly to mailwart server actions:

### 3.1 Diagnostics & Health Tools
- `get_health`: Probes live JMAP latency and webmail HTTP reachability.
- `get_overview`: Returns system counts (domains, mailboxes, catch-alls, disk storage).
- `get_delivery_logs`: Queries recent SMTP delivery events and queue traces.
- `get_audit_logs`: Inspects the administrative audit log for historical actions.

### 3.2 Domain Management Tools
- `list_domains`: Lists all hosted domains with enabled state and mailbox counts.
- `get_domain`: Returns domain detail, sub-addressing, catch-all mode, and DNS status.
- `refresh_domain_dns`: Re-queries public resolvers for MX, SPF, DKIM, and DMARC.
- `generate_dkim`: Generates new 2048-bit RSA DKIM keys in Stalwart.
- `generate_dmarc`: Formats an RFC 7489 compliant DMARC record.
- `create_domain`: Registers a new domain in Stalwart and local DB.
- `update_domain`: Modifies description, sub-addressing delimiter, or settings.
- `suspend_domain`: Suspends incoming mail and user authentication for a domain.
- `destroy_domain`: Permanently removes a domain (requires typed confirmation).

### 3.3 Cloudflare DNS Automation Tools
- `list_cloudflare_zones`: Lists discovered zones across linked Cloudflare accounts.
- `provision_cloudflare_dns`: Automatically provisions all 6 mail records to Cloudflare.

### 3.4 Mailbox Management Tools
- `list_mailboxes`: Lists accounts with email, quota usage, and domain mapping.
- `get_mailbox`: Detailed view of a single mailbox (quota, app passwords, 2FA, aliases).
- `create_mailbox`: Provisions a new mailbox with password and quota.
- `update_mailbox`: Updates account description, quota, or status.
- `suspend_mailbox`: Suspends or activates login and delivery for an account.
- `set_mailbox_quota`: Adjusts storage quota limit in Megabytes.
- `create_app_password`: Generates an IMAP/SMTP application password.
- `revoke_app_password`: Revokes an application password token.
- `reset_mailbox_password`: Resets user credentials securely.
- `destroy_mailbox`: Deletes a mailbox account from Stalwart.

### 3.5 Routing & Filter Tools
- `get_routing_overview`: Returns catch-alls, domain aliases, and user forwarders.
- `upsert_forwarding`: Creates or updates an email forwarding rule.
- `destroy_forwarding`: Deletes a forwarding rule.
- `update_mailbox_aliases`: Assigns or removes secondary local-parts.
- `update_catch_all`: Configures domain catch-all destination (Address, Bounce, Blackhole).
- `update_mail_exchanger`: Updates MX posture (Local, Backup, Remote).
- `get_filters_overview`: Lists autoresponders, Sieve filters, and spam posture.
- `upsert_autoresponder`: Sets vacation / out-of-office autoreply messages.
- `destroy_autoresponder`: Deletes a vacation autoresponder.
- `upsert_filter_rule`: Creates server-side Sieve message sorting rules.
- `destroy_filter_rule`: Removes a Sieve filter rule.
- `update_spam_settings`: Adjusts spam scoring thresholds and discard behavior.

### 3.6 Bulk Operations Tools
- `prepare_bulk_mailboxes`: Uploads and validates mailbox CSV data.
- `prepare_bulk_forwarding`: Validates and queues forwarding rules CSV.
- `get_bulk_job`: Reports real-time status of a running chunked job.
- `abort_bulk_job`: Terminates an active bulk provisioning job.
- `pause_bulk_job`: Temporarily pauses chunk processing.
- `resume_bulk_job`: Resumes paused chunk execution.
- `commit_bulk_job_chunk`: Executes a 25-row batch import.
- `bulk_destroy_mailboxes`: Batch deletes selected accounts.
- `bulk_reset_passwords`: Batch resets passwords for selected accounts.
- `bulk_suspend_mailboxes`: Batch activates or suspends accounts.

### 3.7 Meta & Navigation Tools
- `navigate_to`: Directs the operator's browser to relevant dashboard routes.
- `ask_operator`: Solicits clarification or confirmation from the user in chat.

---

## 4. Human-in-the-Loop Approval Workflow (`src/lib/copilot/approvals.ts`)

Destructive tools (deleting domains, destroying mailboxes, mass password resets) are protected by a mandatory confirmation gate:

```
┌────────────────────────────────────────────────────────┐
│                   AI Copilot Chat UI                   │
│                                                        │
│  Copilot: "I'm ready to delete the mailbox             │
│            test@example.com. Please confirm:"          │
│                                                        │
│  ┌──────────────────────────────────────────────────┐  │
│  │ ⚠️ Confirm Action: destroy_mailbox               │  │
│  │ Target: test@example.com                         │  │
│  │ Effect: All stored emails and data will be lost. │  │
│  │                                                  │  │
│  │    [ Cancel ]         [ Approve & Execute ]      │  │
│  └──────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────┘
```

1. **Read-Only Tools:** (e.g. `get_health`, `list_domains`, `get_mailbox`) execute immediately without user interruption.
2. **Mutating Tools:** Trigger an interactive card in the chat window detailing the exact payload parameters. Execution is suspended until the operator clicks "Approve".
3. **Audit Recording:** Every tool invocation records an audit log entry in PostgreSQL with the actor identifier `copilot:<username>`.

---

## 5. Conversation Persistence & History

Conversations are persisted in PostgreSQL in the `copilot_conversations` table:
- Preserves full chat transcripts across browser refreshes.
- Stores model metadata, tool call arguments, and tool outputs.
- Operators can rename, review, or clear conversation threads at any time.

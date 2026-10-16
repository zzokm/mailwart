# 04 - Server Actions Catalog

## 1. Overview & Action Contract

All mutating operations and complex data aggregations in **mailwart** are executed through Next.js Server Actions (`"use server"`). Server actions ensure that database secrets, Stalwart admin credentials, and Cloudflare tokens never leak to the client browser.

### The `ActionResult<T>` Response Standard
All actions return a standardized response object defined in `src/lib/actions/result.ts`:

```typescript
export type ActionResult<T = void> =
  | {
      ok: true
      data: T
      source?: "live" | "mock"
    }
  | {
      ok: false
      error: string
      code?: string
      fieldErrors?: Record<string, string[]>
      source?: "live" | "mock"
    }
```

---

## 2. Mail & Directory Server Actions (`src/lib/actions/mail.ts`)

`mail.ts` is the central action module containing 46 server actions:

### Overview & Diagnostics
| Action Name | Input Parameters | Return Type | Description |
| :--- | :--- | :--- | :--- |
| `getHealth()` | None | `HealthStatus` | Probes JMAP latency and webmail HTTP reachability. |
| `getOverview()` | None | `ActionResult<OverviewData>` | Computes directory counts, active domains, quota usage, and service URLs. |

### Domain Management Actions
| Action Name | Input Parameters | Description |
| :--- | :--- | :--- |
| `listDomainsAction()` | None | Returns all configured domains, enriched with mailbox counts and DNS status. |
| `getDomainDetailAction(id)` | `id: string` | Fetches domain config, catch-all settings, mailboxes, and DNS check results. |
| `createDomainAction(input)` | `{ name, description?, autoDns? }` | Validates domain FQDN, creates `x:Domain` in Stalwart, provisions DNS if requested, and syncs to DB. |
| `updateDomainAction(input)` | `{ id, description?, isEnabled?, subAddressing? }` | Updates domain state, enables/suspends incoming delivery, and records audit. |
| `destroyDomainAction(input)` | `{ id, confirmName, force? }` | Enforces exact name typing confirmation; deletes `x:Domain` from Stalwart and unlinks DB records. |
| `refreshDomainDnsAction(input)` | `{ id: string }` | Bypasses DNS cache and queries public resolvers (1.1.1.1, 8.8.8.8) for live records. |
| `pollDomainsDnsAction(ids)` | `ids: string[]` | Efficient multi-domain DNS polling for background table updates. |
| `generateDkimAction(input)` | `{ domainId, selector, keySize? }` | Generates RSA/Ed25519 DKIM keys in Stalwart and returns public DNS TXT record. |
| `generateDmarcAction(input)` | `{ domain, policy, ruaEmail?, pct? }` | Generates RFC 7489 compliant DMARC TXT record string. |

### Mailbox Management Actions
| Action Name | Input Parameters | Description |
| :--- | :--- | :--- |
| `listMailboxesAction(domainId?)` | `domainId?: string` | Lists accounts across all domains or filtered by domain ID. |
| `getMailboxDetailAction(id)` | `id: string` | Returns account details, quota, aliases, app passwords, 2FA status, and forwarders. |
| `createMailboxAction(input)` | `{ domainId, localPart, password, quotaMib?, description? }` | Creates Stalwart account `x:Account`, enforces password complexity, syncs to DB. |
| `updateMailboxAction(input)` | `{ id, isEnabled?, quotaMib?, description? }` | Updates mailbox status, adjusts storage quota, or updates operator description. |
| `resetMailboxPasswordAction(input)` | `{ id, newPassword }` | Updates account credentials in Stalwart. Never stores plaintext password. |
| `destroyMailboxAction(input)` | `{ id, confirmEmail }` | Deletes mailbox from Stalwart after email confirmation. Cleans up aliases. |
| `bulkDestroyMailboxesAction(ids)` | `ids: string[]` | Batch deletes multiple mailboxes. Returns per-item outcome status. |
| `bulkResetPasswordsAction(ids)` | `ids: string[]` | Generates cryptographically secure passwords for selected mailboxes. |
| `bulkSuspendMailboxesAction(input)`| `{ ids: string[], suspend: boolean }` | Batch activates or suspends multiple mailboxes. |

### Application Passwords & 2FA
| Action Name | Input Parameters | Description |
| :--- | :--- | :--- |
| `createAppPasswordAction(input)` | `{ accountId, label }` | Mints a dedicated IMAP/SMTP client password; returns token once. |
| `revokeAppPasswordAction(input)` | `{ accountId, passwordId }` | Revokes specific app password token in Stalwart. |

### Bulk CSV Provisioning Actions
| Action Name | Input Parameters | Description |
| :--- | :--- | :--- |
| `prepareBulkMailboxJobAction(input)` | `{ csvText }` | Parses and validates mailbox CSV; initializes chunked job store session. |
| `prepareBulkForwardingJobAction(input)`| `{ csvText }` | Parses and validates forwarding CSV; checks domain ownership and target syntax. |
| `commitBulkJobChunkAction(input)` | `{ jobId, chunkIndex }` | Commits a single 25-row chunk to Stalwart to avoid gateway timeouts. |
| `getBulkJobAction(jobId)` | `jobId: string` | Fetches real-time progress, processed count, and row errors for a bulk job. |
| `pauseBulkJobAction(jobId)` | `jobId: string` | Pauses an active chunked execution job. |
| `resumeBulkJobAction(jobId)` | `jobId: string` | Resumes a paused bulk execution job. |
| `abortBulkJobAction(jobId)` | `jobId: string` | Aborts remaining chunks and marks job as terminated. |

### Routing & Forwarding Actions
| Action Name | Input Parameters | Description |
| :--- | :--- | :--- |
| `getRoutingOverviewAction()` | None | Aggregates catch-alls, domain aliases, and user forwarders. |
| `upsertForwardingRuleAction(input)` | `{ source, targets, keepLocalCopy, enabled }` | Configures Sieve-based or alias-based email redirection. |
| `destroyForwardingRuleAction(input)` | `{ id: string }` | Removes an active forwarding rule. |
| `updateMailboxAliasesAction(input)` | `{ accountId, aliases: string[] }` | Replaces secondary inbound local-parts delivering into a mailbox. |
| `updateCatchAllAction(input)` | `{ domainId, mode, targetMailboxId? }` | Sets domain catch-all behavior (Address, Bounce, or Blackhole). |
| `updateMailExchangerAction(input)` | `{ domainId, mode: "local"\|"backup"\|"remote" }` | Updates Stalwart `allowRelaying` to reflect MX topology. |

### Filters, Sieve & Logs Actions
| Action Name | Input Parameters | Description |
| :--- | :--- | :--- |
| `getFiltersOverviewAction()` | None | Fetches vacation autoresponders, Sieve filters, and spam settings. |
| `upsertAutoresponderAction(input)` | `{ accountId, enabled, subject, body, startAt?, endAt? }` | Saves vacation / out-of-office autoreply rule. |
| `destroyAutoresponderAction(input)` | `{ id: string }` | Deletes an autoresponder rule. |
| `upsertFilterRuleAction(input)` | `{ accountId, name, conditions, actions, priority }` | Creates or edits a server-side message sorting rule. |
| `destroyFilterRuleAction(input)` | `{ id: string }` | Deletes a message sorting rule. |
| `updateSpamSettingsAction(input)` | `{ domainId?, threshold, discardAboveThreshold }` | Adjusts SpamAssassin / Rspamd scoring rules. |
| `getDeliveryLogsAction()` | None | Reads recent SMTP delivery events and message queue statuses. |
| `getAuditLogsAction()` | None | Reads append-only audit trail from PostgreSQL and `/data/audit.jsonl`. |

---

## 3. User & Access Actions (`src/lib/actions/users.ts`)

| Action Name | Role Required | Description |
| :--- | :--- | :--- |
| `listUsersAction()` | Admin | Returns all console users with role, email, and domain ownerships. |
| `createUserAction(input)` | Admin | Creates a console account with username, email, password, and role. |
| `deleteUserAction(input)` | Admin | Deletes a console user. Cannot delete the primary administrator. |
| `impersonateUserAction(input)` | Admin | Starts an impersonation session; switches active iron-session context. |
| `stopImpersonatingAction()` | Any | Restores the original administrator session context. |
| `adminUpdateUserPasswordAction(input)` | Admin | Administrator forces a password change on a target user account. |
| `adminUpdateUserEmailAction(input)` | Admin | Updates the email address associated with a console user. |
| `primaryAdminSelfUpdatePasswordAction(input)` | Primary Admin | In-account password update for the primary administrator (`yehia`). |
| `setupNoreplyEmailAction(input)` | Admin | Automatically creates a system `noreply@<domain>` mailbox for outbound alerts. |
| `saveSystemEmailSenderAction(input)` | Admin | Saves SMTP host, port, credentials, and from-address for system mail. |
| `getSystemEmailSenderAction()` | Admin | Fetches the configured system outbound SMTP settings. |
| `sendTestVerificationEmailAction(input)` | Admin | Sends an immediate test email to verify outbound SMTP delivery. |
| `requestInAccountPasswordChangeOtpAction()` | User | Sends a 6-digit verification OTP to the user's registered email. |
| `verifyInAccountPasswordChangeOtpAction(input)` | User | Validates the OTP code and mints a short-lived reset token. |
| `completeInAccountPasswordChangeAction(input)` | User | Completes password change using the verified reset token. |

---

## 4. Cloudflare DNS Actions (`src/lib/actions/cloudflare.ts`)

| Action Name | Description |
| :--- | :--- |
| `getCloudflareStatusAction()` | Returns linked Cloudflare accounts, discovered zones, and auto-sync status. |
| `auditNewCloudflareTokenAction(input)` | Tests a candidate API token against Cloudflare's `/user/tokens/verify` and counts zones. |
| `addCloudflareAccountAction(input)` | Stores an audited Cloudflare token in the encrypted account pool. |
| `removeCloudflareAccountAction(input)` | Removes a linked Cloudflare account and deletes stored tokens. |
| `testCloudflareAccountAction(input)` | Re-verifies token permissions and updates zone count. |
| `auditDomainDnsConflictsAction(input)` | Checks zone for conflicting MX or SPF records before provisioning. |
| `getAvailableCloudflareDomainsAction()` | Lists all domains found in Cloudflare zones that can be imported or linked. |
| `provisionCloudflareDnsAction(input)` | Automatically creates MX, SPF, DKIM, DMARC, Webmail CNAME, and Mail A records. |
| `propagateAllWebmailDnsAction()` | Cross-zone automation to ensure `webmail.<domain>` points to mailwart. |

---

## 5. AI Copilot Actions (`src/lib/actions/copilot.ts`)

| Action Name | Description |
| :--- | :--- |
| `getCopilotSettingsAction()` | Retrieves active provider, model selections, base URLs, and configured status. |
| `fetchCopilotModelsAction(input)` | Queries the provider's API (e.g. `/v1/models` or Ollama `/api/tags`) for available models. |
| `saveCopilotSettingsAction(input)` | Validates and persists provider selections and API keys in PostgreSQL. |

---

## 6. Password Reset Actions (`src/lib/actions/password-reset.ts`)

| Action Name | Description |
| :--- | :--- |
| `requestPasswordResetAction(input)` | Generates a 6-digit OTP, hashes it in `password_reset_otps`, and emails the user. |
| `verifyPasswordResetAction(input)` | Verifies the OTP, checks expiration (15m), and returns a single-use reset token. |
| `completePasswordResetAction(input)` | Updates user password in PostgreSQL using the verified reset token. |

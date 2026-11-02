import "server-only"

import { z } from "zod"
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"

import {
  abortBulkJobAction,
  bulkDestroyMailboxesAction,
  bulkResetPasswordsAction,
  bulkSetStorageCapacityAction,
  bulkSuspendMailboxesAction,
  commitBulkJobChunkAction,
  createAppPasswordAction,
  createDomainAction,
  createMailboxAction,
  destroyAutoresponderAction,
  destroyDomainAction,
  destroyFilterRuleAction,
  destroyForwardingRuleAction,
  destroyMailboxAction,
  generateDkimAction,
  generateDmarcAction,
  getAuditLogsAction,
  getBulkJobAction,
  getDeliveryLogsAction,
  getDomainDetailAction,
  getFiltersOverviewAction,
  getHealth,
  getMailboxDetailAction,
  getOverview,
  getRoutingOverviewAction,
  listDomainsAction,
  listMailboxesAction,
  pauseBulkJobAction,
  pollDomainsDnsAction,
  prepareBulkForwardingJobAction,
  prepareBulkMailboxJobAction,
  purgeCatchAllPostmasterAction,
  refreshDomainDnsAction,
  resetMailboxPasswordAction,
  resumeBulkJobAction,
  revokeAppPasswordAction,
  syncCatchAllArchivalAction,
  syncDomainForwardsAction,
  updateCatchAllAction,
  updateDomainAction,
  updateMailboxAction,
  updateMailboxAliasesAction,
  updateMailExchangerAction,
  updateSpamSettingsAction,
  upsertAutoresponderAction,
  upsertFilterRuleAction,
  upsertForwardingRuleAction,
} from "@/lib/actions/mail"

import {
  addCloudflareAccountAction,
  auditDomainDnsConflictsAction,
  getCloudflareStatusAction,
  propagateAllWebmailDnsAction,
  provisionCloudflareDnsAction,
  removeCloudflareAccountAction,
  testCloudflareAccountAction,
} from "@/lib/actions/cloudflare"

import {
  adminUpdateUserEmailAction,
  adminUpdateUserPasswordAction,
  createUserAction,
  deleteUserAction,
  getSystemEmailSenderAction,
  listUsersAction,
  saveSystemEmailSenderAction,
  sendTestVerificationEmailAction,
  setupNoreplyEmailAction,
} from "@/lib/actions/users"

import { probeInternetEgress } from "@/lib/deliverability/engine"
import {
  getLatestDeliverabilityReportAction,
  runDeliverabilityCheckupAction,
} from "@/lib/actions/deliverability"

import {
  deleteMailboxEmail,
  getMailboxEmail,
  listMailboxFolders,
  moveMailboxEmail,
  queryMailboxEmails,
  sendMailboxEmail,
  setMailboxEmailFlags,
} from "@/lib/stalwart/mailbox-jmap"

import { runWithAdminSession } from "@/lib/auth/session"
import { formatMcpTextResponse } from "./types"

// ---------------------------------------------------------------------------
// Execution Helper with Ambient Admin Session
// ---------------------------------------------------------------------------

async function execAdmin<T>(fn: () => Promise<T>, actor = "admin-mcp") {
  return runWithAdminSession(async () => {
    try {
      const res = await fn()
      return formatMcpTextResponse(res)
    } catch (err) {
      return formatMcpTextResponse(
        { error: err instanceof Error ? err.message : String(err) },
        true
      )
    }
  }, actor)
}

// ---------------------------------------------------------------------------
// Tool Registration across All 12 Functional Modules
// ---------------------------------------------------------------------------

export function registerAllMcpTools(server: McpServer) {
  // =========================================================================
  // 1. System & Health
  // =========================================================================
  server.tool(
    "get_health",
    "Probe JMAP, Roundcube, and Rav health, response latency, and reachability.",
    {},
    async () => execAdmin(() => getHealth())
  )

  server.tool(
    "get_overview",
    "Dashboard overview: domain/mailbox counts, dynamically scaled 0.25GB quota summary, unread counts, health, and URLs.",
    {},
    async () => execAdmin(() => getOverview())
  )

  server.tool(
    "get_system_info",
    "Get system endpoints, Stalwart hostnames, webmail URLs, and application environment configurations.",
    {},
    async () =>
      execAdmin(async () => ({
        timestamp: new Date().toISOString(),
        nodeVersion: process.version,
        defaultWebmailClient: process.env.DEFAULT_WEBMAIL_CLIENT || "rav",
        stalwartJmapUrl: process.env.STALWART_JMAP_URL || "http://stalwart-mail:8080/jmap",
        stalwartAdminUiUrl: process.env.STALWART_ADMIN_UI_URL || "https://mail.yehia.dev/admin",
        roundcubeUrl: process.env.ROUNDCUBE_URL || "https://email.yehia.dev/webmail/",
        ravUrl: process.env.RAV_URL || "https://webmail.yehia.dev/",
      }))
  )

  // =========================================================================
  // 2. Domain Operations
  // =========================================================================
  server.tool(
    "list_domains",
    "List all configured mail domains with mailbox counts, enabled state, and DNS status.",
    {},
    async () => execAdmin(() => listDomainsAction())
  )

  server.tool(
    "get_domain",
    "Get detailed information for a specific domain including DNS records, catch-all policy, and mailboxes.",
    {
      domainId: z.string().min(1).describe("The unique domain ID or FQDN"),
    },
    async ({ domainId }) => execAdmin(() => getDomainDetailAction(domainId))
  )

  server.tool(
    "create_domain",
    "Create a new mail domain in Stalwart and optionally auto-provision DNS records in Cloudflare.",
    {
      name: z.string().min(1).describe("Fully qualified domain name, e.g. 'example.com'"),
      description: z.string().optional().describe("Optional operator notes"),
      autoDns: z.boolean().optional().describe("Whether to automatically provision DNS in Cloudflare if linked"),
    },
    async (input) => execAdmin(() => createDomainAction(input))
  )

  server.tool(
    "update_domain",
    "Update domain properties such as enabled state, description, or sub-addressing delimiter.",
    {
      domainId: z.string().min(1).describe("The domain ID to update"),
      description: z.string().optional().describe("Updated description"),
      isEnabled: z.boolean().optional().describe("Enable or suspend the domain"),
      subAddressing: z.string().optional().describe("Sub-addressing delimiter (e.g. '+')"),
    },
    async ({ domainId, ...patch }) => execAdmin(() => updateDomainAction(domainId, patch))
  )

  server.tool(
    "destroy_domain",
    "Permanently delete a domain from Stalwart and clean up database associations.",
    {
      domainId: z.string().min(1).describe("The domain ID to delete"),
      confirmName: z.string().min(1).describe("Type the exact domain name to confirm deletion"),
      force: z.boolean().optional().describe("Force deletion even if mailboxes remain"),
    },
    async ({ domainId, confirmName, force }) =>
      execAdmin(() => destroyDomainAction(domainId, confirmName, force))
  )

  server.tool(
    "refresh_domain_dns",
    "Live query public DNS resolvers (1.1.1.1, 8.8.8.8) to check MX, SPF, DKIM, and DMARC record health.",
    {
      domainName: z.string().min(1).describe("Domain name to query, e.g. 'example.com'"),
    },
    async ({ domainName }) => execAdmin(() => refreshDomainDnsAction(domainName))
  )

  server.tool(
    "poll_domains_dns",
    "Efficiently poll live DNS health checks for multiple domains in batch.",
    {
      domainIds: z.array(z.string()).min(1).describe("List of domain IDs to poll"),
    },
    async ({ domainIds }) => execAdmin(() => pollDomainsDnsAction(domainIds))
  )

  server.tool(
    "generate_dkim",
    "Generate RSA or Ed25519 DKIM keys in Stalwart and retrieve public DNS TXT record guidance.",
    {
      domain: z.string().min(1).describe("Domain name (e.g. 'example.com')"),
      selector: z.string().optional().describe("DKIM selector (e.g. 'default')"),
    },
    async (input) => execAdmin(() => generateDkimAction(input))
  )

  server.tool(
    "generate_dmarc",
    "Generate an RFC 7489 compliant DMARC TXT record string.",
    {
      domain: z.string().min(1).describe("Domain name"),
      policy: z.enum(["none", "quarantine", "reject"]).default("quarantine").describe("DMARC enforcement policy"),
      ruaEmail: z.string().email().optional().describe("Reporting address for aggregate reports"),
      pct: z.number().int().min(1).max(100).optional().describe("Percentage of messages subjected to filtering"),
    },
    async (input) => execAdmin(() => generateDmarcAction(input))
  )

  // =========================================================================
  // 3. Mailbox Management
  // =========================================================================
  server.tool(
    "list_mailboxes",
    "List email accounts across all domains or filtered by a specific domain ID.",
    {
      domainId: z.string().optional().describe("Optional domain ID filter"),
    },
    async ({ domainId }) => execAdmin(() => listMailboxesAction(domainId))
  )

  server.tool(
    "get_mailbox",
    "Get detailed mailbox information including quota, aliases, app passwords, and status.",
    {
      mailboxId: z.string().min(1).describe("The mailbox account ID"),
    },
    async ({ mailboxId }) => execAdmin(() => getMailboxDetailAction(mailboxId))
  )

  server.tool(
    "create_mailbox",
    "Create a new mailbox account. Storage defaults to unmetered infinite capacity if diskQuotaBytes is null/omitted.",
    {
      domainId: z.string().min(1).describe("Domain ID under which the mailbox will be created"),
      local: z.string().min(1).describe("Local-part username, e.g. 'john'"),
      password: z.string().min(6).describe("Account password (at least 6 characters)"),
      diskQuotaBytes: z.number().int().positive().nullable().optional().describe("Quota in bytes, or null for unmetered infinite capacity"),
      description: z.string().optional().describe("Optional operator notes"),
    },
    async (input) => execAdmin(() => createMailboxAction(input))
  )

  server.tool(
    "update_mailbox",
    "Update mailbox storage quota, description, or toggle active/suspended status.",
    {
      mailboxId: z.string().min(1).describe("The mailbox account ID to update"),
      diskQuotaBytes: z.number().int().positive().nullable().optional().describe("Quota in bytes, or null for unmetered infinite capacity"),
      description: z.string().optional().describe("Updated description"),
      isEnabled: z.boolean().optional().describe("Set true to activate, false to suspend"),
    },
    async ({ mailboxId, ...patch }) => execAdmin(() => updateMailboxAction(mailboxId, patch))
  )

  server.tool(
    "destroy_mailbox",
    "Permanently delete a mailbox from Stalwart after email confirmation.",
    {
      mailboxId: z.string().min(1).describe("Mailbox account ID"),
      typedEmail: z.string().email().describe("Type the exact email address to confirm deletion"),
      adminConfirm: z.string().optional().describe("Required if destroying an admin mailbox: 'DESTROY ADMIN'"),
    },
    async ({ mailboxId, typedEmail, adminConfirm }) =>
      execAdmin(() => destroyMailboxAction(mailboxId, typedEmail, { adminConfirm }))
  )

  server.tool(
    "reset_mailbox_password",
    "Reset the credentials for an individual mailbox.",
    {
      mailboxId: z.string().min(1).describe("Mailbox account ID"),
      password: z.string().min(6).describe("New password (at least 6 characters)"),
    },
    async ({ mailboxId, password }) => execAdmin(() => resetMailboxPasswordAction(mailboxId, password))
  )

  server.tool(
    "bulk_destroy_mailboxes",
    "Permanently delete multiple mailboxes in a batch.",
    {
      mailboxIds: z.array(z.string()).min(1).describe("Array of mailbox account IDs to destroy"),
    },
    async ({ mailboxIds }) => execAdmin(() => bulkDestroyMailboxesAction(mailboxIds))
  )

  server.tool(
    "bulk_reset_passwords",
    "Apply a single new password across multiple selected mailboxes.",
    {
      mailboxIds: z.array(z.string()).min(1).describe("Array of mailbox account IDs"),
      password: z.string().min(6).describe("New password to apply to all selected mailboxes"),
    },
    async ({ mailboxIds, password }) => execAdmin(() => bulkResetPasswordsAction(mailboxIds, password))
  )

  server.tool(
    "bulk_suspend_mailboxes",
    "Batch activate or suspend multiple mailboxes.",
    {
      mailboxIds: z.array(z.string()).min(1).describe("Array of mailbox account IDs"),
      suspend: z.boolean().describe("True to suspend, false to activate"),
    },
    async ({ mailboxIds, suspend }) => execAdmin(() => bulkSuspendMailboxesAction(mailboxIds, suspend))
  )

  server.tool(
    "bulk_set_storage_capacity",
    "Set storage capacity across multiple mailboxes in bulk. Pass null for unmetered infinite capacity.",
    {
      mailboxIds: z.array(z.string()).min(1).describe("Array of mailbox account IDs"),
      diskQuotaBytes: z.number().int().positive().nullable().describe("Storage quota in bytes, or null for unmetered infinite capacity"),
    },
    async ({ mailboxIds, diskQuotaBytes }) =>
      execAdmin(() => bulkSetStorageCapacityAction(mailboxIds, diskQuotaBytes))
  )

  // =========================================================================
  // 4. Aliases & Application Passwords
  // =========================================================================
  server.tool(
    "update_mailbox_aliases",
    "Update the list of inbound aliases delivering into a mailbox.",
    {
      accountId: z.string().min(1).describe("Mailbox account ID"),
      aliases: z.array(
        z.object({
          name: z.string().min(1).describe("Local-part alias"),
          domainId: z.string().min(1).describe("Domain ID"),
          enabled: z.boolean().optional(),
          description: z.string().optional(),
        })
      ).describe("List of alias definitions"),
    },
    async ({ accountId, aliases }) => execAdmin(() => updateMailboxAliasesAction(accountId, aliases))
  )

  server.tool(
    "create_app_password",
    "Generate a dedicated application password token for third-party IMAP/SMTP clients.",
    {
      accountId: z.string().min(1).describe("Mailbox account ID"),
      description: z.string().min(1).describe("Label, e.g. 'MacBook Mail.app'"),
    },
    async ({ accountId, description }) => execAdmin(() => createAppPasswordAction(accountId, description))
  )

  server.tool(
    "revoke_app_password",
    "Revoke a dedicated application password token.",
    {
      accountId: z.string().min(1).describe("Mailbox account ID"),
      appPasswordId: z.string().min(1).describe("App password token ID to revoke"),
    },
    async ({ accountId, appPasswordId }) => execAdmin(() => revokeAppPasswordAction(accountId, appPasswordId))
  )

  // =========================================================================
  // 5. Direct Mailbox Access (Emails & Folders over JMAP)
  // =========================================================================
  server.tool(
    "mailbox_list_folders",
    "List all folders in a mailbox (Inbox, Sent, Drafts, Trash, Spam, Archive, custom) with message and unread counts.",
    {
      emailOrAccountId: z.string().min(1).describe("Email address or Stalwart account ID, e.g. 'me@yehia.dev'"),
    },
    async ({ emailOrAccountId }) => execAdmin(() => listMailboxFolders(emailOrAccountId))
  )

  server.tool(
    "mailbox_query_emails",
    "Search and filter emails in a mailbox by sender, recipient, subject, text, date range, read/unread, flagged, or attachment.",
    {
      emailOrAccountId: z.string().min(1).describe("Email address or account ID to query"),
      folderId: z.string().optional().describe("Optional folder ID filter"),
      from: z.string().optional().describe("Filter by sender name or email address substring"),
      to: z.string().optional().describe("Filter by recipient address substring"),
      subject: z.string().optional().describe("Filter by subject line substring"),
      text: z.string().optional().describe("Search within subject, preview, and message body"),
      after: z.string().optional().describe("ISO date string (e.g. '2026-11-01T00:00:00Z') for emails received after"),
      before: z.string().optional().describe("ISO date string for emails received before"),
      isUnread: z.boolean().optional().describe("Filter by unread status (true = only unread, false = only read)"),
      isFlagged: z.boolean().optional().describe("Filter by flagged/starred status"),
      hasAttachment: z.boolean().optional().describe("Filter by presence of attachments"),
      limit: z.number().int().min(1).max(100).default(25).optional().describe("Max number of emails to return (1-100, default: 25)"),
      offset: z.number().int().min(0).default(0).optional().describe("Offset for pagination (default: 0)"),
    },
    async ({ emailOrAccountId, ...filter }) => execAdmin(() => queryMailboxEmails(emailOrAccountId, filter))
  )

  server.tool(
    "mailbox_get_email",
    "Retrieve the full content of an email by ID, including headers, plain text body, HTML body, and attachments metadata.",
    {
      emailOrAccountId: z.string().min(1).describe("Email address or account ID"),
      emailId: z.string().min(1).describe("The unique email message ID"),
    },
    async ({ emailOrAccountId, emailId }) => execAdmin(() => getMailboxEmail(emailOrAccountId, emailId))
  )

  server.tool(
    "mailbox_set_email_flags",
    "Update email flags (mark read/unread, flagged/unflagged, or add/remove custom keywords).",
    {
      emailOrAccountId: z.string().min(1).describe("Email address or account ID"),
      emailId: z.string().min(1).describe("The email message ID"),
      isRead: z.boolean().optional().describe("Set true for read ($seen), false for unread"),
      isFlagged: z.boolean().optional().describe("Set true for flagged/starred ($flagged), false for unflagged"),
      addKeywords: z.array(z.string()).optional().describe("List of custom keywords to add"),
      removeKeywords: z.array(z.string()).optional().describe("List of custom keywords to remove"),
    },
    async ({ emailOrAccountId, emailId, ...flags }) =>
      execAdmin(() => setMailboxEmailFlags(emailOrAccountId, emailId, flags))
  )

  server.tool(
    "mailbox_move_email",
    "Move an email message to a different folder (e.g. Inbox, Archive, Trash, Spam).",
    {
      emailOrAccountId: z.string().min(1).describe("Email address or account ID"),
      emailId: z.string().min(1).describe("The email message ID"),
      targetFolderIdOrRole: z.string().min(1).describe("Target folder ID or standard role: 'inbox', 'archive', 'trash', 'junk', 'drafts'"),
    },
    async ({ emailOrAccountId, emailId, targetFolderIdOrRole }) =>
      execAdmin(() => moveMailboxEmail(emailOrAccountId, emailId, targetFolderIdOrRole))
  )

  server.tool(
    "mailbox_delete_email",
    "Delete an email message (moves to Trash by default, or permanently destroys if permanent is true).",
    {
      emailOrAccountId: z.string().min(1).describe("Email address or account ID"),
      emailId: z.string().min(1).describe("The email message ID"),
      permanent: z.boolean().optional().default(false).describe("If true, permanently destroys message; if false, moves to Trash"),
    },
    async ({ emailOrAccountId, emailId, permanent }) =>
      execAdmin(() => deleteMailboxEmail(emailOrAccountId, emailId, permanent))
  )

  server.tool(
    "mailbox_send_email",
    "Send an outbound email from a mailbox or save it as a draft.",
    {
      emailOrAccountId: z.string().min(1).describe("Sender email address or account ID"),
      to: z.array(z.string().email()).min(1).describe("List of recipient email addresses"),
      subject: z.string().min(1).describe("Email subject line"),
      bodyText: z.string().min(1).describe("Plain text email body"),
      bodyHtml: z.string().optional().describe("Optional HTML formatted email body"),
      cc: z.array(z.string().email()).optional().describe("Optional CC recipients"),
      bcc: z.array(z.string().email()).optional().describe("Optional BCC recipients"),
      isDraft: z.boolean().optional().default(false).describe("If true, saves message as a draft instead of sending"),
    },
    async ({ emailOrAccountId, ...params }) =>
      execAdmin(() => sendMailboxEmail(emailOrAccountId, params))
  )

  // =========================================================================
  // 6. Routing, Forwarding & Catch-Alls
  // =========================================================================
  server.tool(
    "get_routing_overview",
    "Get full routing overview including forwarding rules, domain catch-alls, and aliases.",
    {},
    async () => execAdmin(() => getRoutingOverviewAction())
  )

  server.tool(
    "upsert_forwarding_rule",
    "Create or update an email forwarding rule with target validation and loop prevention.",
    {
      scope: z.enum(["user", "domain"]).describe("Scope: 'user' for single mailbox or 'domain' for all users"),
      domainId: z.string().min(1).describe("Domain ID"),
      source: z.string().min(1).describe("Source address (e.g. 'me@example.com' or '*@example.com')"),
      targets: z.array(z.string().email()).min(1).describe("List of destination email addresses"),
      keepLocalCopy: z.boolean().optional().default(true).describe("Whether to keep a copy in the local mailbox"),
      enabled: z.boolean().optional().default(true).describe("Whether the rule is enabled"),
    },
    async (input) => execAdmin(() => upsertForwardingRuleAction(input))
  )

  server.tool(
    "destroy_forwarding_rule",
    "Delete an active email forwarding rule.",
    {
      id: z.string().min(1).describe("Forwarding rule ID"),
    },
    async ({ id }) => execAdmin(() => destroyForwardingRuleAction(id))
  )

  server.tool(
    "sync_domain_forwards",
    "Force re-synchronize ManageSieve forwarding and archival rules across all mailboxes for a domain.",
    {
      domainId: z.string().min(1).describe("Domain ID"),
    },
    async ({ domainId }) => execAdmin(() => syncDomainForwardsAction(domainId))
  )

  server.tool(
    "update_catch_all",
    "Configure domain catch-all behavior: 'address' (forward to mailbox), 'bounce' (reject at SMTP), or 'blackhole' (discard).",
    {
      domainId: z.string().min(1).describe("Domain ID"),
      mode: z.enum(["address", "bounce", "blackhole"]).describe("Catch-all routing mode"),
      address: z.string().email().optional().describe("Required if mode is 'address': destination mailbox address"),
    },
    async ({ domainId, mode, address }) =>
      execAdmin(() => updateCatchAllAction(domainId, { mode, address }))
  )

  server.tool(
    "sync_catch_all_archival",
    "Toggle automatic archival mirroring: duplicates a copy of all delivered domain emails to the catch-all address.",
    {
      domainId: z.string().min(1).describe("Domain ID"),
      archival: z.boolean().describe("True to enable archival mirroring, false to pause"),
    },
    async ({ domainId, archival }) => execAdmin(() => syncCatchAllArchivalAction(domainId, archival))
  )

  server.tool(
    "purge_catch_all_postmaster",
    "Retroactively purge automated postmaster reports (DMARC, TLS-RPT, NDRs) from catch-all mailboxes.",
    {
      domainId: z.string().optional().describe("Optional domain ID filter; omit to clean across all domains"),
    },
    async ({ domainId }) => execAdmin(() => purgeCatchAllPostmasterAction(domainId))
  )

  server.tool(
    "update_mail_exchanger",
    "Update domain MX routing posture in Stalwart: 'local' (accepts and stores), 'backup' (relays for domain), or 'remote'.",
    {
      domainId: z.string().min(1).describe("Domain ID"),
      mode: z.enum(["local", "backup", "remote"]).describe("Mail exchanger posture"),
    },
    async ({ domainId, mode }) => execAdmin(() => updateMailExchangerAction(domainId, mode))
  )

  // =========================================================================
  // 7. Filters, Sieve Rules & Spam
  // =========================================================================
  server.tool(
    "get_filters_overview",
    "Get autoresponders, Sieve message filters, and spam posture settings.",
    {},
    async () => execAdmin(() => getFiltersOverviewAction())
  )

  server.tool(
    "upsert_autoresponder",
    "Configure a vacation / out-of-office autoreply rule for a mailbox.",
    {
      accountId: z.string().min(1).describe("Mailbox account ID"),
      enabled: z.boolean().default(true).describe("Whether the autoresponder is active"),
      subject: z.string().min(1).describe("Autoreply subject line"),
      body: z.string().min(1).describe("Autoreply message body"),
      startAt: z.string().optional().describe("Optional ISO start timestamp"),
      endAt: z.string().optional().describe("Optional ISO end timestamp"),
    },
    async (input) => execAdmin(() => upsertAutoresponderAction(input))
  )

  server.tool(
    "destroy_autoresponder",
    "Delete a vacation autoresponder rule.",
    {
      id: z.string().min(1).describe("Autoresponder rule ID"),
    },
    async ({ id }) => execAdmin(() => destroyAutoresponderAction(id))
  )

  server.tool(
    "upsert_filter_rule",
    "Create or update a server-side Sieve message sorting rule.",
    {
      id: z.string().optional().describe("Existing rule ID to update"),
      scope: z.enum(["user", "global"]).default("user").describe("Rule scope: 'user' or 'global'"),
      accountId: z.string().optional().describe("Mailbox account ID (required for account scope)"),
      name: z.string().min(1).describe("Rule name"),
      enabled: z.boolean().default(true).describe("Whether rule is active"),
      field: z.enum(["subject", "from", "to", "header"]).describe("Message field to inspect"),
      op: z.enum(["contains", "is", "matches"]).describe("Matching operator"),
      value: z.string().describe("Pattern or string to match"),
      headerName: z.string().optional().describe("Header name if field is 'header'"),
      actionType: z.enum(["fileinto", "discard", "redirect", "keep", "stop"]).describe("Filter action type"),
      folder: z.string().optional().describe("Destination folder if action is 'fileinto'"),
      priority: z.number().int().default(10).optional().describe("Rule execution priority"),
    },
    async ({ id, scope, accountId, name, enabled, field, op, value, headerName, actionType, folder, priority }) =>
      execAdmin(() =>
        upsertFilterRuleAction({
          id,
          scope: scope as "user" | "global",
          accountId,
          name,
          enabled,
          condition: { field, op, value, headerName },
          action: { type: actionType, folder },
          priority,
        })
      )
  )

  server.tool(
    "destroy_filter_rule",
    "Delete a server-side Sieve filter rule.",
    {
      id: z.string().min(1).describe("Filter rule ID"),
    },
    async ({ id }) => execAdmin(() => destroyFilterRuleAction(id))
  )

  server.tool(
    "update_spam_settings",
    "Configure spam scoring sensitivity threshold and auto-discard rules.",
    {
      rejectThreshold: z.number().describe("Spam score at or above which mail is rejected (e.g. 10)"),
      markAsSpamThreshold: z.number().describe("Spam score at or above which mail is flagged/filed to Junk (e.g. 5)"),
      denylist: z.array(z.string()).default([]).describe("Blocked email addresses or domains"),
      allowlist: z.array(z.string()).default([]).describe("Trusted email addresses or domains"),
    },
    async (input) => execAdmin(() => updateSpamSettingsAction(input))
  )

  // =========================================================================
  // 8. Deliverability Suite
  // =========================================================================
  server.tool(
    "run_deliverability_audit",
    "Run comprehensive deliverability audit across domains: DNS, MX, SPF, DKIM, DMARC, rDNS, Blacklists, Ports, and TLS.",
    {
      domainName: z.string().optional().describe("Domain name to audit (default: all configured domains)"),
      externalRecipient: z.string().optional().describe("Optional external recipient address to test delivery against"),
    },
    async ({ domainName, externalRecipient }) =>
      execAdmin(() =>
        runDeliverabilityCheckupAction({
          domains: domainName ? [domainName] : undefined,
          externalRecipient,
        })
      )
  )

  server.tool(
    "get_latest_deliverability_report",
    "Fetch the most recent deliverability suite report with domain scores, DNS records, and issue breakdown.",
    {},
    async () => execAdmin(() => getLatestDeliverabilityReportAction())
  )

  server.tool(
    "probe_internet_egress",
    "Probe outbound internet egress across critical mail ports (25, 465, 587) to verify external ISP connectivity.",
    {},
    async () => execAdmin(() => probeInternetEgress())
  )

  // =========================================================================
  // 9. Cloudflare DNS Automation
  // =========================================================================
  server.tool(
    "get_cloudflare_status",
    "Get linked Cloudflare accounts, discovered zones, and auto-sync status.",
    {},
    async () => execAdmin(() => getCloudflareStatusAction())
  )

  server.tool(
    "add_cloudflare_account",
    "Add a Cloudflare API token to the encrypted multi-account token pool.",
    {
      apiToken: z.string().min(1).describe("Cloudflare API token with Zone:Read and DNS:Edit permissions"),
      accountName: z.string().optional().describe("Account label / nickname"),
      overwriteConflicts: z.boolean().optional().describe("Overwrite conflicting DNS records if needed"),
    },
    async (input) => execAdmin(() => addCloudflareAccountAction(input))
  )

  server.tool(
    "remove_cloudflare_account",
    "Remove a Cloudflare account from the token pool.",
    {
      accountId: z.string().min(1).describe("Cloudflare account ID"),
    },
    async ({ accountId }) => execAdmin(() => removeCloudflareAccountAction({ accountId }))
  )

  server.tool(
    "test_cloudflare_account",
    "Test and re-verify permissions for a stored Cloudflare token.",
    {
      accountId: z.string().min(1).describe("Cloudflare account ID"),
    },
    async ({ accountId }) => execAdmin(() => testCloudflareAccountAction({ accountId }))
  )

  server.tool(
    "audit_dns_conflicts",
    "Audit a domain in Cloudflare for conflicting MX or SPF records before provisioning.",
    {
      domain: z.string().min(1).describe("Domain name to audit in Cloudflare"),
    },
    async ({ domain }) => execAdmin(() => auditDomainDnsConflictsAction({ domain }))
  )

  server.tool(
    "provision_cloudflare_dns",
    "Automatically create all required DNS records (MX, SPF, DKIM, DMARC, Webmail CNAME, Mail A) in Cloudflare.",
    {
      domain: z.string().min(1).describe("Domain name to provision in Cloudflare"),
      selector: z.string().optional().describe("DKIM selector (default: 'default')"),
      forceOverwrite: z.boolean().optional().describe("Force overwrite conflicting DNS records"),
    },
    async (input) => execAdmin(() => provisionCloudflareDnsAction(input))
  )

  server.tool(
    "propagate_webmail_dns",
    "Ensure webmail.<domain> records are propagated across all managed zones.",
    {},
    async () => execAdmin(() => propagateAllWebmailDnsAction())
  )

  // =========================================================================
  // 10. Bulk CSV Jobs
  // =========================================================================
  server.tool(
    "prepare_bulk_mailbox_job",
    "Validate and parse mailbox CSV text. Supports unmetered infinite quota entries.",
    {
      csvText: z.string().min(1).describe("CSV file content: email,password,description,quota"),
      overwritePasswords: z.boolean().optional().default(false).describe("Whether to overwrite passwords of existing mailboxes"),
    },
    async (input) => execAdmin(() => prepareBulkMailboxJobAction(input))
  )

  server.tool(
    "prepare_bulk_forwarding_job",
    "Validate and parse forwarding CSV text.",
    {
      csvText: z.string().min(1).describe("CSV file content: source,targets,keep_local,enabled"),
    },
    async (input) => execAdmin(() => prepareBulkForwardingJobAction(input))
  )

  server.tool(
    "commit_bulk_job_chunk",
    "Execute a single 25-row chunk of an initialized bulk provisioning job.",
    {
      jobId: z.string().min(1).describe("Bulk Job ID"),
      chunkIndex: z.number().int().min(0).describe("Zero-based chunk index"),
    },
    async (input) => execAdmin(() => commitBulkJobChunkAction(input))
  )

  server.tool(
    "get_bulk_job",
    "Check real-time progress, processed counts, and error reports for an active bulk job.",
    {
      jobId: z.string().min(1).describe("Bulk Job ID"),
    },
    async ({ jobId }) => execAdmin(() => getBulkJobAction(jobId))
  )

  server.tool(
    "control_bulk_job",
    "Pause, resume, or abort an active bulk execution job.",
    {
      jobId: z.string().min(1).describe("Bulk Job ID"),
      action: z.enum(["pause", "resume", "abort"]).describe("Control action to perform"),
    },
    async ({ jobId, action }) =>
      execAdmin(async () => {
        if (action === "pause") return pauseBulkJobAction(jobId)
        if (action === "resume") return resumeBulkJobAction(jobId)
        return abortBulkJobAction(jobId)
      })
  )

  // =========================================================================
  // 11. User Administration & Console Accounts
  // =========================================================================
  server.tool(
    "list_users",
    "List all Mailwart console users, assigned roles, emails, and domain ownerships.",
    {},
    async () => execAdmin(() => listUsersAction())
  )

  server.tool(
    "create_user",
    "Create a new console user account.",
    {
      username: z.string().min(1).describe("Console login username"),
      email: z.string().email().describe("User contact email address"),
      password: z.string().min(6).describe("Login password"),
      role: z.enum(["admin", "user"]).default("user").describe("Access role"),
    },
    async (input) => execAdmin(() => createUserAction(input))
  )

  server.tool(
    "delete_user",
    "Delete a console user account. Primary administrator cannot be deleted.",
    {
      userId: z.string().min(1).describe("User ID to delete"),
    },
    async ({ userId }) => execAdmin(() => deleteUserAction({ userId }))
  )

  server.tool(
    "update_user_email",
    "Update the contact email address for a console user.",
    {
      userId: z.string().min(1).describe("User ID"),
      email: z.string().email().describe("New email address"),
    },
    async ({ userId, email }) => execAdmin(() => adminUpdateUserEmailAction(userId, email))
  )

  server.tool(
    "admin_set_user_password",
    "Force reset a password for a target console user account.",
    {
      userId: z.string().min(1).describe("User ID"),
      password: z.string().min(6).describe("New password"),
    },
    async ({ userId, password }) => execAdmin(() => adminUpdateUserPasswordAction(userId, password))
  )

  server.tool(
    "setup_noreply_email",
    "Automatically provision a system noreply@<domain> mailbox for outbound system alerts.",
    {
      domainName: z.string().min(1).describe("Domain name under which to create noreply"),
    },
    async ({ domainName }) => execAdmin(() => setupNoreplyEmailAction(domainName))
  )

  server.tool(
    "save_system_email_sender",
    "Configure outbound SMTP credentials for system notifications and password resets.",
    {
      mailboxEmail: z.string().email().describe("Outbound sender email address"),
      domain: z.string().min(1).describe("Domain name"),
      password: z.string().optional().describe("SMTP auth password"),
      host: z.string().min(1).describe("SMTP host, e.g. 'mail.yehia.dev'"),
      port: z.number().int().default(587).describe("SMTP port, e.g. 587 or 465"),
      secure: z.boolean().default(false).describe("Use TLS / SSL"),
      fromName: z.string().optional().describe("Display sender name"),
    },
    async (input) => execAdmin(() => saveSystemEmailSenderAction(input))
  )

  server.tool(
    "get_system_email_sender",
    "Retrieve the current system outbound SMTP configuration.",
    {},
    async () => execAdmin(() => getSystemEmailSenderAction())
  )

  server.tool(
    "send_test_email",
    "Send an immediate test email to verify outbound SMTP delivery.",
    {
      targetEmail: z.string().email().describe("Destination email address for test email"),
      code: z.string().optional().describe("Optional test verification code"),
    },
    async ({ targetEmail, code }) =>
      execAdmin(() => sendTestVerificationEmailAction({ to: targetEmail, code }))
  )

  // =========================================================================
  // 12. System Logs & Audit Trail
  // =========================================================================
  server.tool(
    "get_delivery_logs",
    "Query recent SMTP message delivery events, queues, and recipient status.",
    {},
    async () => execAdmin(() => getDeliveryLogsAction())
  )

  server.tool(
    "get_audit_logs",
    "Query the immutable administrative audit trail recording all console changes.",
    {},
    async () => execAdmin(() => getAuditLogsAction())
  )
}

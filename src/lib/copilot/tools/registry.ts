import "server-only"

import { z } from "zod"

import {
  abortBulkJobAction,
  bulkDestroyMailboxesAction,
  bulkResetPasswordsAction,
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
  prepareBulkForwardingJobAction,
  prepareBulkMailboxJobAction,
  refreshDomainDnsAction,
  resetMailboxPasswordAction,
  resumeBulkJobAction,
  revokeAppPasswordAction,
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
  ADMIN_DESTROY_CONFIRM,
  bulkJobIdSchema,
  bulkResetPasswordsSchema,
  bulkSuspendSchema,
  commitBulkChunkSchema,
  createAppPasswordSchema,
  createDomainSchema,
  createMailboxSchema,
  destroyByIdSchema,
  destroyDomainSchema,
  destroyForwardingSchema,
  destroyMailboxSchema,
  entityIdSchema,
  generateDkimSchema,
  generateDmarcSchema,
  mailboxIdsSchema,
  prepareBulkForwardingSchema,
  prepareBulkMailboxSchema,
  refreshDnsSchema,
  resetMailboxPasswordSchema,
  revokeAppPasswordSchema,
  updateAliasesSchema,
  updateCatchAllSchema,
  updateDomainSchema,
  updateMailboxSchema,
  updateMailExchangerSchema,
  updateSpamSettingsSchema,
  upsertAutoresponderSchema,
  upsertFilterRuleSchema,
  upsertForwardingSchema,
} from "@/lib/validations"

import { navigateToSchema, resolveNavigateTo } from "./navigate"
import type { CopilotToolDef } from "./types"

const emptyInput = z.object({})

function okHref(
  result: unknown,
  href: (data: Record<string, unknown>) => string | null
): string | null {
  if (
    typeof result !== "object" ||
    result === null ||
    !("ok" in result) ||
    (result as { ok: unknown }).ok !== true ||
    !("data" in result)
  ) {
    return null
  }
  const data = (result as { data: unknown }).data
  if (typeof data !== "object" || data === null) return null
  return href(data as Record<string, unknown>)
}

/**
 * Allowlisted Copilot tools → existing Server Actions (Architecture §16.4).
 * Risk tags feed Phase 5 approval gating.
 */
export const COPILOT_TOOL_DEFS: CopilotToolDef[] = [
  // overview
  {
    name: "get_health",
    category: "overview",
    risk: "read",
    description: "Probe JMAP and Roundcube health (latency, ok/error).",
    inputSchema: emptyInput,
    execute: async () => getHealth(),
  },
  {
    name: "get_overview",
    category: "overview",
    risk: "read",
    description:
      "Dashboard overview: domain/mailbox counts, storage summary, health, domain list.",
    inputSchema: emptyInput,
    execute: async () => getOverview(),
  },

  // domains
  {
    name: "list_domains",
    category: "domains",
    risk: "read",
    description: "List all domains with mailbox counts and enabled state.",
    inputSchema: emptyInput,
    execute: async () => listDomainsAction(),
  },
  {
    name: "get_domain",
    category: "domains",
    risk: "read",
    description: "Get one domain by id including DNS health and mailboxes.",
    inputSchema: z.object({ id: entityIdSchema.describe("Domain id") }),
    execute: async ({ id }) => getDomainDetailAction(id),
    navigate: (result) =>
      okHref(result, (data) => {
        const domain = data.domain
        if (
          typeof domain === "object" &&
          domain !== null &&
          "id" in domain &&
          typeof (domain as { id: unknown }).id === "string"
        ) {
          return `/dashboard/domains/${(domain as { id: string }).id}`
        }
        return null
      }),
  },
  {
    name: "refresh_domain_dns",
    category: "domains",
    risk: "read",
    description: "Refresh DNS health (MX/SPF/DKIM/DMARC) for a domain name.",
    inputSchema: refreshDnsSchema,
    execute: async ({ domainName }) => refreshDomainDnsAction(domainName),
  },
  {
    name: "generate_dkim",
    category: "domains",
    risk: "read",
    description:
      "Generate DKIM DNS TXT guidance. Private key is NOT returned to Copilot — use Domains UI.",
    inputSchema: generateDkimSchema,
    execute: async (input) => generateDkimAction(input),
  },
  {
    name: "generate_dmarc",
    category: "domains",
    risk: "read",
    description: "Generate suggested DMARC and SPF DNS TXT records (paste-only).",
    inputSchema: generateDmarcSchema,
    execute: async (input) => generateDmarcAction(input),
  },
  {
    name: "create_domain",
    category: "domains",
    risk: "write",
    description: "Create a new mail domain.",
    inputSchema: createDomainSchema,
    execute: async (input) => createDomainAction(input),
    navigate: (result) =>
      okHref(result, (data) =>
        typeof data.id === "string" ? `/dashboard/domains/${data.id}` : null
      ),
  },
  {
    name: "update_domain",
    category: "domains",
    risk: "write",
    description:
      "Update domain settings (description, enabled, catch-all, relaying, mail exchanger).",
    inputSchema: updateDomainSchema,
    execute: async ({ id, ...patch }) => updateDomainAction(id, patch),
  },
  {
    name: "suspend_domain",
    category: "domains",
    risk: "write",
    description: "Suspend or re-enable a domain (isEnabled).",
    inputSchema: z.object({
      id: entityIdSchema,
      suspend: z.boolean().describe("true = disable, false = enable"),
    }),
    execute: async ({ id, suspend }) =>
      updateDomainAction(id, { isEnabled: !suspend }),
  },
  {
    name: "destroy_domain",
    category: "domains",
    risk: "destructive",
    description:
      "Permanently destroy a domain. typedName must match. Use force if mailboxes remain.",
    inputSchema: destroyDomainSchema,
    execute: async ({ id, typedName, force }) =>
      destroyDomainAction(id, typedName, force),
  },

  // mailboxes
  {
    name: "list_mailboxes",
    category: "mailboxes",
    risk: "read",
    description: "List mailboxes; optionally filter by domainId.",
    inputSchema: z.object({
      domainId: entityIdSchema.optional().describe("Optional domain id filter"),
    }),
    execute: async ({ domainId }) => listMailboxesAction(domainId),
  },
  {
    name: "get_mailbox",
    category: "mailboxes",
    risk: "read",
    description:
      "Mailbox detail: account, aliases, forwards, app password metadata, Roundcube link.",
    inputSchema: z.object({
      id: entityIdSchema.describe("Mailbox / account id"),
    }),
    execute: async ({ id }) => getMailboxDetailAction(id),
    navigate: (result) =>
      okHref(result, (data) => {
        const account = data.account
        if (
          typeof account === "object" &&
          account !== null &&
          "id" in account &&
          typeof (account as { id: unknown }).id === "string"
        ) {
          return `/dashboard/mailboxes/${(account as { id: string }).id}`
        }
        return null
      }),
  },
  {
    name: "create_mailbox",
    category: "mailboxes",
    risk: "write",
    description:
      "Create a mailbox. Password is set once and never echoed back to Copilot.",
    inputSchema: createMailboxSchema,
    execute: async (input) => createMailboxAction(input),
    navigate: (result) =>
      okHref(result, (data) =>
        typeof data.id === "string" ? `/dashboard/mailboxes/${data.id}` : null
      ),
  },
  {
    name: "update_mailbox",
    category: "mailboxes",
    risk: "write",
    description: "Update mailbox description, disk quota, or enabled state.",
    inputSchema: updateMailboxSchema,
    execute: async ({ id, ...patch }) => updateMailboxAction(id, patch),
  },
  {
    name: "suspend_mailbox",
    category: "mailboxes",
    risk: "write",
    description: "Suspend or re-enable a mailbox.",
    inputSchema: z.object({
      id: entityIdSchema,
      suspend: z.boolean().describe("true = disable, false = enable"),
    }),
    execute: async ({ id, suspend }) =>
      updateMailboxAction(id, { isEnabled: !suspend }),
  },
  {
    name: "set_mailbox_quota",
    category: "mailboxes",
    risk: "write",
    description: "Set disk quota in bytes (null clears / unlimited).",
    inputSchema: z.object({
      id: entityIdSchema,
      diskQuotaBytes: z.number().int().nonnegative().nullable(),
    }),
    execute: async ({ id, diskQuotaBytes }) =>
      updateMailboxAction(id, { diskQuotaBytes }),
  },
  {
    name: "create_app_password",
    category: "mailboxes",
    risk: "write",
    description:
      "Create an app password. Secret is NOT returned to Copilot — copy from mailbox UI.",
    inputSchema: createAppPasswordSchema,
    execute: async ({ accountId, description }) =>
      createAppPasswordAction(accountId, description),
  },
  {
    name: "revoke_app_password",
    category: "mailboxes",
    risk: "write",
    description: "Revoke an existing app password.",
    inputSchema: revokeAppPasswordSchema,
    execute: async ({ accountId, appPasswordId }) =>
      revokeAppPasswordAction(accountId, appPasswordId),
  },
  {
    name: "reset_mailbox_password",
    category: "mailboxes",
    risk: "destructive",
    description: "Reset a mailbox login password. Requires Phase 5 approval.",
    inputSchema: resetMailboxPasswordSchema,
    execute: async ({ id, password }) =>
      resetMailboxPasswordAction(id, password),
  },
  {
    name: "destroy_mailbox",
    category: "mailboxes",
    risk: "destructive",
    description: `Permanently destroy a mailbox. typedEmail must match. Admin needs adminConfirm="${ADMIN_DESTROY_CONFIRM}".`,
    inputSchema: destroyMailboxSchema,
    execute: async ({ id, typedEmail, adminConfirm }) =>
      destroyMailboxAction(id, typedEmail, { adminConfirm }),
  },

  // routing
  {
    name: "get_routing_overview",
    category: "routing",
    risk: "read",
    description:
      "Routing overview: domains, accounts, forwarding/alias/catch-all hints, MX posture.",
    inputSchema: emptyInput,
    execute: async () => getRoutingOverviewAction(),
  },
  {
    name: "upsert_forwarding",
    category: "routing",
    risk: "write",
    description: "Create or update a forwarding rule (user or domain scope).",
    inputSchema: upsertForwardingSchema,
    execute: async (input) => upsertForwardingRuleAction(input),
  },
  {
    name: "destroy_forwarding",
    category: "routing",
    risk: "destructive",
    description: "Delete a forwarding rule by id.",
    inputSchema: destroyForwardingSchema,
    execute: async ({ id }) => destroyForwardingRuleAction(id),
  },
  {
    name: "update_mailbox_aliases",
    category: "routing",
    risk: "write",
    description: "Replace the alias list for a mailbox account.",
    inputSchema: updateAliasesSchema,
    execute: async ({ accountId, aliases }) =>
      updateMailboxAliasesAction(accountId, aliases),
  },
  {
    name: "update_catch_all",
    category: "routing",
    risk: "write",
    description:
      "Set domain catch-all mode: address | bounce | blackhole.",
    inputSchema: updateCatchAllSchema,
    execute: async ({ domainId, mode, address }) =>
      updateCatchAllAction(domainId, { mode, address }),
  },
  {
    name: "update_mail_exchanger",
    category: "routing",
    risk: "write",
    description: "Set domain MX posture: local | backup | remote.",
    inputSchema: updateMailExchangerSchema,
    execute: async ({ domainId, mode }) =>
      updateMailExchangerAction(domainId, mode),
  },

  // filters
  {
    name: "get_filters_overview",
    category: "filters",
    risk: "read",
    description:
      "Filters overview: autoresponders, Sieve rules, spam lists, Sieve availability.",
    inputSchema: emptyInput,
    execute: async () => getFiltersOverviewAction(),
  },
  {
    name: "upsert_autoresponder",
    category: "filters",
    risk: "write",
    description: "Create or update a mailbox autoresponder.",
    inputSchema: upsertAutoresponderSchema,
    execute: async (input) => upsertAutoresponderAction(input),
  },
  {
    name: "destroy_autoresponder",
    category: "filters",
    risk: "destructive",
    description: "Delete an autoresponder by id.",
    inputSchema: destroyByIdSchema,
    execute: async ({ id }) => destroyAutoresponderAction(id),
  },
  {
    name: "upsert_filter_rule",
    category: "filters",
    risk: "write",
    description: "Create or update a Sieve-style filter rule.",
    inputSchema: upsertFilterRuleSchema,
    execute: async (input) => upsertFilterRuleAction(input),
  },
  {
    name: "destroy_filter_rule",
    category: "filters",
    risk: "destructive",
    description: "Delete a filter rule by id.",
    inputSchema: destroyByIdSchema,
    execute: async ({ id }) => destroyFilterRuleAction(id),
  },
  {
    name: "update_spam_settings",
    category: "filters",
    risk: "write",
    description: "Update spam thresholds and deny/allow lists.",
    inputSchema: updateSpamSettingsSchema,
    execute: async (input) => updateSpamSettingsAction(input),
  },

  // bulk
  {
    name: "prepare_bulk_mailboxes",
    category: "bulk",
    risk: "write",
    description:
      "Parse CSV and create a mailbox bulk job (prepare only — does not commit).",
    inputSchema: prepareBulkMailboxSchema,
    execute: async (input) => prepareBulkMailboxJobAction(input),
  },
  {
    name: "prepare_bulk_forwarding",
    category: "bulk",
    risk: "write",
    description:
      "Parse CSV and create a forwarding bulk job (prepare only — does not commit).",
    inputSchema: prepareBulkForwardingSchema,
    execute: async (input) => prepareBulkForwardingJobAction(input),
  },
  {
    name: "get_bulk_job",
    category: "bulk",
    risk: "read",
    description: "Read bulk job status and row outcomes (no passwords).",
    inputSchema: bulkJobIdSchema,
    execute: async ({ jobId }) => getBulkJobAction(jobId),
  },
  {
    name: "abort_bulk_job",
    category: "bulk",
    risk: "write",
    description: "Abort a bulk job.",
    inputSchema: bulkJobIdSchema,
    execute: async ({ jobId }) => abortBulkJobAction(jobId),
  },
  {
    name: "pause_bulk_job",
    category: "bulk",
    risk: "write",
    description: "Pause a bulk job.",
    inputSchema: bulkJobIdSchema,
    execute: async ({ jobId }) => pauseBulkJobAction(jobId),
  },
  {
    name: "resume_bulk_job",
    category: "bulk",
    risk: "write",
    description: "Resume a paused bulk job.",
    inputSchema: bulkJobIdSchema,
    execute: async ({ jobId }) => resumeBulkJobAction(jobId),
  },
  {
    name: "commit_bulk_job_chunk",
    category: "bulk",
    risk: "destructive",
    description:
      "Commit one chunk of a prepared bulk job. Gated for Phase 5 approval.",
    inputSchema: commitBulkChunkSchema,
    execute: async (input) => commitBulkJobChunkAction(input),
  },
  {
    name: "bulk_destroy_mailboxes",
    category: "bulk",
    risk: "destructive",
    description: "Destroy multiple mailboxes by id.",
    inputSchema: z.object({ ids: mailboxIdsSchema }),
    execute: async ({ ids }) => bulkDestroyMailboxesAction(ids),
  },
  {
    name: "bulk_reset_passwords",
    category: "bulk",
    risk: "destructive",
    description: "Reset passwords for multiple mailboxes.",
    inputSchema: bulkResetPasswordsSchema,
    execute: async ({ ids, password }) =>
      bulkResetPasswordsAction(ids, password),
  },
  {
    name: "bulk_suspend_mailboxes",
    category: "bulk",
    risk: "destructive",
    description: "Suspend or unsuspend multiple mailboxes.",
    inputSchema: bulkSuspendSchema,
    execute: async ({ ids, suspend }) =>
      bulkSuspendMailboxesAction(ids, suspend),
  },

  // logs
  {
    name: "get_delivery_logs",
    category: "logs",
    risk: "read",
    description: "Recent SMTP/delivery transaction events.",
    inputSchema: emptyInput,
    execute: async () => getDeliveryLogsAction(),
  },
  {
    name: "get_audit_logs",
    category: "logs",
    risk: "read",
    description: "Operator audit log events.",
    inputSchema: emptyInput,
    execute: async () => getAuditLogsAction(),
  },

  // navigation
  {
    name: "navigate_to",
    category: "navigation",
    risk: "read",
    description:
      "Request left-panel navigation to an allowlisted /dashboard/* path (Phase 4 applies navIntent).",
    inputSchema: navigateToSchema,
    execute: async (input) => resolveNavigateTo(input),
    navigate: (result) => {
      if (
        typeof result === "object" &&
        result !== null &&
        "ok" in result &&
        (result as { ok: unknown }).ok === true &&
        "href" in result &&
        typeof (result as { href: unknown }).href === "string"
      ) {
        return (result as { href: string }).href
      }
      return null
    },
  },
]

export const COPILOT_TOOL_BY_NAME: Record<string, CopilotToolDef> =
  Object.fromEntries(COPILOT_TOOL_DEFS.map((t) => [t.name, t]))

export type CopilotToolName = (typeof COPILOT_TOOL_DEFS)[number]["name"]

export function getCopilotToolDef(name: string): CopilotToolDef | undefined {
  return COPILOT_TOOL_BY_NAME[name]
}

export function listCopilotToolNames(): string[] {
  return COPILOT_TOOL_DEFS.map((t) => t.name)
}

export function listCopilotTools(): Array<{
  name: string
  category: CopilotToolDef["category"]
  risk: CopilotToolDef["risk"]
  description: string
}> {
  return COPILOT_TOOL_DEFS.map((t) => ({
    name: t.name,
    category: t.category,
    risk: t.risk,
    description: t.description,
  }))
}

export function countToolsByCategory(): Record<string, number> {
  const counts: Record<string, number> = {}
  for (const t of COPILOT_TOOL_DEFS) {
    counts[t.category] = (counts[t.category] ?? 0) + 1
  }
  return counts
}

/** Dashboard audit events — Architecture §9.2 JSONL default. */

export type AuditAction =
  | "login"
  | "logout"
  | "domain.create"
  | "domain.update"
  | "domain.destroy"
  | "mailbox.create"
  | "mailbox.update"
  | "mailbox.destroy"
  | "mailbox.password_reset"
  | "mailbox.suspend"
  | "mailbox.aliases_update"
  | "forwarding.upsert"
  | "forwarding.destroy"
  | "catchall.update"
  | "mx.update"
  | "autoresponder.upsert"
  | "autoresponder.destroy"
  | "filter.upsert"
  | "filter.destroy"
  | "spam.update"
  | "bulk.complete"
  | "bulk.abort"
  | "webmail.sso"
  | "app_password.create"
  | "app_password.revoke"
  | "copilot.settings_update"
  | "domain.dns_provision"
  | "cloudflare.settings_update"
  | "deliverability.test_email"
  | "deliverability.test_email_failed"
  | "deliverability.test_suite"
  | "deliverability.test_mailbox_created"
  | "deliverability.test_mailbox_cleaned"
  | "user.create"
  | "user.update"
  | "user.destroy"
  | "user.impersonate"
  | "user.stop_impersonate"

export type AuditEvent = {
  id: string
  /** ISO-8601 timestamp. */
  at: string
  /** Operator username from session (APP_ADMIN_USER). */
  actor: string
  action: AuditAction
  /** Primary resource (email, domain, job id). */
  target?: string
  /** Short human-readable summary. */
  detail?: string
  meta?: Record<string, string | number | boolean | null>
}

export type AuditEventInput = Omit<AuditEvent, "id" | "at"> & {
  at?: string
  id?: string
}

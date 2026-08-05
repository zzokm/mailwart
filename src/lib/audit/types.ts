/** Dashboard audit events — Architecture §9.2 JSONL default. */

export type AuditAction =
  | "login"
  | "logout"
  | "domain.create"
  | "domain.destroy"
  | "mailbox.create"
  | "mailbox.destroy"
  | "mailbox.password_reset"
  | "mailbox.suspend"
  | "bulk.complete"
  | "webmail.sso"
  | "app_password.create"
  | "app_password.revoke"

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

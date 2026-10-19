#!/bin/sh
set -e

# Sanitize existing identities and repair account SMTP/IMAP configurations in all user SQLite databases
if command -v sqlite3 >/dev/null 2>&1; then
  for db in /data/*/db.sqlite; do
    if [ -f "$db" ]; then
      # 1. Strip any %admin impersonator suffix from identities
      sqlite3 "$db" "UPDATE identities SET email = substr(email, 1, instr(email, '%') - 1) WHERE email LIKE '%@%%%';" 2>/dev/null || true

      # 2. Fix SMTP port from legacy 465 to 587 (Stalwart Submission STARTTLS)
      sqlite3 "$db" "UPDATE accounts SET smtp_port = 587 WHERE smtp_port = 465;" 2>/dev/null || true
      sqlite3 "$db" "UPDATE accounts SET smtp_host = 'stalwart-mail' WHERE smtp_host IS NOT NULL AND smtp_host != 'stalwart-mail';" 2>/dev/null || true
      sqlite3 "$db" "UPDATE accounts SET imap_host = 'stalwart-mail' WHERE imap_host IS NOT NULL AND imap_host != 'stalwart-mail';" 2>/dev/null || true

      # 3. Unstick any pending/failed emails in the outbox so the worker immediately retries over port 587
      sqlite3 "$db" "UPDATE outbox SET state = 'scheduled', send_after = strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), fail_reason = NULL WHERE state = 'failed' OR state = 'sending';" 2>/dev/null || true
    fi
  done
fi

exec /app/rav-email-server "$@"

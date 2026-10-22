#!/bin/sh
set -e

# Target mail host for valid TLS certificate verification (defaults to IMAP_HOST or mail.yehia.dev)
TARGET_MAIL_HOST="${IMAP_HOST:-mail.yehia.dev}"
if [ "$TARGET_MAIL_HOST" = "stalwart-mail" ] || [ -z "$TARGET_MAIL_HOST" ]; then
  TARGET_MAIL_HOST="mail.yehia.dev"
fi

TARGET_SMTP_HOST="${SMTP_HOST:-$TARGET_MAIL_HOST}"
if [ "$TARGET_SMTP_HOST" = "stalwart-mail" ] || [ -z "$TARGET_SMTP_HOST" ]; then
  TARGET_SMTP_HOST="$TARGET_MAIL_HOST"
fi

# Sanitize existing identities and repair account SMTP/IMAP configurations in all user SQLite databases
if command -v sqlite3 >/dev/null 2>&1; then
  for db in /data/*/db.sqlite; do
    if [ -f "$db" ]; then
      # 1. Strip any %admin impersonator suffix from identities (only when '%' is present)
      sqlite3 "$db" "UPDATE identities SET email = substr(email, 1, instr(email, '%') - 1) WHERE instr(email, '%') > 0;" 2>/dev/null || true

      # 2. Repair empty or blank identity emails using known_addresses or messages
      sqlite3 "$db" "
        UPDATE identities 
        SET email = (
          SELECT email FROM known_addresses 
          WHERE email LIKE '%@%' AND instr(email, '%') = 0 
          ORDER BY rowid ASC LIMIT 1
        ) 
        WHERE (email = '' OR email IS NULL OR trim(email) = '') 
          AND EXISTS (SELECT 1 FROM known_addresses WHERE email LIKE '%@%' AND instr(email, '%') = 0);
      " 2>/dev/null || true

      sqlite3 "$db" "
        UPDATE identities 
        SET email = (
          SELECT from_address FROM messages 
          WHERE from_address LIKE '%@%' AND instr(from_address, '%') = 0 
          ORDER BY uid DESC LIMIT 1
        ) 
        WHERE (email = '' OR email IS NULL OR trim(email) = '') 
          AND EXISTS (SELECT 1 FROM messages WHERE from_address LIKE '%@%' AND instr(from_address, '%') = 0);
      " 2>/dev/null || true

      # 3. Ensure a default identity exists if table is empty
      sqlite3 "$db" "
        INSERT INTO identities (email, display_name, is_default)
        SELECT email, name, 1
        FROM known_addresses
        WHERE email LIKE '%@%' AND instr(email, '%') = 0
          AND (SELECT COUNT(*) FROM identities WHERE email != '' AND email IS NOT NULL) = 0
        ORDER BY rowid ASC LIMIT 1;
      " 2>/dev/null || true

      # 4. Ensure outbox records point to a valid identity with a non-empty email
      sqlite3 "$db" "
        UPDATE outbox 
        SET from_identity_id = (SELECT id FROM identities WHERE email != '' AND email IS NOT NULL ORDER BY is_default DESC, id ASC LIMIT 1) 
        WHERE from_identity_id IS NULL OR from_identity_id NOT IN (SELECT id FROM identities WHERE email != '' AND email IS NOT NULL);
      " 2>/dev/null || true

      # 5. Fix SMTP port from legacy 465 to 587 (Stalwart Submission STARTTLS)
      sqlite3 "$db" "UPDATE accounts SET smtp_port = 587 WHERE smtp_port = 465;" 2>/dev/null || true

      # 6. Repair imap_host and smtp_host: revert 'stalwart-mail' (which breaks TLS certificate validation) to the valid TLS host
      sqlite3 "$db" "UPDATE accounts SET imap_host = '$TARGET_MAIL_HOST' WHERE imap_host = 'stalwart-mail';" 2>/dev/null || true
      sqlite3 "$db" "UPDATE accounts SET smtp_host = '$TARGET_SMTP_HOST' WHERE smtp_host = 'stalwart-mail';" 2>/dev/null || true

      # 7. Unstick any pending/failed emails in the outbox so the worker immediately retries over port 587
      sqlite3 "$db" "UPDATE outbox SET state = 'scheduled', send_after = strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), fail_reason = NULL WHERE state = 'failed' OR state = 'sending' OR state = 'scheduled';" 2>/dev/null || true
    fi
  done
fi

exec /app/rav-email-server "$@"

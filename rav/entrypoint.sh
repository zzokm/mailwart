#!/bin/sh
set -e

# Sanitize any %admin or impersonator suffix from existing identities in all user SQLite databases
if command -v sqlite3 >/dev/null 2>&1; then
  for db in /data/*/db.sqlite; do
    if [ -f "$db" ]; then
      sqlite3 "$db" "UPDATE identities SET email = substr(email, 1, instr(email, '%') - 1) WHERE email LIKE '%@%%%';" 2>/dev/null || true
    fi
  done
fi

exec /app/rav-email-server "$@"

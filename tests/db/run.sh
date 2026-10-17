#!/usr/bin/env bash
# Testet die Supabase-Migrationen auf einem frischen lokalen Postgres 16.
# Aufruf: npm run test:db
set -euo pipefail
cd "$(dirname "$0")/../.."
BIN=$(ls -d /usr/lib/postgresql/*/bin | sort -V | tail -1)
DIR=$(mktemp -d)
PORT=55432
trap '"$BIN/pg_ctl" -D "$DIR/data" -m immediate stop >/dev/null 2>&1 || true; rm -rf "$DIR"' EXIT
if [ "$(id -u)" = "0" ]; then RUN="runuser -u postgres --"; chown postgres "$DIR"; else RUN=""; fi
$RUN "$BIN/initdb" -D "$DIR/data" -U postgres -A trust >/dev/null
$RUN "$BIN/pg_ctl" -D "$DIR/data" -o "-p $PORT -k $DIR -c listen_addresses=''" -l "$DIR/log" start >/dev/null
PSQL="psql -h $DIR -p $PORT -U postgres -d postgres -v ON_ERROR_STOP=1 -q"
$PSQL -f tests/db/supabase_stub.sql
# Genau die Datei, die im SQL-Editor eingefügt wird
for f in supabase/einrichtung-komplett.sql; do
  echo "Migration: $f"
  $PSQL -f "$f"
done
echo "Tests: tests/db/tests.sql"
$PSQL -f tests/db/tests.sql
echo "Alle Datenbank-Tests bestanden."

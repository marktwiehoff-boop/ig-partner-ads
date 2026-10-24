#!/usr/bin/env bash
# Testet die Supabase-Migrationen und das Einspiel-Werkzeug auf einem
# frischen lokalen Postgres 16.  Aufruf: npm run test:db
set -euo pipefail
cd "$(dirname "$0")/../.."
BIN=$(ls -d /usr/lib/postgresql/*/bin | sort -V | tail -1)
DIR=$(mktemp -d)
PORT=55432
RUN=""
trap '$RUN "$BIN/pg_ctl" -D "$DIR/data" -m immediate stop >/dev/null 2>&1 || true; rm -rf "$DIR"' EXIT
if [ "$(id -u)" = "0" ]; then RUN="runuser -u postgres --"; chown postgres "$DIR"; fi
$RUN "$BIN/initdb" -D "$DIR/data" -U postgres -A trust >/dev/null
$RUN "$BIN/pg_ctl" -D "$DIR/data" -o "-p $PORT -k $DIR -c listen_addresses=''" -l "$DIR/log" start >/dev/null
PSQL="psql -h $DIR -p $PORT -U postgres -v ON_ERROR_STOP=1 -q"

# ---- 1. Die Datei, die im SQL-Editor eingefügt wird, plus Regel-Tests
$PSQL -d postgres -f tests/db/supabase_stub.sql
echo "Migration: supabase/einrichtung-komplett.sql"
$PSQL -d postgres -f supabase/einrichtung-komplett.sql
echo "Tests: tests/db/tests.sql"
$PSQL -d postgres -f tests/db/tests.sql
echo "Alle Datenbank-Tests bestanden."

# ---- 2. Einspiel-Werkzeug (tools/migrieren.mjs) auf frischer Datenbank
URL="postgres://postgres@/werkzeug?host=$DIR&port=$PORT"
$PSQL -d postgres -c "create database werkzeug" >/dev/null
$PSQL -d werkzeug -f tests/db/supabase_stub.sql
echo "Werkzeug: frische Datenbank"
SUPABASE_DB_URL="$URL" CONTEXT=deploy-preview node tools/migrieren.mjs | grep -q "nur der Produktions-Build" || { echo "Vorschau-Build darf nichts ändern"; exit 1; }
SUPABASE_DB_URL="$URL" CONTEXT=production node tools/migrieren.mjs
ANZAHL=$(ls supabase/migrations/*.sql | wc -l | tr -d ' ')
IST=$($PSQL -d werkzeug -tA -c "select count(*) from ads_migrationen")
[ "$IST" = "$ANZAHL" ] || { echo "Erwartet $ANZAHL eingespielte Dateien, sind $IST"; exit 1; }
$PSQL -d werkzeug -tA -c "select count(*) from ads_regions" | grep -qx 3 || { echo "Startregionen fehlen"; exit 1; }
echo "Werkzeug: zweiter Lauf"
SUPABASE_DB_URL="$URL" node tools/migrieren.mjs --erzwingen | grep -q "auf dem Stand" || { echo "Zweiter Lauf müsste nichts tun"; exit 1; }
$PSQL -d werkzeug -f tests/db/tests.sql
echo "Werkzeug: Datenbank aus dem Werkzeug besteht dieselben Tests."

# ---- 3. Von Hand eingerichtete Datenbank (Stand 0001 bis 0006): Werkzeug übernimmt den Bestand, spielt nur Neues ein
URL2="postgres://postgres@/bestand?host=$DIR&port=$PORT"
$PSQL -d postgres -c "create database bestand" >/dev/null
$PSQL -d bestand -f tests/db/supabase_stub.sql
for f in supabase/migrations/000[1-6]_*.sql; do $PSQL -d bestand -f "$f"; done
AUSGABE=$(SUPABASE_DB_URL="$URL2" node tools/migrieren.mjs --erzwingen)
echo "$AUSGABE" | grep -q "Bestand übernommen: 0001_schema.sql, 0002_regeln.sql, 0003_rls.sql, 0004_start_regionen.sql, 0005_speicher.sql, 0006_bildvorlagen.sql" || { echo "Bestand nicht erkannt: $AUSGABE"; exit 1; }
echo "$AUSGABE" | grep -q "eingespielt: 0007_autopilot.sql" || { echo "0007 nicht eingespielt: $AUSGABE"; exit 1; }
$PSQL -d bestand -tA -c "select hinweis from ads_migrationen where name = '0001_schema.sql'" | grep -q "von Hand" || { echo "Hinweis fehlt"; exit 1; }
$PSQL -d bestand -tA -c "select count(*) from ads_autopilot_lauf" | grep -qx 1 || { echo "Autopilot-Tabelle fehlt"; exit 1; }
echo "Werkzeug: Bestand übernommen, nur 0007 neu eingespielt."

# ---- 4. Fehler in einer Datei: nichts davon bleibt, Werkzeug meldet Abbruch
mkdir -p "$DIR/kaputt"
cp supabase/migrations/*.sql "$DIR/kaputt/"
printf 'create table ads_test_kaputt (id int);\nselect 1/0;\n' > "$DIR/kaputt/0099_kaputt.sql"
if SUPABASE_DB_URL="$URL" ORDNER="$DIR/kaputt" node -e "
import('./tools/migrieren.mjs').then(async (m) => {
  const pg = (await import('pg')).default
  const c = new pg.Client(m.verbindung(process.env.SUPABASE_DB_URL)); await c.connect()
  const dateien = m.migrationsDateien(new URL('file://' + process.env.ORDNER + '/'))
  try { await m.migrieren(c, { dateien, log: () => {} }); process.exit(2) }
  catch (e) { if (!/0099_kaputt.sql: division by zero/.test(e.message)) { console.error(e.message); process.exit(3) } }
  finally { await c.end() }
})"; then
  $PSQL -d werkzeug -tA -c "select to_regclass('ads_test_kaputt') is null" | grep -qx t || { echo "Kaputte Datei hätte zurückgerollt werden müssen"; exit 1; }
  echo "Werkzeug: fehlerhafte Datei wird komplett zurückgerollt."
else
  echo "Werkzeug: Fehlerfall nicht wie erwartet"; exit 1
fi

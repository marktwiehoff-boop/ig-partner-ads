#!/usr/bin/env bash
# Ende-zu-Ende-Lauf: echtes Postgres 16 + echtes PostgREST, App-Code unverändert,
# nur Claude, Higgsfield, Meta und GitHub als Attrappen.  Aufruf: npm run test:e2e
set -euo pipefail
cd "$(dirname "$0")/../.."
BIN=$(ls -d /usr/lib/postgresql/*/bin | sort -V | tail -1)
DIR=$(mktemp -d)
PGPORT=${PGPORT_E2E:-55434}
PGRST_PORT=${PGRST_PORT:-3011}
FAKE_PORT=${FAKE_PORT:-3012}
JWT_SECRET="ig-partner-ads-ende-zu-ende-geheimnis-nur-lokal-0123456789"
PGRST_VERSION=v13.0.4
PGRST_BIN="tests/e2e/.bin/postgrest"
PGRST_PID=""

RUN=""
cleanup() {
  [ -n "$PGRST_PID" ] && kill "$PGRST_PID" 2>/dev/null || true
  $RUN "$BIN/pg_ctl" -D "$DIR/data" -m immediate stop >/dev/null 2>&1 || true
  rm -rf "$DIR"
}
trap cleanup EXIT

# PostgREST einmal herunterladen (statische Linux-Binary, nicht im Repo)
if [ ! -x "$PGRST_BIN" ]; then
  mkdir -p tests/e2e/.bin
  echo "Lade PostgREST $PGRST_VERSION ..."
  curl -sSL -o "$DIR/pgrst.tar.xz" "https://github.com/PostgREST/postgrest/releases/download/$PGRST_VERSION/postgrest-$PGRST_VERSION-linux-static-x86-64.tar.xz"
  tar -xJf "$DIR/pgrst.tar.xz" -C tests/e2e/.bin
  chmod +x "$PGRST_BIN"
fi

# Postgres
if [ "$(id -u)" = "0" ]; then RUN="runuser -u postgres --"; chown postgres "$DIR"; fi
$RUN "$BIN/initdb" -D "$DIR/data" -U postgres -A trust >/dev/null
$RUN "$BIN/pg_ctl" -D "$DIR/data" -o "-p $PGPORT -k $DIR -c listen_addresses=127.0.0.1" -l "$DIR/log" start >/dev/null
PSQL="psql -h 127.0.0.1 -p $PGPORT -U postgres -d postgres -v ON_ERROR_STOP=1 -q"
$PSQL -f tests/db/supabase_stub.sql
$PSQL -c "create role authenticator noinherit login password 'pgrst'; grant anon, authenticated, service_role to authenticator;"
# Die SQL-Nachträge kommen über dasselbe Werkzeug wie beim Netlify-Build
SUPABASE_DB_URL="postgres://postgres@127.0.0.1:$PGPORT/postgres" node tools/migrieren.mjs --erzwingen
$PSQL -v vorlage_url="http://127.0.0.1:$FAKE_PORT/vorlage.jpg" -f tests/e2e/seed.sql

# PostgREST
cat > "$DIR/pgrst.conf" <<CONF
db-uri = "postgres://authenticator:pgrst@127.0.0.1:$PGPORT/postgres"
db-schemas = "public"
db-anon-role = "anon"
db-pool = 4
jwt-secret = "$JWT_SECRET"
server-host = "127.0.0.1"
server-port = $PGRST_PORT
log-level = "warn"
CONF
"$PGRST_BIN" "$DIR/pgrst.conf" > "$DIR/pgrst.log" 2>&1 &
PGRST_PID=$!
for i in $(seq 1 50); do
  if curl -sf "http://127.0.0.1:$PGRST_PORT/" >/dev/null 2>&1; then break; fi
  sleep 0.2
done
curl -sf "http://127.0.0.1:$PGRST_PORT/" >/dev/null || { echo "PostgREST startet nicht:"; cat "$DIR/pgrst.log"; exit 1; }

WISSEN=""
[ -d ../igwissen/content ] && WISSEN="$(cd ../igwissen && pwd)"
JWT_SECRET="$JWT_SECRET" PGRST_URL="http://127.0.0.1:$PGRST_PORT" FAKE_PORT="$FAKE_PORT" IGWISSEN_ORDNER="$WISSEN" \
  node tests/e2e/lauf.mjs

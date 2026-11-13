#!/usr/bin/env bash
# Runs the Playwright E2E suite on this computer the way CI does (bugfix/068): the API with the E2E drivers, the frontend BUILT
# (`vite preview`, with the fake payment page) and Mexico City's time (playwright.config.ts). Run it before every push — a new
# E2E must never be tried for the first time in CI.
#
#   scripts/e2e-local.sh                          # Chromium, every spec (what fails most often)
#   scripts/e2e-local.sh e2e/inicio.spec.ts       # some specs
#   E2E_PROJECT=webkit scripts/e2e-local.sh       # another browser
#
# Needs the Clerk development keys in frontend/.env.local (VITE_CLERK_PUBLISHABLE_KEY) and backend/.env.local (CLERK_SECRET_KEY,
# DATABASE_URL — its server and user; the suite uses a database of its own, `peditrack_e2e`, made new on every run), `psql`, and
# nothing else listening on :8080 or :5173. Stops what it started, also on Ctrl+C.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
LOGS="${TMPDIR:-/tmp}/peditrack-e2e"
mkdir -p "$LOGS"
PROJECT="${E2E_PROJECT:-chromium}"

fail() { echo "e2e-local: $*" >&2; exit 1; }

has_key() { grep -Eq "^$2=.+" "$1" 2>/dev/null; }
has_key "$ROOT/frontend/.env.local" VITE_CLERK_PUBLISHABLE_KEY || fail "falta VITE_CLERK_PUBLISHABLE_KEY en frontend/.env.local"
has_key "$ROOT/backend/.env.local" CLERK_SECRET_KEY || fail "falta CLERK_SECRET_KEY en backend/.env.local"

port_busy() { curl -s -o /dev/null --max-time 2 "http://localhost:$1/" && return 0 || return 1; }
port_busy 8080 && fail "algo ya escucha en :8080 (¿un API corriendo?). Deténlo primero."
port_busy 5173 && fail "algo ya escucha en :5173 (¿npm run dev?). Deténlo primero."

API_PID=""
WEB_PID=""
cleanup() {
  [ -n "$WEB_PID" ] && kill "$WEB_PID" 2>/dev/null || true
  [ -n "$API_PID" ] && kill "$API_PID" 2>/dev/null || true
}
trap cleanup EXIT INT TERM

wait_for() {
  local url="$1" name="$2"
  for _ in $(seq 1 90); do
    curl -s -o /dev/null --max-time 2 "$url" && return 0
    sleep 1
  done
  fail "$name no respondió en 90 s (ver $LOGS)"
}

# A database of their own, new on every run, like CI's: the E2E never touch the development database (`pediTrack`), and nothing
# left by earlier runs (thousands of test accounts and devices) slows the API's background jobs down. Same server and user as
# backend/.env.local's DATABASE_URL, another name; dropped and created again, then every migration in order.
DEV_URL="$(grep -E '^DATABASE_URL=' "$ROOT/backend/.env.local" | head -1 | cut -d= -f2- | tr -d '\r')"
[ -n "$DEV_URL" ] || fail "falta DATABASE_URL en backend/.env.local"
command -v psql > /dev/null || fail "falta psql (el cliente de PostgreSQL) para crear la base de las E2E"
E2E_DB="${E2E_DB:-peditrack_e2e}"
# The name goes into a DROP: only `peditrack_e2e…` in lower case, letters, digits and «_» (no quotes, no other database).
[[ "$E2E_DB" =~ ^peditrack_e2e[a-z0-9_]*$ ]] || fail "E2E_DB debe empezar con peditrack_e2e y llevar solo minúsculas, números y _"

# postgres://user:password@host:port/database?options
URL_RE='^(postgres(ql)?)://([^:@/]+)(:([^@]*))?@([^/:?]+)(:([0-9]+))?/([^?]+)(\?.*)?$'
[[ "$DEV_URL" =~ $URL_RE ]] || fail "no entiendo el DATABASE_URL de backend/.env.local (postgres://usuario:clave@servidor:puerto/base)"
DB_USER="${BASH_REMATCH[3]}"
DB_PASSWORD="${BASH_REMATCH[5]}"
DB_HOST="${BASH_REMATCH[6]}"
DB_PORT="${BASH_REMATCH[8]:-5432}"
DEV_DB="${BASH_REMATCH[9]}"
QUERY="${BASH_REMATCH[10]}"
# This script DROPS a database: only ever on this computer's own PostgreSQL, never on a server (DEV in Railway, production…),
# even if backend/.env.local is pointed at one some day.
case "$DB_HOST" in
  localhost | 127.0.0.1 | ::1 | '[::1]') ;;
  *) fail "DATABASE_URL de backend/.env.local apunta a «$DB_HOST»: este script solo crea y borra la base de las E2E en localhost" ;;
esac
[ "$E2E_DB" != "$DEV_DB" ] || fail "E2E_DB no puede ser la base de desarrollo ($DEV_DB)"

E2E_URL="postgres://$DB_USER:$DB_PASSWORD@$DB_HOST:$DB_PORT/$E2E_DB$QUERY"
export DATABASE_URL="$E2E_URL"   # the tests' own queries (setAccountPlan, queryDb in e2e/helpers.ts); an env var, never an argument
# psql gets the password through the environment, so it never shows in the list of processes (`ps`, Task Manager).
psql_e2e() { PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -q -v ON_ERROR_STOP=1 "$@"; }

echo "e2e-local: base nueva $E2E_DB en localhost (la de desarrollo no se toca)…"
psql_e2e -d postgres -c "DROP DATABASE IF EXISTS \"$E2E_DB\" WITH (FORCE)" -c "CREATE DATABASE \"$E2E_DB\"" > "$LOGS/db.log" 2>&1 \
  || fail "no se pudo crear la base $E2E_DB (ver $LOGS/db.log)"
for f in "$ROOT"/backend/migrations/*.sql; do
  psql_e2e -d "$E2E_DB" -f "$f" >> "$LOGS/db.log" 2>&1 || fail "la migración $(basename "$f") falló (ver $LOGS/db.log)"
done

echo "e2e-local: compilando y levantando el API…"
(
  cd "$ROOT/backend"
  set -a
  # shellcheck disable=SC1091
  . ./.env.local
  set +a
  go build -o "$LOGS/api" ./cmd/api
)
(
  cd "$ROOT/backend"
  set -a
  # shellcheck disable=SC1091
  . ./.env.local
  set +a
  # The same drivers as CI's «Start backend API»: no real e-mail, the in-memory payment provider, no weekly digest.
  unset RESEND_API_KEY
  export MAIL_DRIVER=discard PAYMENTS_DRIVER=fake FRONTEND_ORIGIN=http://localhost:5173
  export DATABASE_URL="$E2E_URL"   # .env.local above named the development database
  exec "$LOGS/api"
) > "$LOGS/api.log" 2>&1 &
API_PID=$!
wait_for http://localhost:8080/catalog/countries "El API"

echo "e2e-local: compilando el frontend (como CI)…"
(cd "$ROOT/frontend" && VITE_PAYMENTS_FAKE=true npm run build > "$LOGS/build.log" 2>&1) || fail "el build falló (ver $LOGS/build.log)"
(cd "$ROOT/frontend" && exec node node_modules/vite/bin/vite.js preview --port 5173 --strictPort) > "$LOGS/preview.log" 2>&1 &
WEB_PID=$!
wait_for http://localhost:5173/home "El frontend"

echo "e2e-local: corriendo Playwright ($PROJECT)…"
cd "$ROOT/frontend"
# The servers above are reused (reuseExistingServer is on outside CI). MAIL_DRIVER tells the suite the API discards e-mail.
MAIL_DRIVER=discard npx playwright test --project="$PROJECT" "$@"

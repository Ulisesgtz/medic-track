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
# DATABASE_URL), and nothing else listening on :8080 or :5173. Stops what it started, also on Ctrl+C.
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

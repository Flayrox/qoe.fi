#!/usr/bin/env bash
# L'E2E Playwright sur une base de TEST isolée (qoe_test:55432), JAMAIS sur
# la base de dev (15409). Le spec creator-slugs fait un TRUNCATE CASCADE et
# connected-feed-capture écrit des lignes User : sans cette isolation, chaque
# run vidait la base de dev seedée.
#
# Ce script :
#   0. ouvre le relais vers le stack Supabase de test/dev (VPS Hetzner,
#      127.0.0.1:54321) — aucun `supabase start` local n'est requis
#   1. monte la base de test (docker-compose.test.yml, port 55432) sauf si
#      une base de test y répond déjà (Postgres natif local)
#   2. applique les migrations goose
#   3. seed la base de test avec le seed de BASE (slugs canoniques e2e :
#      souverainete-medias-independants, essai-premium-souverainete …)
#   4. lance la suite complète en 6 vagues (coupure API isolée, oauth isolé,
#      parcours, matrice de routes, apps, matrices d'apps) en pointant
#      DATABASE_URL / API_DATABASE_URL sur qoe_test

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TEST_DATABASE_URL="${TEST_DATABASE_URL:-postgresql://qoe:qoe@127.0.0.1:55432/qoe_test?sslmode=disable}"
export DATABASE_URL="$TEST_DATABASE_URL"
export API_DATABASE_URL="$TEST_DATABASE_URL"

echo "==> Base de test : $TEST_DATABASE_URL"

# 0. Supabase (GoTrue/Kong) de test/dev : stack Hetzner, relayé en loopback.
bash "$ROOT_DIR/scripts/ensure-supabase-hetzner.sh" ensure
trap 'bash "$ROOT_DIR/scripts/ensure-supabase-hetzner.sh" stop' EXIT

# 1. Up + migrations
bash "$ROOT_DIR/scripts/test-db.sh" up
bash "$ROOT_DIR/scripts/test-db.sh" migrate

# 2. Seed de base (seed.go : slugs canoniques attendus par l'e2e)
echo "==> Seed -base (canonique) sur qoe_test"
(cd "$ROOT_DIR/apps/api" && DATABASE_URL="$TEST_DATABASE_URL" go run ./cmd/seed)

# 3. E2E Playwright (les webServer Go/Next héritent de API_DATABASE_URL)
echo "==> Lancement de pnpm e2e (isolé : $TEST_DATABASE_URL)"
cd "$ROOT_DIR"
# 3. E2E Playwright (les webServer Go/Next héritent de API_DATABASE_URL).
# La suite complète du dépôt se joue en vagues, comme la CI : la coupure
# globale de l'API bascule des clés SystemConfig pour TOUS les /v1/* et doit
# donc tourner seule ; routes/hydratation et les apps ont leurs propres builds.
cd "$ROOT_DIR"

# Les builds ne dépendent pas du run : QOE_E2E_SKIP_BUILD=1 les réutilise
# (deuxième passage de vérification, sans reconstruire cinq apps).
if [ "${QOE_E2E_SKIP_BUILD:-0}" != "1" ]; then
  echo "==> Builds de production (core, admin, tenants, studio, hi)"
  QOE_E2E_DEV_ROUTES=1 pnpm intl:compile
  for app in core admin tenants studio hi; do
    QOE_E2E_DEV_ROUTES=1 \
    NEXT_TELEMETRY_DISABLED=1 \
    SKIP_ENV_VALIDATION=true \
    QOE_API_URL="http://localhost:8090" \
    pnpm --filter "@qoe/$app" build
  done
else
  echo "==> Builds réutilisés (QOE_E2E_SKIP_BUILD=1)"
fi

run_default() {
  echo
  echo "==> pnpm e2e $*"
  pnpm e2e "$@" --reporter=list
}

echo
echo "==> Vague 1/6 — coupure globale de l'API (isolée)"
run_default --project=api-access-control

echo
echo "==> Vague 2/6 — consentement OAuth (compte/client fixes, isolé)"
run_default --project=oauth-consent

echo
echo "==> Vague 3/6 — parcours publics, sécurité, contrats, chromium"
RUN_FULL_STACK=1 run_default \
  --project=public-web \
  --project=core-journeys \
  --project=security \
  --project=standalone-contracts \
  --project=chromium \
  --project=like-privacy \
  --project=admin-legal

echo
echo "==> Vague 4/6 — matrice de routes + hydratation (core/admin en prod)"
PLAYWRIGHT_ADMIN_URL="http://admin.lvh.me:15405" \
PLAYWRIGHT_ROUTES_PROD=1 \
run_default --project=routes --project=hydration

echo
echo "==> Vague 5/6 — e2e apps (tenants, studio, admin, hi)"
RUN_FULL_STACK=1 \
PLAYWRIGHT_APPS_PROD=1 \
QOE_E2E_DEV_ROUTES=1 \
QOE_API_URL="http://localhost:8090" \
pnpm exec playwright test --config playwright.apps.config.ts \
  --project=tenants --project=studio --project=admin --project=hi \
  --grep-invert "Matrice de routes" --reporter=list

echo
echo "==> Vague 6/6 — matrices de routes des apps (tenants, studio, hi)"
PLAYWRIGHT_APPS_PROD=1 \
QOE_E2E_DEV_ROUTES=1 \
QOE_API_URL="http://localhost:8090" \
pnpm exec playwright test --config playwright.apps.config.ts \
  --project=tenants --project=studio --project=hi \
  --grep "Matrice de routes" --reporter=list

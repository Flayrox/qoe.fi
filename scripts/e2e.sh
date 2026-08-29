#!/usr/bin/env bash
# L'E2E Playwright sur une base de TEST isolée (qoe_test:55432), JAMAIS sur
# la base de dev (15409). Le spec creator-slugs fait un TRUNCATE CASCADE et
# connected-feed-capture écrit des lignes User : sans cette isolation, chaque
# run vidait la base de dev seedée.
#
# Ce script :
#   1. monte la base de test (docker-compose.test.yml, port 55432)
#   2. applique les migrations goose
#   3. seed la base de test avec le seed de BASE (slugs canoniques e2e :
#      souverainete-medias-independants, essai-premium-souverainete …)
#   4. lance `pnpm e2e` en pointant DATABASE_URL / API_DATABASE_URL sur qoe_test

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TEST_DATABASE_URL="${TEST_DATABASE_URL:-postgresql://qoe:qoe@127.0.0.1:55432/qoe_test?sslmode=disable}"
export DATABASE_URL="$TEST_DATABASE_URL"
export API_DATABASE_URL="$TEST_DATABASE_URL"

echo "==> Base de test : $TEST_DATABASE_URL"

# 1. Up + migrations
bash "$ROOT_DIR/scripts/test-db.sh" up
bash "$ROOT_DIR/scripts/test-db.sh" migrate

# 2. Seed de base (seed.go : slugs canoniques attendus par l'e2e)
echo "==> Seed -base (canonique) sur qoe_test"
(cd "$ROOT_DIR/apps/api" && DATABASE_URL="$TEST_DATABASE_URL" go run ./cmd/seed)

# 3. E2E Playwright (les webServer Go/Next héritent de API_DATABASE_URL)
echo "==> Lancement de pnpm e2e (isolé : $TEST_DATABASE_URL)"
cd "$ROOT_DIR"
pnpm e2e
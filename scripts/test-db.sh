#!/usr/bin/env bash
# Base PostgreSQL de test persistante, totalement separee de la base dev.
# La base cible est qoe_test sur le port 55432 et le volume qoefi-test-postgres-data.

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TEST_DATABASE_URL="${TEST_DATABASE_URL:-postgresql://${TEST_POSTGRES_USER:-qoe}:${TEST_POSTGRES_PASSWORD:-qoe}@127.0.0.1:55432/${TEST_POSTGRES_DB:-qoe_test}?sslmode=disable}"

assert_test_database_url() {
  database="$(printf '%s' "$TEST_DATABASE_URL" | sed 's/[?].*$//' | sed 's#^.*/##')"
  database_lower="$(printf '%s' "$database" | tr '[:upper:]' '[:lower:]')"
  case "$database_lower" in
    *_test) ;;
    *)
      echo "Refus: TEST_DATABASE_URL doit cibler une base *_test (cible: $database)" >&2
      exit 1
      ;;
  esac
}

case "${1:-up}" in
  up)
    docker compose -f "$ROOT_DIR/docker-compose.test.yml" up -d test-db
    ;;
  down)
    docker compose -f "$ROOT_DIR/docker-compose.test.yml" down
    ;;
  reset)
    echo "Reset de la base de TEST uniquement: qoe_test / qoefi-test-postgres-data"
    read -r -p "Tape RESET-TEST pour confirmer: " confirmation
    if [[ "$confirmation" != "RESET-TEST" ]]; then
      echo "Annule."
      exit 1
    fi
    docker compose -f "$ROOT_DIR/docker-compose.test.yml" down -v
    docker compose -f "$ROOT_DIR/docker-compose.test.yml" up -d test-db
    ;;
  migrate)
    assert_test_database_url
    (cd "$ROOT_DIR/apps/api" && DATABASE_URL="$TEST_DATABASE_URL" go run ./cmd/migrate -dir sql/migrations up)
    ;;
  status)
    (cd "$ROOT_DIR/apps/api" && DATABASE_URL="$TEST_DATABASE_URL" go run ./cmd/migrate -dir sql/migrations status)
    ;;
  test)
    assert_test_database_url
    "$0" up
    "$0" migrate
    (cd "$ROOT_DIR/apps/api" && TEST_DATABASE_URL="$TEST_DATABASE_URL" go test -p 1 ./...)
    ;;
  *)
    echo "Usage: $0 {up|down|reset|migrate|status|test}"
    exit 2
    ;;
esac

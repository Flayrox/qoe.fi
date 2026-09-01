#!/usr/bin/env bash
# =====================================================================
# 🧪 Tests d'intégration Go (apps/api)
# =====================================================================
# Les tests d'intégration tournent en deux modes :
#   1. Testcontainers (défaut, aucun env requis) : un conteneur postgres
#      par package → `go test ./...` parallèle sans conflit (mode CI).
#   2. Base partagée Docker (docker-compose.test.yml, port 55432) : plus
#      rapide (un seul conteneur, migrations appliquées une fois), MAIS la
#      base est commune : `go test` lance les packages en parallèle et les
#      TRUNCATE des fixtures se marchent dessus (deadlock SQLSTATE 40P01,
#      clés dupliquées 23505). On force donc `-p 1` pour sérialiser les
#      packages — le comportement correct en base partagée.
#
# Usage : bash scripts/test-api.sh [args go test...]
#   TEST_DATABASE_URL peut être surchargé (doit finir par _test).
# =====================================================================
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

export TEST_DATABASE_URL="${TEST_DATABASE_URL:-postgresql://qoe:qoe@127.0.0.1:55432/qoe_test?sslmode=disable}"

# Port de la base de test (miroir du docker-compose.test.yml).
TEST_DB_PORT="${TEST_DB_PORT:-55432}"

# probe_db: true si le port répond (base déjà up, ou container résiduel d'un
# run précédent qui tient encore le port — on ne tente pas de recreer).
probe_db() {
  (exec 3<>/dev/tcp/127.0.0.1/"$TEST_DB_PORT") 2>/dev/null && { exec 3>&- 3<&- || true; return 0; } || return 1
}

# ensure_test_db: démarre la base de test (docker-compose.test.yml) avec
# retries. Les runners CI peuvent laisser un container à moitié créé tenant
# le port (échec « address already in use ») : on fait un `down` (le volume
# est conservé, les migrations goose sont rejouées par testutil.Pool) puis
# un nouvel essai.
ensure_test_db() {
  if probe_db; then
    echo "→ Base de test déjà joignable sur 127.0.0.1:$TEST_DB_PORT."
    return 0
  fi
  for attempt in 1 2 3; do
    echo "→ Démarrage de la base de test (tentative $attempt/3)…"
    if docker compose -f "$ROOT/docker-compose.test.yml" up -d --wait --wait-timeout 120; then
      return 0
    fi
    echo "→ Tentative $attempt échouée : cleanup du container et nouvel essai…"
    docker compose -f "$ROOT/docker-compose.test.yml" down 2>/dev/null || true
    sleep 8
  done
  echo "✗ Base de test injoignable sur 127.0.0.1:$TEST_DB_PORT" >&2
  return 1
}

ensure_test_db

cd "$ROOT/apps/api"

echo "→ go vet + build…"
go vet ./...
go build ./...

echo "→ go test -p 1 (packages sérialisés : base partagée)…"
# ./... inclurait la racine du module (sans fichiers Go) → "no Go files".
if [ "$#" -gt 0 ]; then
  go test -p 1 -count=1 "$@"
else
  go test -p 1 -count=1 ./cmd/... ./internal/...
fi

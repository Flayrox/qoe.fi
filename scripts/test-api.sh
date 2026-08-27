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

# Démarre la base de test si elle n'est pas déjà up.
if ! docker ps --format '{{.Names}}' 2>/dev/null | grep -q '^qoefi-test-db$'; then
  echo "→ Démarrage de la base de test (docker-compose.test.yml)…"
  docker compose -f "$ROOT/docker-compose.test.yml" up -d --wait --wait-timeout 120
fi

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

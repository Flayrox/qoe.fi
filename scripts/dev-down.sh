#!/usr/bin/env bash
# =============================================================================
# 🛑 dev-down.sh — Arrête le stack de dev local (inverse de dev-up.sh)
# =============================================================================
#   Tue les apps sur les ports de dev, stoppe Supabase local,
#   puis l'infra Docker (db, redis, meilisearch, mongodb, growthbook, umami).
#
# Usage :  pnpm dev:down        (ou ./scripts/dev-down.sh)
# =============================================================================

set -euo pipefail
cd "$(dirname "$0")/.."

INFRA_SERVICES=(db redis meilisearch mongodb growthbook umami)
DEV_PORTS=(15401 15402 15403 15404 15405 15406 15407)

C_GREEN=$'\033[32m'; C_RESET=$'\033[0m'
ok() { echo "${C_GREEN}  ✔ $1${C_RESET}"; }

echo "→ Arrêt des apps (ports ${DEV_PORTS[*]})…"
pids="$(lsof -ti $(printf -- '-i :%s ' "${DEV_PORTS[@]}") 2>/dev/null || true)"
if [ -n "$pids" ]; then
  # shellcheck disable=SC2086
  kill $pids 2>/dev/null || true
  ok "Apps arrêtées"
else
  ok "Aucune app en cours"
fi

echo "→ Arrêt de Supabase…"
supabase stop >/dev/null 2>&1 && ok "Supabase stoppé" || ok "Supabase déjà arrêté"

echo "→ Arrêt de Caddy…"
if pgrep -x caddy >/dev/null 2>&1; then
  pkill -x caddy 2>/dev/null || true
  ok "Caddy arrêté"
else
  ok "Caddy déjà arrêté"
fi

echo "→ Arrêt de l'infra Docker…"
docker compose -f docker-compose.dev.yml stop "${INFRA_SERVICES[@]}" >/dev/null
ok "Infra Docker stoppée (les données/volumes sont conservés)"

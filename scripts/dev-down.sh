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

echo "→ Arrêt de l'infra Docker qoe.fi uniquement (1540x)…"
docker compose -f docker-compose.dev.yml stop "${INFRA_SERVICES[@]}" >/dev/null
ok "Infra qoe.fi stoppée (pg 15409, redis 15410… les autres projets intacts, volumes conservés)"

# Supabase et Caddy sont partagés — on ne les coupe plus par défaut
# (avant ça tuait la moitié de tes apps). Pour tout couper vraiment :
#   ./scripts/dev-down.sh --with-supabase --with-caddy
if [[ "${1:-}" == "--with-supabase" ]]; then
  echo "→ Arrêt de Supabase (opt-in)…"
  supabase stop >/dev/null 2>&1 && ok "Supabase stoppé" || ok "Supabase déjà arrêté"
fi
if [[ "${1:-}" == "--with-caddy" ]]; then
  echo "→ Arrêt de Caddy (opt-in)…"
  if pgrep -x caddy >/dev/null 2>&1; then
    pkill -x caddy 2>/dev/null || true
    ok "Caddy arrêté"
  else
    ok "Caddy déjà arrêté"
  fi
else
  # juste reload pour libérer qoe.test sans tuer les autres vhosts
  if pgrep -x caddy >/dev/null 2>&1; then
    caddy reload --config Caddyfile.dev 2>/dev/null || true
  fi
  ok "Caddy laissé actif (autres projets intacts)"
fi

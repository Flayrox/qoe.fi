#!/usr/bin/env bash
# =============================================================================
# 🧹 dev-clean.sh — Tue les processus orphelins du stack web local
# =============================================================================
#   Supprime les anciennes instances `next dev` (15401-15405) et le
#   collab-server (15406) qui tournent encore et provoquent des conflits
#   de ports EADDRINUSE au prochain `pnpm dev:qoefi`.
#
#   Ce qui est CONSERVÉ :
#     • Infra Docker (db, redis, meilisearch, mongodb, growthbook, umami)
#     • Supabase local (DB/API/Studio)
#     • L'API Go + worker (launchd com.qoefi.api-*)  ← le script dev-up.sh
#       relance ces services lui-même via `launchctl kickstart -k`
#
# Usage :  pnpm dev:clean                                     (nettoyage seul)
#          pnpm dev:qoefi                                     (nettoie seul, si intégré)
#          bash scripts/dev-clean.sh --daemon                 (tue aussi l'API launchd, pour un reset complet)
# =============================================================================

set -uo pipefail
cd "$(dirname "$0")/.."

C_RESET=$'\033[0m'; C_YELLOW=$'\033[33m'; C_GREEN=$'\033[32m'
ok()   { echo "${C_GREEN}  ✔ $1${C_RESET}"; }
warn() { echo "${C_YELLOW}  ⚠ $1${C_RESET}"; }

# Ports des apps Next + collab-server (NE PAS tuer 15407 = API Go)
WEB_PORTS=(15401 15402 15403 15404 15405 15406)

is_infrastructure_process() {
  local command="$1"
  [[ "$command" == *OrbStack* || "$command" == *Docker* || "$command" == *containerd* ]]
}

stop_docker_web_container() {
  local port="$1"
  local container=""
  container="$(docker ps --filter "publish=$port" --format '{{.Names}}' 2>/dev/null | head -1 || true)"
  if [ -n "$container" ]; then
    case "$container" in
      qoefi-dev-core|qoefi-dev-tenants|qoefi-dev-hi|qoefi-dev-studio|qoefi-dev-admin|qoefi-dev-collab-server)
        docker stop "$container" >/dev/null 2>&1 || true
        echo "  → $port container=$container arrêté"
        return 0
        ;;
    esac
  fi
  return 1
}

killed_pids=()
for port in "${WEB_PORTS[@]}"; do
  pid="$(lsof -tiTCP:"$port" -sTCP:LISTEN 2>/dev/null | head -1 || true)"
  if [ -n "$pid" ]; then
    if stop_docker_web_container "$port"; then
      continue
    fi
    cmd="$(ps -p "$pid" -o command= 2>/dev/null | head -c 120 || true)"
    # OrbStack/Docker peut exposer des ports de containers sur l'hôte :
    # ne jamais tuer ce processus système, même si le port d'une app correspond.
    if is_infrastructure_process "$cmd"; then
      warn "$port est exposé par l'infrastructure ($cmd) — processus conservé"
      continue
    fi
    killed_pids+=("$pid")
    kill "$pid" 2>/dev/null || true
    echo "  → $port pid=$pid tué  (${cmd})"
  fi
done

# Les ports exposés par OrbStack/Docker ne sont pas des apps web natives.
# Ils ne doivent pas empêcher dev-up de continuer.
for port in "${WEB_PORTS[@]}"; do
  p="$(lsof -tiTCP:"$port" -sTCP:LISTEN 2>/dev/null | head -1 || true)"
  [ -z "$p" ] && continue
  cmd="$(ps -p "$p" -o command= 2>/dev/null || true)"
  if is_infrastructure_process "$cmd"; then
    continue
  fi
  kill "$p" 2>/dev/null || true
done

# Attend que les ports réellement gérés par les apps soient libérés
for _ in $(seq 1 20); do
  any=0
  for port in "${WEB_PORTS[@]}"; do
    if lsof -tiTCP:"$port" -sTCP:LISTEN >/dev/null 2>&1; then any=1; fi
  done
  [ "$any" = 0 ] && break
  sleep 1
done

leaks=()
for port in "${WEB_PORTS[@]}"; do    p="$(lsof -tiTCP:"$port" -sTCP:LISTEN 2>/dev/null | head -1 || true)"
    cmd="$(ps -p "$p" -o command= 2>/dev/null || true)"
    if [ -n "$p" ] && ! is_infrastructure_process "$cmd"; then leaks+=("$port"); fi

done

if [ "${#killed_pids[@]}" = 0 ]; then
  ok "aucun orphelin détecté — tous les ports 15401-15406 sont libres"
else
  ok "processus nettoyés (${#killed_pids[@]} tués)"
fi

if [ "${#leaks[@]}" -gt 0 ]; then
  warn "ports encore occupés : ${leaks[*]}" >&2
  for port in "${leaks[@]}"; do
    p="$(lsof -tiTCP:"$port" -sTCP:LISTEN 2>/dev/null | head -1)"; [ -n "$p" ] && echo "   $port → pid $p"
  done
  exit 1
fi

exit 0
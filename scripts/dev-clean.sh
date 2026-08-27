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

killed_pids=()
for port in "${WEB_PORTS[@]}"; do
  pid="$(lsof -tiTCP:"$port" -sTCP:LISTEN 2>/dev/null | head -1 || true)"
  if [ -n "$pid" ]; then
    cmd="$(ps -p "$pid" -o command= 2>/dev/null | head -c 60 || true)"
    killed_pids+=("$pid")
    kill "$pid" 2>/dev/null || true
    echo "  → $port pid=$pid tué  (${cmd})"
  fi
done

# Attend que les ports soient réellement libérés
for _ in $(seq 1 20); do
  any=0
  for port in "${WEB_PORTS[@]}"; do
    if lsof -tiTCP:"$port" -sTCP:LISTEN >/dev/null 2>&1; then any=1; fi
  done
  [ "$any" = 0 ] && break
  sleep 1
done

leaks=()
for port in "${WEB_PORTS[@]}"; do
  if lsof -tiTCP:"$port" -sTCP:LISTEN >/dev/null 2>&1; then leaks+=("$port"); fi
done

if [ "${#killed_pids[@]}" = 0 ]; then
  ok "aucun orphelin détecté — tous les ports 15401-15406 sont libres"
else
  ok "processus nettoyés (${#killed_pids[@]} tués)"
fi

if [ "${#leaks[@]}" -gt 0 ]; then
  warn "ports encore occupés (à tuer à la main) : ${leaks[*]}" >&2
  for port in "${leaks[@]}"; do
    p="$(lsof -tiTCP:"$port" -sTCP:LISTEN 2>/dev/null | head -1)"; [ -n "$p" ] && echo "   $port → pid $p"
  done
  exit 1
fi

exit 0
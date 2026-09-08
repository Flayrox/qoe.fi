#!/usr/bin/env bash
# =====================================================================
# 🚀 dev-vps.sh — Démarre toute la stack locale avec l'infra sur le VPS
# =====================================================================
#   1. Démarre Caddy en daemon si besoin (*.qoe.test -> 1540x)
#   2. Synchronise le .env et compile les catalogues i18n
#   3. Lance toutes les applications en parallèle
# =====================================================================

set -euo pipefail
cd "$(dirname "$0")/.."

C_GREEN=$'\033[32m'; C_YELLOW=$'\033[33m'; C_RED=$'\033[31m'; C_BOLD=$'\033[1m'; C_RESET=$'\033[0m'
ok()   { echo "${C_GREEN}  ✔ $1${C_RESET}"; }
warn() { echo "${C_YELLOW}  ⚠ $1${C_RESET}"; }

echo "${C_BOLD}🚀 Démarrage de la stack dev (mode VPS : 116.203.158.47)${C_RESET}"

# 1. Caddy
if pgrep -x caddy >/dev/null 2>&1; then
  caddy reload --config Caddyfile.dev 2>/dev/null && ok "Caddy rechargé (*.qoe.test → 1540x)" || ok "Caddy déjà actif"
else
  if caddy start --config Caddyfile.dev >/dev/null 2>&1; then
    ok "Caddy démarré (*.qoe.test → 1540x)"
  else
    warn "Caddy n'a pas pu démarrer — tu peux lancer manuellement : caddy start --config Caddyfile.dev"
  fi
fi

# 2. Sync .env & i18n
echo "→ Synchronisation du .env et compilation i18n…"
node scripts/copy-env.js >/dev/null
pnpm intl:compile >/dev/null 2>&1 || true
ok "Environnement & traductions prêts"

# 3. Apps Next.js / dev
echo "${C_BOLD}→ Lancement des applications Next.js (Ctrl+C pour arrêter)…${C_RESET}"
echo "   http://qoe.test (core) | http://start.qoe.test (hi) | http://studio.qoe.test (studio)"

pnpm dev

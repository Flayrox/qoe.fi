#!/usr/bin/env bash
# =============================================================================
# 🚀 dev-up.sh — Démarre TOUT le stack de dev local dans le bon ordre
# =============================================================================
#   1. Docker/OrbStack            (si arrêté)
#   2. Infra Docker               (db pgvector, redis, meilisearch, mongodb,
#                                  growthbook, umami — PAS les apps Next,
#                                  elles tournent en natif via turbo)
#   3. Supabase local             (CLI, DB sur 127.0.0.1:54322)
#   4. Jina embeddings            (launchd llama.cpp sur :8081)
#   5. Apps Next.js               (copy-env + lingui + turbo dev --parallel)
#
# Usage :  pnpm dev:up        (ou ./scripts/dev-up.sh)
# Arrêt :  Ctrl+C tue les apps ; `pnpm dev:down` stoppe infra + supabase.
# =============================================================================

set -euo pipefail
cd "$(dirname "$0")/.."

INFRA_SERVICES=(db redis meilisearch mongodb growthbook umami)

C_GREEN=$'\033[32m'; C_YELLOW=$'\033[33m'; C_RED=$'\033[31m'; C_BOLD=$'\033[1m'; C_RESET=$'\033[0m'
ok()   { echo "${C_GREEN}  ✔ $1${C_RESET}"; }
warn() { echo "${C_YELLOW}  ⚠ $1${C_RESET}"; }
fail() { echo "${C_RED}  ✘ $1${C_RESET}" >&2; exit 1; }

echo "${C_BOLD}🚀 qoe.fi dev — démarrage du stack complet${C_RESET}"

# ── 0. Nettoyage des orphelins (évite les EADDRINUSE si un ancien stack tourne) ──
# Désactivable :  QOE_SKIP_CLEAN=1 pnpm dev:qoefi
if [ "${QOE_SKIP_CLEAN:-0}" != 1 ]; then
  echo "→ Nettoyage des process web orphelins (15401-15406)…"
  if bash scripts/dev-clean.sh; then
    ok "stack web propre"
  else
    warn "certains ports restent occupés — tu-les à la main avant de continuer"
  fi
fi

# ── 1. Docker (OrbStack) ─────────────────────────────────────────────────────
if ! docker info >/dev/null 2>&1; then
  echo "→ Démarrage d'OrbStack…"
  open -a OrbStack 2>/dev/null || open -a Docker || fail "Ni OrbStack ni Docker Desktop trouvés"
  for _ in $(seq 1 60); do
    docker info >/dev/null 2>&1 && break
    sleep 2
  done
  docker info >/dev/null 2>&1 || fail "Docker ne répond pas après 2 min"
fi
ok "Docker prêt"

# ── 2. Infra Docker (sans les apps, elles tournent en natif) ────────────────
echo "→ Infra Docker : ${INFRA_SERVICES[*]}…"
docker compose -f docker-compose.dev.yml up -d --remove-orphans --wait --wait-timeout 120 "${INFRA_SERVICES[@]}" >/dev/null \
  || fail "Infra Docker KO (voir docker compose ps)"
ok "Infra prête (pg 15409 · redis 15410 · meili 15408 · growthbook 15412 · umami 15411 — ports 1540x isolés)"

# ── 3. Supabase local ────────────────────────────────────────────────────────
status_out="$(supabase status 2>/dev/null || true)"
if [ -z "$status_out" ] || grep -q '^Stopped services:' <<<"$status_out"; then
  echo "→ Démarrage de Supabase…"
  supabase start >/dev/null || fail "supabase start a échoué"
fi
ok "Supabase prêt (DB 54322 · API 54321 · Studio 54323)"

# ── 4. Jina embeddings (launchd) ────────────────────────────────────────────
if ! curl -sf --max-time 2 http://127.0.0.1:8081/health >/dev/null 2>&1; then
  echo "→ Jina down, relance du service launchd…"
  launchctl kickstart -k "gui/$(id -u)/com.qoefi.embedding-server" 2>/dev/null || true
  for _ in $(seq 1 15); do
    curl -sf --max-time 2 http://127.0.0.1:8081/health >/dev/null 2>&1 && break
    sleep 2
  done
fi
curl -sf --max-time 2 http://127.0.0.1:8081/health >/dev/null 2>&1 \
  && ok "Jina embeddings prêt (:8081)" \
  || warn "Jina embeddings injoignable sur :8081 (la recherche sémantique sera KO)"

# ── 4b. API + worker launchd (détection du stall getcwd) ────────────────
for label in com.qoefi.api-server com.qoefi.api-worker; do
  if ! launchctl print "gui/$(id -u)/$label" >/dev/null 2>&1; then
    launchctl bootstrap "gui/$(id -u)" "scripts/launchd/$label.plist" 2>/dev/null || true
  fi
  launchctl kickstart -k "gui/$(id -u)/$label" 2>/dev/null || true
  case "$label" in
    com.qoefi.api-server) port=15407 ;;   # API Go sur :15407 (QOE_API_URL / NEXT_PUBLIC_API_URL)
    com.qoefi.api-worker) port=0 ;;
  esac
  ready=0
  for _ in $(seq 1 10); do
    if [ "$port" = 0 ] || curl -sf --max-time 2 "http://127.0.0.1:$port/health" >/dev/null 2>&1; then
      ready=1
      break
    fi
    sleep 1
  done
  if [ "$ready" = 1 ]; then
    ok "$label prêt"
  else
    warn "$label ne répond pas après 10s (possible stall getcwd) — voir /tmp/qoefi-api-*.err.log"
  fi
done

# ── 4c. Caddy (reverse-proxy sans port : http://qoe.test, http://start.qoe.test…) ─
if command -v caddy >/dev/null 2>&1; then
  echo "→ Caddy…"
  if pgrep -x caddy >/dev/null 2>&1; then
    caddy reload --config Caddyfile.dev 2>/dev/null && ok "Caddy rechargé (http://qoe.test, http://start.qoe.test…)" || warn "Caddy reload a échoué — relance manuelle : caddy run --config Caddyfile.dev"
  else
    # :80 nécessite sudo sur macOS — on tente sans, sinon on prévient
    if caddy run --config Caddyfile.dev --adapter caddyfile >/tmp/caddy-qoefi.log 2>&1 & then
      sleep 1
      if pgrep -x caddy >/dev/null 2>&1; then
        ok "Caddy prêt (http://qoe.test, http://start.qoe.test, http://*.qoe.test → 1540x)"
      else
        warn "Caddy n'a pas démarré (port 80 protégé ?) — lance : sudo caddy run --config Caddyfile.dev"
        cat /tmp/caddy-qoefi.log 2>/dev/null | tail -5 | sed 's/^/   /'
      fi
    else
      warn "Caddy KO — installe : brew install caddy — puis relance pnpm dev:qoefi"
    fi
  fi
else
  warn "Caddy non installé — http://lvh.me:1540x reste dispo, mais http://qoe.test nécessite : brew install caddy"
fi

# ── 5. Apps (turbo, au premier plan) ─────────────────────────────────────────
echo "${C_BOLD}→ Lancement des apps (Ctrl+C pour tout couper)…${C_RESET}"
echo "   http://qoe.test (ou http://lvh.me) → core:15402 | http://start.qoe.test → hi:15401 | http://studio.qoe.test → studio:15404"
node scripts/copy-env.js && pnpm intl:compile && pnpm exec turbo run dev --parallel

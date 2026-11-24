#!/usr/bin/env bash
# =====================================================================
# 🚀 dev-vps.sh — Démarre toute la stack locale avec l'infra sur le VPS
# =====================================================================
# Modes :
#   --auto   (défaut non-interactif) : direct si joignable, sinon tunnel SSH
#   --direct : connexion directe à 116.203.158.47 (+ relais Supabase :54321)
#   --tunnel : tunnel SSH via `ssh dev` (contourne les pare-feu type fac)
# =====================================================================

set -euo pipefail
cd "$(dirname "$0")/.."

VPS_IP="116.203.158.47"
SSH_HOST="${QOE_VPS_SSH_HOST:-dev}"

C_GREEN=$'\033[32m'; C_YELLOW=$'\033[33m'; C_RED=$'\033[31m'; C_CYAN=$'\033[36m'; C_BOLD=$'\033[1m'; C_RESET=$'\033[0m'
ok()   { echo "${C_GREEN}  ✔ $1${C_RESET}"; }
warn() { echo "${C_YELLOW}  ⚠ $1${C_RESET}"; }
info() { echo "${C_CYAN}  ℹ $1${C_RESET}"; }
err()  { echo "${C_RED}  ✖ $1${C_RESET}"; exit 1; }

MODE=""
for arg in "$@"; do
  case "$arg" in
    --auto)   MODE="auto" ;;
    --direct) MODE="direct" ;;
    --tunnel) MODE="tunnel" ;;
    -h|--help)
      echo "Usage: pnpm dev:vps [--auto | --direct | --tunnel]"
      exit 0
      ;;
    *) err "Option inconnue : $arg (attendu : --auto, --direct ou --tunnel)" ;;
  esac
done

# Sélecteur interactif si aucun drapeau passé et qu'on est dans un TTY
if [ -z "$MODE" ]; then
  if [ -t 0 ]; then
    echo "${C_BOLD}🌐 Mode de connexion au VPS Hetzner ($VPS_IP) :${C_RESET}"
    echo "  1) Auto (détecte le réseau : direct ou tunnel SSH) [défaut]"
    echo "  2) Direct ($VPS_IP + relais Supabase :54321)"
    echo "  3) Tunnel SSH (via '$SSH_HOST' — recommandé sur Wi-Fi bloqué/fac)"
    printf "Choix [1-3] : "
    read -r choice
    case "${choice:-1}" in
      1|"") MODE="auto" ;;
      2)    MODE="direct" ;;
      3)    MODE="tunnel" ;;
      *)    err "Choix invalide : $choice" ;;
    esac
  else
    MODE="auto"
  fi
fi

if [ "$MODE" = "auto" ]; then
  if nc -z -G 2 "$VPS_IP" 15409 >/dev/null 2>&1; then
    MODE="direct"
    info "Réseau ouvert détecté → mode Direct"
  elif ssh -o BatchMode=yes -o ConnectTimeout=3 "$SSH_HOST" true >/dev/null 2>&1; then
    MODE="tunnel"
    info "Port 15409 bloqué, SSH OK → mode Tunnel SSH ($SSH_HOST)"
  else
    err "Impossible de joindre $VPS_IP:15409 ni en direct ni via 'ssh $SSH_HOST'."
  fi
fi

echo "${C_BOLD}🚀 Démarrage de la stack dev (mode VPS : $MODE)${C_RESET}"

BG_PID=""
ENV_MODIFIED=0
cleanup() {
  if [ -n "$BG_PID" ] && kill -0 "$BG_PID" 2>/dev/null; then
    kill "$BG_PID" 2>/dev/null || true
  fi
  if [ "$ENV_MODIFIED" = "1" ] && [ -f .env ]; then
    node -e '
      const fs = require("fs");
      let e = fs.readFileSync(".env", "utf8");
      e = e.replace(/127\.0\.0\.1:(15409|15410|15408)/g, process.argv[1] + ":$1");
      fs.writeFileSync(".env", e);
    ' "$VPS_IP" 2>/dev/null || true
  fi
}
trap cleanup EXIT INT TERM

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

# 1b. Connexion VPS (Tunnel SSH ou Relais Supabase)
if [ "$MODE" = "tunnel" ]; then
  if lsof -tiTCP:15409 -sTCP:LISTEN >/dev/null 2>&1 && lsof -tiTCP:54321 -sTCP:LISTEN >/dev/null 2>&1; then
    ok "Tunnel SSH déjà actif sur 127.0.0.1 (15409/15410/15408/54321)"
  else
    ssh -N -o ExitOnForwardFailure=yes -o ServerAliveInterval=30 \
      -L "127.0.0.1:15409:127.0.0.1:15409" \
      -L "127.0.0.1:15410:127.0.0.1:15410" \
      -L "127.0.0.1:15408:127.0.0.1:15408" \
      -L "127.0.0.1:54321:127.0.0.1:54321" \
      "$SSH_HOST" >/dev/null 2>&1 &
    BG_PID=$!
    for _ in 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15; do
      if lsof -tiTCP:15409 -sTCP:LISTEN >/dev/null 2>&1 && lsof -tiTCP:54321 -sTCP:LISTEN >/dev/null 2>&1; then
        break
      fi
      sleep 0.2
    done
    if lsof -tiTCP:15409 -sTCP:LISTEN >/dev/null 2>&1; then
      ok "Tunnel SSH démarré via '$SSH_HOST' (DB/Redis/Meili/Supabase → 127.0.0.1)"
    else
      err "Le tunnel SSH via '$SSH_HOST' n'a pas pu s'ouvrir"
    fi
  fi
  node -e '
    const fs = require("fs");
    let e = fs.readFileSync(".env", "utf8");
    e = e.replace(new RegExp(process.argv[1].replace(/\./g, "\\.") + ":(15409|15410|15408)", "g"), "127.0.0.1:$1");
    fs.writeFileSync(".env", e);
  ' "$VPS_IP"
  ENV_MODIFIED=1
else
  node -e '
    const fs = require("fs");
    let e = fs.readFileSync(".env", "utf8");
    e = e.replace(/127\.0\.0\.1:(15409|15410|15408)/g, process.argv[1] + ":$1");
    fs.writeFileSync(".env", e);
  ' "$VPS_IP"
  if lsof -tiTCP:54321 -sTCP:LISTEN >/dev/null 2>&1; then
    ok "Supabase déjà joignable sur 127.0.0.1:54321"
  else
    node -e '
      const net = require("net");
      const s = net.createServer((sock) => {
        const remote = net.connect(54321, process.argv[1]);
        sock.on("error", () => remote.destroy());
        remote.on("error", () => sock.destroy());
        sock.pipe(remote);
        remote.pipe(sock);
      });
      s.listen(54321, "127.0.0.1");
    ' "$VPS_IP" >/dev/null 2>&1 &
    BG_PID=$!
    for _ in 1 2 3 4 5 6 7 8 9 10; do
      if lsof -tiTCP:54321 -sTCP:LISTEN >/dev/null 2>&1; then
        break
      fi
      sleep 0.2
    done
    if lsof -tiTCP:54321 -sTCP:LISTEN >/dev/null 2>&1; then
      ok "Relais Supabase démarré (127.0.0.1:54321 → $VPS_IP:54321)"
    else
      warn "Le relais Supabase (127.0.0.1:54321) n'a pas pu démarrer"
    fi
  fi
fi

# 2. Sync .env & i18n
echo "→ Synchronisation du .env et compilation i18n…"
node scripts/copy-env.js >/dev/null
pnpm intl:compile >/dev/null 2>&1 || true
ok "Environnement & traductions prêts"

# 2b. API Go & Worker (launchd)
echo "→ Compilation de l'API Go & Worker…"
mkdir -p "$HOME/.qoefi/bin"
(cd apps/api && go build -o "$HOME/.qoefi/bin/qoe-server" ./cmd/server && go build -o "$HOME/.qoefi/bin/qoe-worker" ./cmd/worker)
for label in com.qoefi.api-server com.qoefi.api-worker; do
  if ! launchctl print "gui/$(id -u)/$label" >/dev/null 2>&1; then
    launchctl bootstrap "gui/$(id -u)" "scripts/launchd/$label.plist" 2>/dev/null || true
  fi
  launchctl kickstart -k "gui/$(id -u)/$label" 2>/dev/null || true
done
ok "API Go & Worker prêts (:15407)"

# 3. Apps Next.js / dev
echo "${C_BOLD}→ Lancement des applications Next.js (Ctrl+C pour arrêter)…${C_RESET}"
echo "   http://qoe.test (core) | http://start.qoe.test (hi) | http://studio.qoe.test (studio) | http://admin.qoe.test (admin :15405)"

pnpm dev

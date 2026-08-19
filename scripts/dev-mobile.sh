#!/usr/bin/env bash
# ==============================================================================
# 🚀 Qoe.fi — Script de Démarrage Intelligent Tout-en-Un pour Mobile
# ==============================================================================
# Automatise à 100% :
# 1. Vérification & démarrage du backend Go (port 8090)
# 2. Configuration des tunnels ADB Reverse Android (8090 & 8081)
# 3. Lancement automatique du simulateur iOS (iPhone) et/ou émulateur Android (Pixel)
# 4. Démarrage fluide du bundler Metro Expo avec cache propre
# ==============================================================================

set -e

# Couleurs pour le terminal
GREEN='\033[0;32m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BOLD='\033[1m'
NC='\033[0m' # No Color

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
API_DIR="$ROOT_DIR/apps/api"
MOBILE_DIR="$ROOT_DIR/apps/mobile"

# Configuration des variables d'environnement utiles
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
export ANDROID_HOME="${ANDROID_HOME:-$HOME/Library/Android/sdk}"
export PATH="$ANDROID_HOME/platform-tools:$ANDROID_HOME/emulator:$PATH"

echo -e "${CYAN}${BOLD}╔═══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${CYAN}${BOLD}║             🚀 QOE.FI — SMART MOBILE LAUNCHER                 ║${NC}"
echo -e "${CYAN}${BOLD}╚═══════════════════════════════════════════════════════════════╝${NC}"

# ─── 1. Gestion des arguments ───
TARGET="metro"
CLEAR_CACHE="false"

for arg in "$@"; do
  case $arg in
    --ios|-i)
      TARGET="ios"
      ;;
    --android|-a)
      TARGET="android"
      ;;
    --all)
      TARGET="all"
      ;;
    --clear|-c)
      CLEAR_CACHE="true"
      ;;
    --help|-h)
      echo -e "\n${BOLD}Utilisation :${NC}"
      echo -e "  ${GREEN}pnpm dev:mobile${NC}             Démarre Backend Go + Tunnel ADB + Metro"
      echo -e "  ${GREEN}pnpm dev:mobile:ios${NC}         Démarre tout + lance sur Simulateur iPhone"
      echo -e "  ${GREEN}pnpm dev:mobile:android${NC}     Démarre tout + lance sur Émulateur Pixel"
      echo -e "  ${GREEN}pnpm dev:mobile:all${NC}         Démarre tout + lance iPhone ET Android"
      echo -e "  ${GREEN}./scripts/dev-mobile.sh -c${NC}  Démarre avec réinitialisation du cache Metro\n"
      exit 0
      ;;
  esac
done

# ─── 2. Vérification & Lancement de l'API Go ───
echo -e "\n${BLUE}🔍 [1/4] Vérification de l'API Go Backend...${NC}"

is_api_running() {
  curl -s --connect-timeout 1 http://localhost:8090/healthz > /dev/null 2>&1
}

if is_api_running; then
  echo -e "  ${GREEN}✓ API Go déjà active sur http://localhost:8090${NC}"
else
  echo -e "  ${YELLOW}⚡ Démarrage du serveur API Go sur le port 8090...${NC}"
  (
    cd "$API_DIR"
    export PORT=8090
    export API_PORT=8090
    go run ./cmd/server > /tmp/qoe_api_go.log 2>&1 &
  )

  # Attente du démarrage de l'API (max 10s)
  RETRIES=0
  until is_api_running || [ $RETRIES -eq 20 ]; do
    sleep 0.5
    RETRIES=$((RETRIES + 1))
  done

  if is_api_running; then
    echo -e "  ${GREEN}✓ API Go démarrée avec succès sur http://localhost:8090${NC}"
  else
    echo -e "  ${RED}⚠️ L'API Go a mis du temps à répondre. Logs disponibles dans /tmp/qoe_api_go.log${NC}"
  fi
fi

# ─── 3. Configuration automatique d'Android (ADB Reverse) ───
echo -e "\n${BLUE}🤖 [2/4] Configuration réseau Android ADB...${NC}"

if command -v adb >/dev/null 2>&1; then
  ADB_DEVICES=$(adb devices 2>/dev/null | grep -v "List of devices" | grep "device$" || true)
  if [ -n "$ADB_DEVICES" ]; then
    echo -e "  ${GREEN}✓ Appareil / Émulateur Android détecté !${NC}"
    adb reverse tcp:8090 tcp:8090 >/dev/null 2>&1 || true
    adb reverse tcp:8081 tcp:8081 >/dev/null 2>&1 || true
    echo -e "  ${GREEN}✓ Tunnels ADB configurés : tcp:8090 (API) & tcp:8081 (Metro)${NC}"
  else
    echo -e "  ${YELLOW}ℹ Aucun appareil Android connecté (tunnels ignorés pour l'instant)${NC}"
  fi
else
  echo -e "  ${YELLOW}ℹ Outil ADB introuvable dans le PATH.${NC}"
fi

# ─── 4. Lancement des simulateurs cibles ───
echo -e "\n${BLUE}📱 [3/4] Préparation des cibles mobiles ($TARGET)...${NC}"

# Cible iOS
if [ "$TARGET" = "ios" ] || [ "$TARGET" = "all" ]; then
  if command -v xcrun >/dev/null 2>&1; then
    echo -e "  ${CYAN}🍎 Ouverture du simulateur iOS...${NC}"
    open -a Simulator >/dev/null 2>&1 || true
    BOOTED_SIM=$(xcrun simctl list devices | grep -i "Booted" | head -n 1 | sed -E 's/.*\(([A-F0-9-]+)\).*/\1/' || true)
    if [ -n "$BOOTED_SIM" ]; then
      echo -e "  ${GREEN}✓ Simulateur actif détecté ($BOOTED_SIM)${NC}"
      # Lance l'app Qoe si déjà installée
      xcrun simctl launch "$BOOTED_SIM" com.anonymous.qoe-mobile >/dev/null 2>&1 || true
    fi
  fi
fi

# Cible Android
if [ "$TARGET" = "android" ] || [ "$TARGET" = "all" ]; then
  if command -v adb >/dev/null 2>&1 && [ -n "$ADB_DEVICES" ]; then
    echo -e "  ${CYAN}🤖 Lancement de l'app sur Android...${NC}"
    adb shell monkey -p com.anonymous.qoe.mobile -c android.intent.category.LAUNCHER 1 >/dev/null 2>&1 || true
  fi
fi

# ─── 5. Lancement de Metro Bundler ───
echo -e "\n${BLUE}⚡ [4/4] Démarrage du Bundler Metro Expo...${NC}"
echo -e "${CYAN}Raccourcis disponibles : [a] Android, [i] iOS, [r] Recharger, [c] Vider le cache${NC}\n"

cd "$MOBILE_DIR"

METRO_FLAGS=""
if [ "$CLEAR_CACHE" = "true" ]; then
  METRO_FLAGS="-c"
fi

exec npx expo start $METRO_FLAGS

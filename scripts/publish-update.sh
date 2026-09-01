#!/usr/bin/env bash
# =====================================================================
# 📦 publish-update.sh — Publie un update OTA expo-updates
# =====================================================================
# Exporte le bundle JS de l'app mobile (ios + android) et le pousse dans
# l'arborescence attendue par le serveur docker/updates :
#
#   data/updates/<runtimeVersion>/<horodatage>/
#     metadata.json   ← dist/metadata.json de `expo export`
#     _expo/… assets/…
#     expoConfig.json ← config Expo publique (extra.expoClient)
#
# Cible par défaut : ./data/updates (bind mount du service `updates`, monté
# sur /app/updates — le serveur attend <runtimeVersion>/<horodatage> À LA
# RACINE du volume, PAS sous un sous-dossier updates/).
# Pour pousser vers le VPS :
#   UPDATES_TARGET=root@vps:/var/www/qoe/data/updates ./scripts/publish-update.sh
#
# ⚠️ Le runtimeVersion (app.json) doit MATCHER celui des builds natifs :
#    incrémentez-le à chaque changement natif (nouveau module, bump SDK).
#    Un update avec un runtimeVersion inconnu est ignoré par l'app.
# =====================================================================
set -euo pipefail

cd "$(dirname "$0")/../apps/mobile"

RUNTIME_VERSION=$(node -p "require('./app.json').expo.runtimeVersion")
TIMESTAMP=$(date +%Y%m%d%H%M%S)
DEST_DIR="$RUNTIME_VERSION/$TIMESTAMP"
OUT=".expo-updates/dist"
STAGING=".expo-updates/staging"

echo "→ Export du bundle (expo export — ios + android)..."
rm -rf "$OUT" "$STAGING"
npx expo export --platform ios --platform android --output-dir "$OUT"

mkdir -p "$STAGING/$DEST_DIR"
cp -r "$OUT/." "$STAGING/$DEST_DIR/"

echo "→ Génération d'expoConfig.json (extra.expoClient)..."
node -e "
const { getConfig } = require('@expo/config');
const { exp } = getConfig(process.cwd(), { skipSDKVersionRequirement: true, isPublicConfig: true });
process.stdout.write(JSON.stringify(exp));
" > "$STAGING/$DEST_DIR/expoConfig.json"

if [ -z "${UPDATES_TARGET:-}" ]; then
  UPDATES_TARGET="$(cd ../.. && pwd)/data/updates"
fi
mkdir -p "$UPDATES_TARGET"

echo "→ rsync vers $UPDATES_TARGET"
rsync -a "$STAGING/" "$UPDATES_TARGET/"

echo
echo "✅ Update publié : $DEST_DIR"
echo "   Cible          : $UPDATES_TARGET"
echo "   Runtime version: $RUNTIME_VERSION"
echo "   (Redémarrez l'app release pour qu'elle le télécharge.)"

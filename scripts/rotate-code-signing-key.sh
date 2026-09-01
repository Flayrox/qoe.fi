#!/usr/bin/env bash
# =====================================================================
# 🔑 rotate-code-signing-key.sh — Rotation de la clé de code signing OTA
# =====================================================================
# Compromission ou rotation préventive de la paire RSA qui signe les
# manifests expo-updates (docs/OTA_UPDATES.md §6).
#
# ⚠️ PRINCIPE : un build natif embarque le certificat PUBLIC. Changer de
#    clé invalide donc TOUS les clients existants → cette rotation :
#      1. sauvegarde l'ancienne paire (critique : la clé privée est
#         gitignorée et n'existe que sur ce poste + le VPS)
#      2. génère une nouvelle paire (10 ans, CN « Qoe »)
#      3. bump le runtimeVersion (les anciennes apps ignorent les
#         updates signés avec la nouvelle clé au lieu d'échouer)
#      4. synchronise les projets natifs (nouveau certificat embarqué)
#
# Ensuite (manuel, documenté ci-dessous) : commit du certificat public,
# build + soumission store de la nouvelle version native, déploiement
# (pousse la nouvelle clé privée sur le VPS), puis publish des updates.
# =====================================================================
set -euo pipefail

cd "$(dirname "$0")/.."

MOBILE="apps/mobile"
KEYS_DIR="$MOBILE/keys"
CERTS_DIR="$MOBILE/certs"
CERT="$CERTS_DIR/certificate.pem"
APP_JSON="$MOBILE/app.json"
TIMESTAMP="$(date +%Y%m%d%H%M%S)"

if [ ! -f "$CERT" ] || [ ! -f "$KEYS_DIR/private-key.pem" ]; then
  echo "❌ Paire introuvable ($CERT / $KEYS_DIR/private-key.pem)." >&2
  echo "   Exécuter depuis la racine du repo." >&2
  exit 1
fi

echo "→ 1/5 Sauvegarde de la paire existante…"
BACKUP="$KEYS_DIR/backup-$TIMESTAMP"
mkdir -p "$BACKUP"
cp -a "$KEYS_DIR/." "$BACKUP/"
cp -a "$CERTS_DIR/." "$BACKUP/"
chmod -R u+rwX,go-rwx "$BACKUP"
echo "   ✅ $BACKUP"
echo "   ⚠️  Sauvegardez ce dossier hors du repo (coffre/KMS) : sans l'ancienne"
echo "      clé privée, les clients pas encore migrés ne pourront plus être signés."

echo "→ 2/5 Génération d'une nouvelle paire (10 ans, CN « Qoe »)…"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
(
  cd "$MOBILE"
  npx expo-updates codesigning:generate \
    --key-output-directory "$TMP/keys" \
    --certificate-output-directory "$TMP/certs" \
    --certificate-validity-duration-years 10 \
    --certificate-common-name "Qoe"
)
mv "$TMP/keys/private-key.pem" "$KEYS_DIR/private-key.pem"
if [ -f "$TMP/keys/public-key.pem" ]; then
  mv "$TMP/keys/public-key.pem" "$KEYS_DIR/public-key.pem"
fi
mv "$TMP/certs/certificate.pem" "$CERTS_DIR/certificate.pem"
chmod 600 "$KEYS_DIR/private-key.pem"
echo "   ✅ Nouvelle paire en place (clé privée gitignorée, cert committable)."

echo "→ 3/5 Bump du runtimeVersion ($APP_JSON)…"
node - <<'EOF'
const fs = require('fs');
const file = 'apps/mobile/app.json';
const config = JSON.parse(fs.readFileSync(file, 'utf8'));
const current = String(config.expo.runtimeVersion || '1.0.0');
const [major, minor, patch] = current.split('.').map((n) => Number(n) || 0);
const next = `${major}.${minor}.${patch + 1}`;
config.expo.runtimeVersion = next;
fs.writeFileSync(file, JSON.stringify(config, null, 2) + '\n');
console.log(`   runtimeVersion: ${current} → ${next}`);
EOF

if [ "${SKIP_PREBUILD:-}" != "1" ]; then
  echo "→ 4/5 Synchronisation des projets natifs (nouveau certificat embarqué)…"
  (
    cd "$MOBILE"
    npx expo prebuild --platform ios --platform android --no-install
  )
  echo "   ✅ ios/ + android/ régénérés (dossiers gitignorés — CNG)."
else
  echo "→ 4/5 SKIP_PREBUILD=1 — projets natifs non régénérés."
fi

echo
echo "✅ Rotation terminée. Étapes restantes (docs/OTA_UPDATES.md §6) :"
echo "   1. Commit : le certificat public ($CERT) EST committé (embarqué dans"
echo "      les builds) + app.json (runtimeVersion bumpé)."
echo "   2. Build + soumission store de la nouvelle version native"
echo "      (elle embarque le nouveau certificat)."
echo "   3. Déploiement : bash scripts/deploy-prod.sh (pousse la NOUVELLE clé"
echo "      privée sur le VPS via scp — data/updates-signing-key.pem)."
echo "   4. Publish des prochains updates : bash scripts/publish-update.sh"
echo "      (ils porteront le nouveau runtimeVersion)."
echo "   ⚠️ Gardez $BACKUP jusqu'à migration de tous les clients :"
echo "      un client ancien + update signé nouvelle clé = échec de vérification,"
echo "      l'app reste sur son bundle embarqué (pas de crash)."
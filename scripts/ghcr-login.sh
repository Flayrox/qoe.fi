#!/bin/bash
# =====================================================================
# 🔑 ghcr-login.sh — Login GHCR via GitHub App (aucun PAT long-lived)
# =====================================================================
# Le VPS se connecte à GHCR avec un token d'INSTALLATION (TTL 1 h)
# minté à la volée par une GitHub App → pas de mot de passe permanent à
# rotater ; la clé privée ne peut produire que des tokens courts et
# révocables (suppression de la clé / désinstallation de l'app).
#
# Prérequis GitHub (une seule fois, ~3 min — voir docs/VPS_DEPLOYMENT_PREP.md §15) :
#   1. Settings → Developer settings → GitHub Apps → New GitHub App :
#      - Permissions → Packages : Read-only (+ Metadata read automatique)
#      - Installer sur le repo Flayrox/qoe.fi
#   2. Generate a private key → .pem
#   3. Sur le VPS :
#        install -m 600 <qoe-ci.pem> /root/ghcr-app.pem
#        cat > /root/ghcr-app.env <<'EOF'
#        GHCR_APP_ID=123456
#        GHCR_INSTALLATION_ID=12345678
#        GHCR_APP_SLUG=qoe-ci-bot
#        EOF
#        (GHCR_APP_SLUG = username docker login, valeur arbitraire non vide)
#
# ⚠️ Ne JAMAIS committer /root/ghcr-app.pem ni /root/ghcr-app.env.
# =====================================================================
set -euo pipefail

ENV_FILE="${GHCR_ENV_FILE:-/root/ghcr-app.env}"
KEY_FILE="${GHCR_KEY_FILE:-/root/ghcr-app.pem}"

[ -f "$ENV_FILE" ] || { echo "❌ $ENV_FILE absent — voir docs/VPS_DEPLOYMENT_PREP.md §15" >&2; exit 1; }
# shellcheck disable=SC1090
. "$ENV_FILE"
[ -f "$KEY_FILE" ] || { echo "❌ $KEY_FILE absent (chmod 600 requis)" >&2; exit 1; }
: "${GHCR_APP_ID:?GHCR_APP_ID manquant dans $ENV_FILE}"
: "${GHCR_INSTALLATION_ID:?GHCR_INSTALLATION_ID manquant dans $ENV_FILE}"
: "${GHCR_APP_SLUG:?GHCR_APP_SLUG manquant dans $ENV_FILE}"

# 1) JWT RS256 (TTL 9 min, le temps de l'échange) signé avec la clé privée.
NOW=$(date +%s)
HEADER='{"alg":"RS256","typ":"JWT"}'
PAYLOAD=$(python3 -c "import json; print(json.dumps({'iat':$NOW,'exp':$NOW+540,'iss':$GHCR_APP_ID}))")
b64() { openssl base64 -A | tr '+/' '-_' | tr -d '='; }
B64H=$(printf '%s' "$HEADER" | b64)
B64P=$(printf '%s' "$PAYLOAD" | b64)
SIG=$(printf '%s.%s' "$B64H" "$B64P" | openssl dgst -sha256 -sign "$KEY_FILE" -binary | b64)
JWT="$B64H.$B64P.$SIG"

# 2) Échange JWT → token d'installation (TTL 1 h).
TOKEN=$(curl -fsSL -X POST \
  -H "Authorization: Bearer $JWT" \
  -H "Accept: application/vnd.github+json" \
  -H "X-GitHub-Api-Version: 2022-11-28" \
  "https://api.github.com/app/installations/$GHCR_INSTALLATION_ID/access_tokens" \
  | python3 -c "import json,sys; print(json.load(sys.stdin)['token'])")

# 3) docker login GHCR (token jamais affiché, passé par stdin).
echo "$TOKEN" | docker login ghcr.io -u "$GHCR_APP_SLUG" --password-stdin >/dev/null
echo "✅ docker login ghcr.io OK (token d'installation GitHub App, TTL 1h)"
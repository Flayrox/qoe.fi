#!/bin/bash
# =====================================================================
# 🚀 deploy-prod.sh — Déploiement production pour QOE depuis ta machine
# =====================================================================
# 📖 Usage :
#     bash scripts/deploy-prod.sh                 # déploiement complet
#     bash scripts/deploy-prod.sh --skip-pull     # saute le pull (images déjà à jour)
#     bash scripts/deploy-prod.sh --credentials   # affiche l'inventaire des accès
#                                                  # (mails, supabase, meili, umami…) — ne
#                                                  # déploie rien. Référentiel : docs/CREDENTIALS.md
#     bash scripts/deploy-prod.sh core studio     # DÉPLOIEMENT CIBLÉ : ne pull+redémarre
#                                                  # que les services listés (le code est
#                                                  # toujours synchronisé ; backup + migrations
#                                                  # restent actifs). Ex. : un fix front-only
#                                                  # sur core/studio passe en < 1 min sans
#                                                  # toucher aux autres containers.
#     bash scripts/deploy-prod.sh --publish-update # après la stack, exporte + pousse un
#                                                  # update OTA expo-updates vers data/updates
#                                                  # (bind mount du service `updates`).
#
# 🎯 Ce script encapsule le déploiement validé le 2026-09-01 (CI + GHCR) :
#    1. Transfert du code (tar|ssh, exclut node_modules/.git/artefacts/AppleDouble)
#    2. Purge des packages périmés supprimés du repo (packages/db, api-client, billing, workers)
#    3. Fix ?schema=public ⊂ .env.docker (piège pgx/goose)
#    4. Pull des images buildées EN CI (ghcr.io/flayrox/qoefi-*) — plus AUCUN build sur le VPS
#       (le build VPS ~15 min est remplacé par un pull < 1 min)
#    5. Backup de la DB + migration goose + démarrage de la stack
#    6. Smoke tests de bout en bout
#
# 🔑 Auth GHCR : GitHub App (token d'installation 1h minté à chaque déploiement par
#    scripts/ghcr-login.sh) — PAS de PAT long-lived. Setup unique : docs/VPS_DEPLOYMENT_PREP.md §15.
#
# ⚠️ Les ports non standards (kong 18000/18443, pooler 15432/16543,
#    stalwart 28080) vivent dans les .env du VPS : NON touchés ici.
# =====================================================================

set -euo pipefail

# ─── Config ───────────────────────────────────────────────
VPS_HOST="${VPS_HOST:-root@159.195.110.239}"
VPS_DIR="/var/www/qoe.fi"
SUPABASE_DIR="/var/www/supabase/docker"
BACKUP_ROOT="/root/migration"

# ─── Couleurs ────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; BLUE='\033[0;34m'; NC='\033[0m'
log() { echo -e "${BLUE}▶ $1${NC}"; }
success() { echo -e "${GREEN}✅ $1${NC}"; }
warn() { echo -e "${YELLOW}⚠️  $1${NC}"; }
error() { echo -e "${RED}❌ $1${NC}"; exit 1; }

SKIP_PULL=0
PUBLISH_UPDATE=0
SERVICES=()
for arg in "$@"; do
  case "$arg" in
    --skip-pull) SKIP_PULL=1 ;;
    --skip-build) SKIP_PULL=1 ;;
    --publish-update) PUBLISH_UPDATE=1 ;;
    --credentials)
      # Inventaire des accès (mails, supabase, meili, umami…) — ne déploie rien.
      bash scripts/print-credentials.sh
      exit 0 ;;
    --build-only | --legacy-build)
      error "Le build sur le VPS n'est plus supporté : les images sont buildées en CI (ghcr.io/flayrox, workflow build-images.yml)." ;;
    -*)
      error "Option inconnue : $arg" ;;
    *)
      SERVICES+=("$arg") ;;
  esac
done
ALL_SERVICES=(tenants hi core studio admin api worker updates migrate)
if [ "${#SERVICES[@]}" -gt 0 ]; then
  log "🎯 Déploiement CIBLÉ : ${SERVICES[*]} (les autres containers ne sont pas touchés)"
fi

ssh_vps() { ssh -o ConnectTimeout=15 "$VPS_HOST" "$@"; }

log "🚀 Déploiement production QOE → $VPS_HOST"

# ─── Étape 1 : Transfert du code ──────────────────────────
log "1/6 Transfert du code (tar|ssh)…"
# Seuls les fichiers trackés par git partent — pas de node_modules/.git.
# Le tar macOS génère des fichiers AppleDouble (._*) : exclus ici,
# ils cassent goose et pnpm (vécu le 31/08 !)
git ls-files -z | tar --no-xattrs --exclude="._*" -czf - -T - \
  | ssh_vps "tar -xzf - -C $VPS_DIR"
success "Code transféré"

# ─── Étape 2 : Purge des packages périmés ─────────────────
log "2/6 Purge des packages supprimés du repo (cassent pnpm install)…"
ssh_vps "cd $VPS_DIR && for p in db api-client billing workers; do
  if [ -d packages/\$p ] && ! git ls-files --error-unmatch packages/\$p >/dev/null 2>&1; then
    rm -rf packages/\$p && echo \"  purgé packages/\$p\";
  fi
done"
success "Arbre de packages propre"

# ─── Étape 2bis : Clé de code signing des updates OTA ──────
log "2bis/7 Clé de code signing updates OTA (si présente en local)…"
# La clé privée (apps/mobile/keys, gitignorée) est poussée vers le bind
# mount attendu par le service `updates` (docker-compose: UPDATES_SIGNING_KEY).
# Absente localement → warning (le serveur refusera de démarrer si la clé
# n'est pas déjà sur le VPS).
LOCAL_KEY="apps/mobile/keys/private-key.pem"
if [ -f "$LOCAL_KEY" ]; then
  scp -o ConnectTimeout=15 "$LOCAL_KEY" "$VPS_HOST:$VPS_DIR/data/updates-signing-key.pem" \
    && success "Clé de signature updates déployée" \
    || warn "scp de la clé de signature échoué — vérifier data/updates-signing-key.pem sur le VPS"
else
  warn "Clé privée absente localement ($LOCAL_KEY) — non poussée (serveur updates refusera de démarrer sans elle)"
fi

# ─── Étape 3 : Fix piège ?schema=public ───────────────────
log "3/6 Vérification de .env.docker (piège ?schema=public)…"
ssh_vps "cd $VPS_DIR && python3 - <<'PY'
import re
p = '.env.docker'
s = open(p).read()
n = re.sub(r'\\?schema=public', '', s)
if n != s:
    open(p, 'w').write(n)
    print('  ?schema=public retiré de DATABASE_URL')
else:
    print('  .env.docker OK')
PY"

# ─── Étape 4 : Login GHCR (GitHub App) + pull des images CI ─
if [ "$SKIP_PULL" = "1" ]; then
  warn "Pull sauté (--skip-pull)"
else
  log "4/6 Login GHCR (GitHub App) + pull des images buildées en CI…"
  ssh_vps "cd $VPS_DIR && if [ -f scripts/ghcr-login.sh ]; then bash scripts/ghcr-login.sh; else echo '⚠️  scripts/ghcr-login.sh absent — login GHCR préexistant requis'; fi"
  PULL_TARGETS=("${SERVICES[@]:-${ALL_SERVICES[@]}}")
  if ! ssh_vps "cd $VPS_DIR && docker compose pull ${PULL_TARGETS[*]}"; then
    error "Pull GHCR impossible — setup GitHub App : voir docs/VPS_DEPLOYMENT_PREP.md §15 (ou docker login manuel)"
  fi
  success "Images à jour"
fi

# ─── Étape 5 : Backup + migration + démarrage ─────────────
log "5/6 Backup DB, migrations goose, démarrage…"
STAMP=$(date +%Y%m%dT%H%M%SZ)
log "   Backup de la base (postgres.dump.gz)…"
ssh_vps "mkdir -p $BACKUP_ROOT/pre-$STAMP && docker exec supabase-db pg_dump -U postgres -d postgres | gzip > $BACKUP_ROOT/pre-$STAMP/postgres.dump.gz 2>/dev/null; wc -c $BACKUP_ROOT/pre-$STAMP/postgres.dump.gz"
log "   Backup .env.docker…"
ssh_vps "cp $VPS_DIR/.env.docker $BACKUP_ROOT/pre-$STAMP/qoe.env.docker"
log "   Migrations goose…"
ssh_vps "cd $VPS_DIR && docker compose up -d migrate"
ssh_vps "cd $VPS_DIR && docker logs qoefi-migrate 2>&1 | tail -2 | grep -qE 'OK|no migrations' || error 'migrate KO' ; exit 0" || error "Migrations goose en échec"
log "   Démarrage de la stack…"
if [ "${#SERVICES[@]}" -gt 0 ]; then
  ssh_vps "cd $VPS_DIR && docker compose up -d ${SERVICES[*]}"
  success "Services ciblés démarrés : ${SERVICES[*]}"
else
  ssh_vps "cd $VPS_DIR && docker compose up -d"
  success "Stack démarrée"
fi
# Re-applique le firewall tailnet (une recreate de qoefi-caddy change son IP
# docker → le DNAT PREROUTING pointerait vers une IP périmée sinon).
log "   Firewall tailnet (re-application post-up)…"
ssh_vps "bash $VPS_DIR/scripts/tailnet-firewall.sh" || warn "tailnet-firewall.sh en échec — dashboards admin tailnet à revérifier"
sleep 20

# ─── Étape 6 : Publish OTA (optionnel) ────────────────────
if [ "$PUBLISH_UPDATE" = "1" ]; then
  log "6/6 Publish update OTA expo-updates (expo export + rsync)…"
  # Exporte le bundle JS localement puis le pousse dans le bind mount
  # data/updates du service `updates` sur le VPS (serveur docker/updates).
  UPDATES_TARGET="$VPS_HOST:$VPS_DIR/data/updates" bash scripts/publish-update.sh
  success "Update OTA publié — vérification du manifest HTTPS…"
  ssh_vps "curl -sf -o /dev/null -H 'expo-platform: ios' -H 'expo-runtime-version: $(node -p "require('./apps/mobile/app.json').expo.runtimeVersion")' https://updates.qoe.fi/api/manifest" \
    && success "   manifest HTTPS OK" || warn "   manifest HTTPS injoignable — vérifier DNS updates.qoe.fi + service updates"
else
  log "6/7 (publish OTA sauté — ajoutez --publish-update pour livrer le JS mobile)"
fi

# ─── Étape 7 : Smoke tests ────────────────────────────────
log "7/7 Smoke tests…"
sleep 10
ok=0; fail=0
check() { # check <nom> <commande-ssh>
  local name="$1"; shift
  if ssh_vps "$@" >/dev/null 2>&1; then success "   $name"; ok=$((ok+1));
  else warn "   $name (échec)"; fail=$((fail+1)); fi
}
check "api /health"          "curl -sf -o /dev/null https://api.qoe.fi/health"
check "updates /healthz"      "curl -sf -o /dev/null https://updates.qoe.fi/healthz"
check "qoe.fi (core)"        "curl -sf -o /dev/null https://qoe.fi/home"
check "hi.qoe.fi"            "curl -sf -o /dev/null https://hi.qoe.fi"
check "umami tracker public" "curl -sf -o /dev/null https://umami.qoe.fi/script.js"  # dashboard = tailnet-only (umami.admin.qoe.fi)
check "admin.qoe.fi masqué"  "! curl -s --max-time 8 -o /dev/null https://admin.qoe.fi/"  # tailnet-only : hors tailnet → connexion fermée (abort)
check "admin tailnet :3002"  "curl -sf -o /dev/null --max-time 8 http://100.117.195.127:3002/"  # fallback direct (Caddy : admin.qoe.fi tailnet-only)
check "auth (kong)"          "SR=\$(grep '^SERVICE_ROLE_KEY=' $SUPABASE_DIR/.env | cut -d= -f2-); curl -sk -o /dev/null -w '%{http_code}' https://auth.qoe.fi/auth/v1/health -H \"apikey: \$SR\" | grep -q 200"
check "config /v1/home/config" "curl -sf https://api.qoe.fi/v1/home/config | grep -q AUTH_METHODS"
check "worker email loop"    "docker logs qoefi-worker 2>&1 | grep -q 'email-delivery'"
check "containers healthy"   "test \$(docker ps --format '{{.Names}}' | grep qoefi | wc -l) -ge 14"

echo
if [ "$fail" = "0" ]; then
  success "🎉 Déploiement terminé — tous les smoke tests passent ($ok/$((ok+fail)))"
else
  warn "Déploiement terminé mais $fail smoke test(s) en échec — à inspecter."
fi
echo "   Backup : $BACKUP_ROOT/pre-$STAMP/"
echo "   Logs build : /root/qoe-build.log (sur le VPS)"
#!/usr/bin/env bash
# =============================================================================
# 🚀 bootstrap.sh — Installation reproductible du stack qoe.fi sur un VPS neuf
# =============================================================================
#
# Automatise la checklist de docs/MIGRATION.md. À lancer EN ROOT sur le
# nouveau serveur (Netcup ou autre). Idempotent : relançable sans risque.
#
# ── PRÉPARATION (avant de lancer) ────────────────────────────────────────────
# Déposer les sauvegardes de l'ancien VPS dans /root/migration/ (BACKUP_DIR) :
#
#   migration/
#   ├── env.docker                  ← /var/www/qoe.fi/.env.docker (obligatoire)
#   ├── supabase-docker.tar.gz      ← /var/www/supabase/docker (recommandé)
#   ├── public_dump.sql             ← pg_dump --schema=public --clean --if-exists
#   ├── auth_dump.sql               ← pg_dump --schema=auth --data-only
#   ├── storage_dump.sql            ← pg_dump --schema=storage --data-only
#   ├── letsencrypt/                ← /etc/letsencrypt (certs, optionnel)
#   ├── jina-embeddings-v3-Q8_0.gguf← modèle (optionnel, sinon téléchargé + vérifié)
#   └── lassez-docker.tar.gz        ← /var/www/lassez-docker (projet radar, optionnel)
#
# ── USAGE ────────────────────────────────────────────────────────────────────
#   bash scripts/bootstrap.sh                # tout
#   SKIP_SYSTEM=1 SKIP_SUPABASE=1 SKIP_DATA=1 SKIP_BUILD=1 bash scripts/bootstrap.sh
#   BOOTSTRAP_BACKUP_DIR=/srv/migration bash scripts/bootstrap.sh
#
# ── SKIP_* disponibles ───────────────────────────────────────────────────────
#   SKIP_SYSTEM   (apt, docker, sysctl, swap)
#   SKIP_NETWORKS (réseaux docker)
#   SKIP_SUPABASE (stack supabase self-hébergé)
#   SKIP_QOEFI    (clone repo + .env + modèle)
#   SKIP_DATA     (restore des données)
#   SKIP_BUILD    (docker compose build)
#   SKIP_UP       (docker compose up)
#   SKIP_VERIFY   (vérifications finales)
# =============================================================================

set -uo pipefail

# ── Config (surchargeable via l'environnement) ───────────────────────────────
BACKUP_DIR="${BOOTSTRAP_BACKUP_DIR:-/root/migration}"
APP_DIR="${BOOTSTRAP_APP_DIR:-/var/www/qoe.fi}"
SUPABASE_DIR="${BOOTSTRAP_SUPABASE_DIR:-/var/www/supabase}"
GIT_REPO="${BOOTSTRAP_GIT_REPO:-https://github.com/Flayrox/qoe.fi.git}"
GIT_BRANCH="${BOOTSTRAP_BRANCH:-main}"
SUPABASE_GIT_TAG="${BOOTSTRAP_SUPABASE_TAG:-v1.27.12}"

# Modèle d'embedding (source vérifiée le 19/08/2026)
MODEL_URL="https://huggingface.co/second-state/jina-embeddings-v3-GGUF/resolve/main/jina-embeddings-v3-Q8_0.gguf"
MODEL_SIZE=600995424
MODEL_SHA256="da95bb315ec9766aabfdfa920124a6997a5d9617bd7c9708c4195557136864e1"
MODEL_FILE="jina-embeddings-v3-Q8_0.gguf"

# ── Helpers ──────────────────────────────────────────────────────────────────
C_GREEN=$'\033[32m'; C_YELLOW=$'\033[33m'; C_RED=$'\033[31m'; C_BOLD=$'\033[1m'; C_RESET=$'\033[0m'

step() { echo; echo "${C_BOLD}━━━ [$1/$TOTAL_STEPS] $2 ━━━${C_RESET}"; }
ok()   { echo "${C_GREEN}  ✔ $1${C_RESET}"; }
warn() { echo "${C_YELLOW}  ⚠ $1${C_RESET}"; }
fail() { echo "${C_RED}  ✘ $1${C_RESET}"; }

skip() { [ "${1:-}" = "1" ] || [ "${1:-}" = "true" ]; }

# ── Étape 1 : système de base ────────────────────────────────────────────────
step_system() {
  step 1 "Système de base (apt, Docker, sysctl, swap)"
  [ "$(id -u)" -eq 0 ] || { fail "Lancer en root (sudo -i)"; return 1; }

  if ! command -v docker >/dev/null 2>&1; then
    echo "  → Installation de Docker…"
    curl -fsSL https://get.docker.com | sh || { fail "Installation Docker"; return 1; }
    ok "Docker installé"
  else
    ok "Docker déjà présent ($(docker --version | awk '{print $3}' | tr -d ','))"
  fi
  docker compose version >/dev/null 2>&1 || { fail "Plugin docker compose manquant"; return 1; }

  # Tuning (identique à l'ancien VPS)
  if [ "$(cat /proc/sys/vm/overcommit_memory 2>/dev/null)" != "1" ]; then
    sysctl -w vm.overcommit_memory=1 >/dev/null
    grep -q '^vm.overcommit_memory' /etc/sysctl.conf 2>/dev/null || echo 'vm.overcommit_memory = 1' >> /etc/sysctl.conf
    ok "vm.overcommit_memory = 1 (persisté)"
  else
    ok "vm.overcommit_memory déjà = 1"
  fi

  if ! swapon --show | grep -q swap; then
    fallocate -l 4G /swapfile && chmod 600 /swapfile && mkswap /swapfile >/dev/null && swapon /swapfile
    grep -q '^/swapfile' /etc/fstab 2>/dev/null || echo '/swapfile none swap sw 0 0' >> /etc/fstab
    ok "Swap 4 G activé"
  else
    ok "Swap déjà actif : $(swapon --show | tail -1 | awk '{print $3}')"
  fi
}

# ── Étape 2 : réseaux Docker ─────────────────────────────────────────────────
step_networks() {
  step 2 "Réseaux Docker"
  for net in qoefi-public qoefi-private; do
    if docker network ls --format '{{.Name}}' | grep -qx "$net"; then
      ok "Réseau $net déjà présent"
    else
      docker network create "$net" >/dev/null && ok "Réseau $net créé"
    fi
  done
}

# ── Étape 3 : Supabase self-hébergé ──────────────────────────────────────────
step_supabase() {
  step 3 "Supabase self-hébergé"
  local compose_dir="$SUPABASE_DIR/docker"

  if [ -d "$compose_dir" ] && [ -f "$compose_dir/.env" ]; then
    ok "Stack Supabase déjà présente dans $compose_dir"
  elif [ -f "$BACKUP_DIR/supabase-docker.tar.gz" ]; then
    echo "  → Restauration depuis la sauvegarde de l'ancien VPS…"
    mkdir -p "$SUPABASE_DIR"
    tar xzf "$BACKUP_DIR/supabase-docker.tar.gz" -C "$SUPABASE_DIR" || { fail "Extraction supabase-docker.tar.gz"; return 1; }
    ok "Stack Supabase extraite (versions identiques à l'ancien VPS)"
  elif [ -f "$BACKUP_DIR/supabase.env" ]; then
    echo "  → Clone frais du stack Supabase (tag $SUPABASE_GIT_TAG)…"
    mkdir -p "$SUPABASE_DIR"
    git clone --depth 1 --branch "$SUPABASE_GIT_TAG" https://github.com/supabase/supabase.git "$SUPABASE_DIR/repo" >/dev/null 2>&1
    mkdir -p "$compose_dir"
    cp -r "$SUPABASE_DIR/repo/docker/." "$compose_dir/"
    cp "$BACKUP_DIR/supabase.env" "$compose_dir/.env"
    ok "Stack Supabase clonée + .env restauré"
  else
    warn "Aucune sauvegarde Supabase trouvée ($BACKUP_DIR) — étape ignorée."
    warn "Place supabase-docker.tar.gz ou supabase.env dans $BACKUP_DIR puis relance."
    return 0
  fi

  # 🔒 Override de segmentation : expose kong + studio sur qoefi-public pour
  #    que Caddy (qoefi-caddy) puisse les atteindre SANS accéder au réseau
  #    supabase_default (donc sans accès à la DB). Le réseau qoefi-public est
  #    créé à l'étape 2. Idempotent : le fichier est réécrit tel quel.
  cat > "$compose_dir/docker-compose.override.yml" <<'YAML'
# Généré par bootstrap.sh — segmentation réseau v2.
# Caddy n'a PAS accès au réseau supabase_default : seuls kong et studio sont
# exposés à Caddy via le réseau partagé qoefi-public.
# ⚠️ NE PAS renommer realtime-dev.supabase-realtime : realtime dérive son
#    tenant id de son propre nom de conteneur (comportement Supabase officiel).
services:
  kong:
    networks:
      default:
        aliases:
          - api-gw   # préserve l'alias interne (requis par le stack Supabase)
      qoefi-public: {}
  studio:
    networks:
      - default
      - qoefi-public
networks:
  qoefi-public:
    external: true
YAML
  ok "Override Supabase en place (kong/studio → qoefi-public)"

  if ! docker ps --format '{{.Names}}' | grep -q '^supabase-db$'; then
    echo "  → Démarrage du stack Supabase…"
    ( cd "$compose_dir" && docker compose up -d ) || { fail "Démarrage Supabase"; return 1; }
  else
    ok "Supabase déjà démarré"
  fi

  # Attendre que Postgres réponde
  echo "  → Attente de Postgres…"
  for i in $(seq 1 60); do
    if docker exec supabase-db pg_isready -U postgres >/dev/null 2>&1; then ok "Postgres prêt"; break; fi
    [ "$i" = 60 ] && { fail "Postgres ne répond pas après 60 s"; return 1; }
    sleep 5
  done
  ok "Extension pgvector : $(docker exec supabase-db psql -U postgres -d postgres -tAc "SELECT extversion FROM pg_extension WHERE extname='vector'" 2>/dev/null || echo 'à vérifier')"
}

# ── Étape 4 : repo qoe.fi + .env + modèle ────────────────────────────────────
step_qoefi() {
  step 4 "Repo qoe.fi, .env.docker et modèle d'embedding"

  if [ ! -d "$APP_DIR/.git" ]; then
    echo "  → Clone de $GIT_REPO…"
    mkdir -p "$(dirname "$APP_DIR")"
    git clone --branch "$GIT_BRANCH" "$GIT_REPO" "$APP_DIR" || { fail "Clone du repo"; return 1; }
    ok "Repo cloné"
  else
    ( cd "$APP_DIR" && git fetch -q origin && git checkout -q "$GIT_BRANCH" && git pull -q ) && ok "Repo déjà présent, mis à jour"
  fi

  if [ ! -f "$APP_DIR/.env.docker" ]; then
    if [ -f "$BACKUP_DIR/env.docker" ]; then
      cp "$BACKUP_DIR/env.docker" "$APP_DIR/.env.docker"
      ok ".env.docker restauré depuis la sauvegarde"
    else
      fail "Ni .env.docker ni $BACKUP_DIR/env.docker — le build en a besoin."
      return 1
    fi
  else
    ok ".env.docker déjà présent"
  fi
  if [ -L "$APP_DIR/.env" ] || [ -f "$APP_DIR/.env" ]; then
    ok "Fichier .env déjà en place"
  else
    ln -s .env.docker "$APP_DIR/.env" && ok "Symlink .env → .env.docker"
  fi

  # Certs TLS (optionnel — sinon copier /etc/letsencrypt à la main)
  if [ -d "$BACKUP_DIR/letsencrypt/live/qoe.fi" ] && [ ! -d /etc/letsencrypt/live/qoe.fi ]; then
    cp -r "$BACKUP_DIR/letsencrypt" /etc/letsencrypt && ok "Certs TLS restaurés"
  fi
  # ⚠️ base.admin.qoe.fi (Supabase Studio) est un sous-domaine 3 niveaux :
  #    le wildcard *.qoe.fi ne le couvre PAS. Il faut un cert DÉDIÉ,
  #    généré avant la migration (voir docs/MIGRATION.md §Certs) pour
  #    qu'il soit inclus dans la sauvegarde letsencrypt/.
  if [ ! -d /etc/letsencrypt/live/base.admin.qoe.fi ]; then
    warn "Cert dédié base.admin.qoe.fi ABSENT — le bloc Supabase Studio échouera."
    warn "Génère-le AVANT la migration : certbot certonly -d base.admin.qoe.fi (challenge DNS)."
  else
    ok "Cert dédié base.admin.qoe.fi présent"
  fi

  # Modèle d'embedding
  mkdir -p "$APP_DIR/models"
  local model_path="$APP_DIR/models/$MODEL_FILE"
  if [ -f "$model_path" ] && [ "$(stat -c%s "$model_path")" = "$MODEL_SIZE" ]; then
    ok "Modèle déjà présent ($MODEL_SIZE octets)"
  else
    if [ -f "$BACKUP_DIR/$MODEL_FILE" ]; then
      cp "$BACKUP_DIR/$MODEL_FILE" "$model_path"
      ok "Modèle copié depuis la sauvegarde"
    else
      echo "  → Téléchargement du modèle ($((MODEL_SIZE / 1024 / 1024)) Mo)…"
      curl -sL --retry 3 -o "$model_path" "$MODEL_URL" || { fail "Téléchargement du modèle"; return 1; }
    fi
    # Vérification intégrité
    local size sha
    size=$(stat -c%s "$model_path")
    sha=$(sha256sum "$model_path" | awk '{print $1}')
    if [ "$size" = "$MODEL_SIZE" ] && [ "$sha" = "$MODEL_SHA256" ]; then
      ok "Modèle vérifié (taille + SHA-256)"
    else
      fail "Modèle invalide (taille=$size, sha=$sha)"
      return 1
    fi
  fi
}

# ── Étape 5 : migration des données ──────────────────────────────────────────
step_data() {
  step 5 "Migration des données (dumps de l'ancien VPS)"

  # Projet annexe : lassez/radar (média) — SA PROPRE DB Supabase cloud.
  # On le ramène tel quel (network_mode host, ports 4000-4002 joints par
  # Caddy via host.docker.internal). Il sera absorbé par qoe.fi plus tard.
  if [ -f "$BACKUP_DIR/lassez-docker.tar.gz" ]; then
    echo "  → Restauration de lassez-docker (radar)…"
    mkdir -p /var/www/lassez-docker
    tar xzf "$BACKUP_DIR/lassez-docker.tar.gz" -C /var/www/lassez-docker || { warn "Extraction lassez-docker.tar.gz échouée"; }
    ( cd /var/www/lassez-docker && docker compose up -d ) >/dev/null 2>&1 && ok "lassez-docker démarré" || warn "lassez-docker : up échoué (à vérifier après le bootstrap)"
  fi

  [ -f "$BACKUP_DIR/public_dump.sql" ] || { warn "Pas de public_dump.sql — étape ignorée."; return 0; }

  local psql="docker exec -i supabase-db psql -U postgres -d postgres -v ON_ERROR_STOP=0"

  echo "  → Restore du schéma public…"
  cat "$BACKUP_DIR/public_dump.sql" | $psql > /tmp/restore_public.log 2>&1
  local nb_err; nb_err=$(grep -c ERROR /tmp/restore_public.log || true)
  [ "$nb_err" = "0" ] && ok "public restauré sans erreur" || warn "$nb_err erreurs (DROP bénins attendus) sinon OK"

  echo "  → Purge des données de test auth/storage…"
  cat <<'SQL' | $psql >/dev/null 2>&1
DO $$ DECLARE r RECORD; BEGIN
  FOR r IN SELECT schemaname, tablename FROM pg_tables
           WHERE schemaname IN ('auth','storage') LOOP
    EXECUTE format('TRUNCATE TABLE %I.%I CASCADE', r.schemaname, r.tablename);
  END LOOP;
END $$;
SQL
  ok "auth/storage purgés"

  local nb_err
  if [ -f "$BACKUP_DIR/auth_dump.sql" ]; then
    echo "  → Restore auth…"
    cat "$BACKUP_DIR/auth_dump.sql" | $psql > /tmp/restore_auth.log 2>&1
    nb_err=$(grep -c ERROR /tmp/restore_auth.log || true)
    [ "$nb_err" = "0" ] && ok "auth restauré sans erreur" || warn "$nb_err erreurs (colonne plus récente = bénin)"
  fi
  if [ -f "$BACKUP_DIR/storage_dump.sql" ]; then
    echo "  → Restore storage…"
    cat "$BACKUP_DIR/storage_dump.sql" | $psql > /tmp/restore_storage.log 2>&1
    nb_err=$(grep -c ERROR /tmp/restore_storage.log || true)
    [ "$nb_err" = "0" ] && ok "storage restauré sans erreur" || warn "$nb_err erreurs (colonne plus récente = bénin)"
  fi

  echo "  → Grants + RLS…"
  cat <<'SQL' | $psql >/dev/null 2>&1
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO postgres, anon, authenticated, service_role;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO postgres, anon, authenticated, service_role;
SQL
  if [ -f "$APP_DIR/scripts/rls-interactions.sql" ]; then
    cat "$APP_DIR/scripts/rls-interactions.sql" | $psql > /tmp/restore_rls.log 2>&1
    ok "Policies RLS appliquées ($(grep -c 'CREATE POLICY' "$APP_DIR/scripts/rls-interactions.sql") policies, doublons bénins)"
  fi

  echo "  → Vérification des comptages…"
  docker exec supabase-db psql -U postgres -d postgres -tAc \
    "SELECT 'users auth='||(SELECT count(*) FROM auth.users)||' public='||(SELECT count(*) FROM \"User\")||' articles='||(SELECT count(*) FROM \"Article\")||' posts='||(SELECT count(*) FROM \"Post\")||' storage='||(SELECT count(*) FROM storage.objects)"
}

# ── Étape 6 : build des images ───────────────────────────────────────────────
step_build() {
  step 6 "Build des images Docker (long : ~20-30 min)"
  ( cd "$APP_DIR" && docker compose build ) || { fail "Build"; return 1; }
  ok "Images construites"
}

# ── Étape 7 : démarrage du stack ─────────────────────────────────────────────
step_up() {
  step 7 "Démarrage du stack qoe.fi"
  ( cd "$APP_DIR" && docker compose up -d ) || { fail "docker compose up"; return 1; }
  echo "  → Attente du démarrage…"
  sleep 15
  ( cd "$APP_DIR" && docker compose ps --format '{{.Name}}: {{.Status}}' | grep -E 'qoefi-(caddy|web|feed|studio|admin|landing|api|worker|embedding)' ) || true
}

# ── Étape 8 : vérifications de bout en bout ──────────────────────────────────
# NB: le DNS pointe encore vers l'ANCIEN VPS à ce stade → on force la connexion
# vers le serveur local (--resolve …:127.0.0.1) pour tester LE NOUVEAU serveur.
# Après la bascule DNS (Phase 5 de MIGRATION.md), relancer ces mêmes checks
# SANS --resolve pour confirmer la propagation.
step_verify() {
  step 8 "Vérifications de bout en bout (via le serveur local, avant bascule DNS)"
  resolve="--resolve api.qoe.fi:443:127.0.0.1 --resolve qoe.fi:443:127.0.0.1 --resolve start.qoe.fi:443:127.0.0.1 --resolve studio.qoe.fi:443:127.0.0.1"
  for url in "https://api.qoe.fi/health" "https://qoe.fi" "https://start.qoe.fi" "https://studio.qoe.fi"; do
    code=$(curl -sk -o /dev/null -w '%{http_code}' --max-time 15 $resolve "$url")
    if [ "$code" = "200" ] || [ "$code" = "307" ]; then ok "$url → $code"; else warn "$url → $code"; fi
  done
  echo "  → Recherche sémantique (llama.cpp + pgvector) :"
  curl -sk --max-time 40 $resolve "https://api.qoe.fi/search/semantic?q=test" | head -c 300; echo
  echo
  warn "⚠ Reste manuel : bascule DNS (nouvelle IP), PTR chez Netcup, DKIM/SPF/DMARC,"
  warn "  admin Umami, et éventuelle bascule TLS en DNS-01 (voir docs/MIGRATION.md)."
  warn "  Après la bascule DNS : relancer ces checks sans --resolve (Phase 6 de MIGRATION.md)."
}

# ── Main ─────────────────────────────────────────────────────────────────────
TOTAL_STEPS=8
main() {
  echo "${C_BOLD}🚀 Bootstrap qoe.fi — $(date -u +'%Y-%m-%dT%H:%M:%SZ')${C_RESET}"
  echo "  BACKUP_DIR=$BACKUP_DIR  APP_DIR=$APP_DIR  SUPABASE_DIR=$SUPABASE_DIR"
  [ -d "$BACKUP_DIR" ] || warn "BACKUP_DIR inexistant ($BACKUP_DIR) — créer et y déposer les sauvegardes (voir l'en-tête)"

  skip "${SKIP_SYSTEM:-}"   || step_system   || exit 1
  skip "${SKIP_NETWORKS:-}" || step_networks || exit 1
  skip "${SKIP_SUPABASE:-}" || step_supabase || exit 1
  skip "${SKIP_QOEFI:-}"    || step_qoefi    || exit 1
  skip "${SKIP_DATA:-}"     || step_data     || exit 1
  skip "${SKIP_BUILD:-}"    || step_build    || exit 1
  skip "${SKIP_UP:-}"       || step_up       || exit 1
  skip "${SKIP_VERIFY:-}"   || step_verify   || exit 1

  echo
  echo "${C_GREEN}${C_BOLD}✅ Bootstrap terminé.${C_RESET} Relis la checklist docs/MIGRATION.md pour la bascule DNS et le serveur mail."
}

main "$@"

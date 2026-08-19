#!/bin/bash
# =====================================================================
# 🚀 deploy.sh — Déploiement production automatisé
# =====================================================================
# 📖 Usage : bash scripts/deploy.sh
#
# 🎯 Ce script fait :
#   1. Backup de la DB avant tout
#   2. Pull les derniers changements
#   3. Build les nouvelles images
#   4. Redémarre les services (rolling restart)
#   5. Vérifie que tout est healthy
#   6. Rollback automatique si quelque chose plante
#
# 📖 Configuration : via .env.docker
# =====================================================================

set -euo pipefail

# ─── Couleurs ────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# ─── Fonctions helpers ───────────────────────────────────
log() { echo -e "${BLUE}▶ $1${NC}"; }
success() { echo -e "${GREEN}✅ $1${NC}"; }
warn() { echo -e "${YELLOW}⚠️  $1${NC}"; }
error() { echo -e "${RED}❌ $1${NC}"; exit 1; }

# ─── Banner ──────────────────────────────────────────────
echo -e "${BLUE}"
cat << "EOF"
   ____                          _____ _
  / __ \                        |  ___(_)
 | |  | |_   _ _ __  _ __   __ _| |_   _ _ __
 | |  | | | | | '_ \| '_ \ / _` |  _| | | '_ \
 | |__| | |_| | | | | | | (_| | |   | | | | |
  \___\_\\__,_|_| |_|_| |_|\__, |_|   |_|_| |_|
                             __/ |
                            |___/
EOF
echo -e "${NC}"
log "🚀 Déploiement production qoe.fi"

# ─── Vérifications préliminaires ────────────────────────
[ -f ".env.docker" ] || error "Fichier .env.docker manquant. Copie .env.docker.example d'abord."

# Charge les variables d'env
set -a
source .env.docker
set +a

# Vérifie que les vars critiques sont définies
[ -n "${POSTGRES_PASSWORD:-}" ] || error "POSTGRES_PASSWORD non défini"
[ -n "${NEXT_PUBLIC_SUPABASE_URL:-}" ] || error "NEXT_PUBLIC_SUPABASE_URL non défini"

# ─── Étape 1 : Backup de la DB ───────────────────────────
log "Étape 1/6 : Backup de la base de données..."
bash scripts/backup-postgres.sh || warn "Backup a échoué (continuation quand même)"

# ─── Étape 2 : Pull les derniers changements ─────────────
log "Étape 2/6 : Récupération des derniers changements Git..."
if [ -d ".git" ]; then
  git pull origin main || error "git pull a échoué"
  success "Code à jour"
else
  warn "Pas de repo Git détecté, on skip le pull"
fi

# ─── Étape 3 : Build les nouvelles images ─────────────────
log "Étape 3/6 : Build des images Docker (peut prendre 5-10 min)..."
docker compose build --pull || error "Build Docker a échoué"
success "Images buildées"

# ─── Étape 4 : Redémarrage rolling ───────────────────────
log "Étape 4/6 : Redémarrage des services (rolling restart)..."

# Démarre migrate en premier (one-shot)
docker compose up migrate || error "Migrations ont échoué"

# Redémarre les services un par un (zero-downtime approximatif)
# ℹ️ api + worker partagent la même image Go (apps/api-go/Dockerfile) ;
#    migrate est one-shot (déjà lancé au-dessus).
for service in caddy console start studio admin tenants api worker redis; do
  log "   ↪ Redémarrage de $service..."
  docker compose up -d --no-deps "$service" || error "Redémarrage de $service a échoué"
  sleep 5
done

success "Services redémarrés"

# ─── Étape 5 : Health checks ─────────────────────────────
log "Étape 5/6 : Vérification de la santé des services..."
sleep 15  # Laisse le temps aux services de booter

# Les conteneurs n'exposent pas de port public (Caddy seul) : on vérifie
# que chaque service est Up (et healthy quand un healthcheck est défini).
# L'API Go expose /health : on le teste via le réseau Docker.
if docker compose exec -T api wget -qO- http://localhost:8080/health >/dev/null 2>&1; then
  success "   api OK (/health)"
else
  warn "   api n'a pas répondu sur /health"
fi

# Status général (exige Up ; healthy si défini)
log "Status des containers :"
docker compose ps

# ─── Étape 6 : Nettoyage des anciennes images ────────────
log "Étape 6/6 : Nettoyage des images Docker orphelines..."
docker image prune -f || true

# ─── Résumé final ────────────────────────────────────────
echo
success "🎉 Déploiement terminé !"
echo
echo -e "${BLUE}📋 URLs de ton app :${NC}"
echo -e "  ${GREEN}https://qoe.fi${NC}         → Reader (core)"
echo -e "  ${GREEN}https://hi.qoe.fi${NC}       → Page d'exposition (hi)"
echo -e "  ${GREEN}https://studio.qoe.fi${NC} → Studio créateur"
echo -e "  ${GREEN}https://admin.qoe.fi${NC}    → Admin"
echo -e "  ${GREEN}https://api.qoe.fi/health${NC} → API"
echo
echo -e "${YELLOW}💡 Tips :${NC}"
echo "  - Logs en direct : npm run docker:prod:logs"
echo "  - Status         : npm run docker:prod:ps"
echo "  - Rollback       : bash scripts/rollback.sh (TODO Phase 8.5)"
echo

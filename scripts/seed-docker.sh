#!/bin/bash
# =====================================================================
# 🌱 seed-docker.sh — Initialise la DB de dev (migrations + seed)
# =====================================================================
# 📖 Ce script fait 3 choses :
#   1. Attend que Postgres soit prêt (via wait-for-db.sh)
#   2. Applique les migrations goose (apps/api/sql/migrations)
#   3. (Optionnel) Insère les données de seed depuis apps/api/cmd/seed (Go)
#
# 🎯 Usage :
#   ./scripts/seed-docker.sh              # migrations + seed
#   ./scripts/seed-docker.sh --no-seed    # migrations seulement
#   ./scripts/seed-docker.sh --reset      # ⚠️ RESET la DB + seed
#
# ⚠️  --reset SUPPRIME toutes les données ! Jamais en prod !
# =====================================================================

set -e  # Arrête le script si une commande échoue

# --- Couleurs pour les messages ---
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# --- Parse des arguments ---
SEED=true
RESET=false

while [[ $# -gt 0 ]]; do
  case $1 in
    --no-seed) SEED=false; shift ;;
    --reset) RESET=true; shift ;;
    --help|-h)
      echo "Usage: $0 [--no-seed] [--reset]"
      echo "  --no-seed  : N'exécute pas le seed"
      echo "  --reset    : ⚠️  RESET la DB (supprime toutes les données !)"
      exit 0
      ;;
    *) echo -e "${RED}❌ Argument inconnu: $1${NC}"; exit 1 ;;
  esac
done

# --- Configuration ---
DB_HOST="${DB_HOST:-localhost}"
DB_PORT="${DB_PORT:-5433}"  # port externe depuis .env.docker.example
DB_USER="${POSTGRES_USER:-qoe}"
DB_PASS="${POSTGRES_PASSWORD:-qoe}"
DB_NAME="${POSTGRES_DB:-qoe}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

echo -e "${YELLOW}🌱 Initialisation de la DB qoe.fi (dev)${NC}"
echo "   Host: ${DB_HOST}:${DB_PORT}"
echo "   User: ${DB_USER}"
echo "   DB:   ${DB_NAME}"
echo ""

# --- Étape 1 : Attendre que la DB soit prête ---
echo "📡 Étape 1/3 : Attente de PostgreSQL..."
DB_HOST="$DB_HOST" DB_PORT="$DB_PORT" DB_TIMEOUT=30 \
  bash "$SCRIPT_DIR/wait-for-db.sh" || {
    echo -e "${RED}❌ Impossible de se connecter à PostgreSQL${NC}"
    echo "   As-tu lancé : docker compose -f docker-compose.dev.yml up -d db ?"
    exit 1
  }

# --- Étape 2 : Migrations goose ---
# 📖 Source unique : apps/api/sql/migrations (squash de l'historique Prisma)
echo ""
echo "🔄 Étape 2/3 : Application des migrations goose..."
cd "$PROJECT_ROOT/apps/api"
export DATABASE_URL="postgresql://${DB_USER}:${DB_PASS}@${DB_HOST}:${DB_PORT}/${DB_NAME}?sslmode=disable"

if [ "$RESET" = true ]; then
  echo -e "${YELLOW}⚠️  RESET demandé : toutes les données seront SUPPRIMÉES${NC}"
  read -p "Es-tu sûr ? (tape 'oui' pour continuer) : " confirm
  if [ "$confirm" != "oui" ]; then
    echo "Annulé."
    exit 0
  fi
  # down-to 0 (DROP SCHEMA) puis up → base vierge migrée
  go run ./cmd/migrate -dir sql/migrations down-to 0
fi
# up = applique les migrations en attente, sûr pour la prod aussi
go run ./cmd/migrate -dir sql/migrations up

cd "$PROJECT_ROOT"

echo -e "${GREEN}✅ Migrations appliquées avec succès${NC}"

# --- Étape 3 : Seed (optionnel) ---
if [ "$SEED" = true ]; then
  echo ""
  echo "🌾 Étape 3/3 : Exécution du seed (Go)..."
  cd "$PROJECT_ROOT/apps/api"
  go run ./cmd/seed || {
    echo -e "${YELLOW}⚠️  Le seed a échoué (normal si pas de données de test)${NC}"
  }
  cd "$PROJECT_ROOT"
  echo -e "${GREEN}✅ Seed terminé${NC}"
else
  echo ""
  echo "⏭️  Étape 3/3 : Seed ignoré (--no-seed)"
fi

echo ""
echo -e "${GREEN}🎉 Base de données prête ! Tu peux lancer l'app.${NC}"
echo "   → docker compose -f docker-compose.dev.yml up app"
echo "   → ou : npm run docker:dev"

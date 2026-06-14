#!/bin/bash
# =====================================================================
# 🐘 wait-for-db.sh — Attend que PostgreSQL soit prêt
# =====================================================================
# 📖 Ce script est utile quand tu lances les migrations Prisma
# manuellement (en dehors de docker-compose), ou dans un pipeline CI/CD.
#
# Il utilise la commande `pg_isready` qui teste la connexion TCP à Postgres
# sans avoir besoin de credentials.
#
# 🎯 Usage :
#   ./scripts/wait-for-db.sh
#   ./scripts/wait-for-db.sh --host db --port 5432 --timeout 60
# =====================================================================

set -e  # Arrête le script si une commande échoue

# --- Valeurs par défaut (peuvent être overridées par variables d'env) ---
HOST="${DB_HOST:-localhost}"
PORT="${DB_PORT:-5432}"
TIMEOUT="${DB_TIMEOUT:-60}"  # secondes max d'attente
USER="${POSTGRES_USER:-qoe}"
DATABASE="${POSTGRES_DB:-qoe}"

# --- Parse des arguments CLI (optionnel) ---
while [[ $# -gt 0 ]]; do
  case $1 in
    --host) HOST="$2"; shift 2 ;;
    --port) PORT="$2"; shift 2 ;;
    --timeout) TIMEOUT="$2"; shift 2 ;;
    --user) USER="$2"; shift 2 ;;
    --database) DATABASE="$2"; shift 2 ;;
    *) echo "❌ Argument inconnu: $1"; exit 1 ;;
  esac
done

echo "⏳ Attente de PostgreSQL sur ${HOST}:${PORT} (max ${TIMEOUT}s)..."

# --- Boucle d'attente ---
# On calcule le temps de fin (epoch seconds)
END_TIME=$(($(date +%s) + TIMEOUT))
ATTEMPT=0

while true; do
  ATTEMPT=$((ATTEMPT + 1))

  # pg_isready retourne 0 si OK, 1 si pas prêt
  if pg_isready -h "$HOST" -p "$PORT" -U "$USER" -d "$DATABASE" -q; then
    echo "✅ PostgreSQL est prêt ! (tentative $ATTEMPT)"
    exit 0
  fi

  # Vérifie le timeout
  if [ "$(date +%s)" -ge "$END_TIME" ]; then
    echo "❌ Timeout ! PostgreSQL n'est pas devenu disponible en ${TIMEOUT}s"
    exit 1
  fi

  # Affiche un point toutes les 2 secondes pour pas spammer la console
  if [ $((ATTEMPT % 4)) -eq 0 ]; then
    echo "   ...encore en attente (tentative $ATTEMPT)"
  else
    printf "."
  fi

  sleep 1
done

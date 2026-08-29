#!/bin/bash
# =====================================================================
# 💾 backup-top-db.sh — Sauvegarde la fausse DB de test (dev locale)
# =====================================================================
# Usage: ./scripts/backup-top-db.sh
#
# Dump la base applicative (postgres) + umami du conteneur dev
# (qoefi-dev-db) vers backups/top-db-YYYYMMDD.sql.gz et
# backups/umami-YYYYMMDD.sql.gz — format custom pg_dump (restauration
# rapide, préserve les types pgvector).
#
# Garde les 5 dumps les plus récents, supprime les plus vieux.
#
# NB : les dumps sont GITIGNORÉS (fausse DB locale = jamais commitée).
# Pour restaurer : ./scripts/restore-top-db.sh
# =====================================================================
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BACKUP_DIR="${BACKUP_DIR:-$REPO_ROOT/backups}"
DB_CONTAINER="${DB_CONTAINER:-qoefi-dev-db}"
KEEP="${KEEP:-5}"
STAMP="$(date +%Y%m%d)"
MAIN_FILE="${BACKUP_DIR}/top-db-${STAMP}.sql.gz"
UMAMI_FILE="${BACKUP_DIR}/umami-${STAMP}.sql.gz"

mkdir -p "$BACKUP_DIR"

echo "💾 Backup base applicative (postgres) → ${MAIN_FILE}"
docker exec "$DB_CONTAINER" \
  pg_dump -U postgres -d postgres -Fc --no-owner --no-privileges \
  > "$MAIN_FILE"

echo "📊 Backup umami → ${UMAMI_FILE}"
docker exec "$DB_CONTAINER" \
  pg_dump -U postgres -d umami -Fc --no-owner --no-privileges \
  > "$UMAMI_FILE"

# Vérification : les deux fichiers doivent être non vides.
if [ ! -s "$MAIN_FILE" ] || [ ! -s "$UMAMI_FILE" ]; then
  echo "❌ ERREUR : un des backups est vide"
  exit 1
fi

echo "✅ Backup créés : $(du -h "$MAIN_FILE" | cut -f1) + $(du -h "$UMAMI_FILE" | cut -f1)"

# Rotation : on garde les K plus récents.
echo "🧹 Rotation (garde les $KEEP plus récents)..."
ls -1t "$BACKUP_DIR"/top-db-*.sql.gz 2>/dev/null | tail -n +$((KEEP + 1)) | while read -r old; do
  rm -f "$old" "${old/top-db/umami}"
  echo "   supprimé : $(basename "$old")"
done

echo "✨ Sauvegarde terminée. Pour restaurer : ./scripts/restore-top-db.sh"

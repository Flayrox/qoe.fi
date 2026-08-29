#!/bin/bash
# =====================================================================
# 💾 restore-top-db.sh — Restaure la fausse DB de test depuis backups/
# =====================================================================
# Usage: ./scripts/restore-top-db.sh [-y]
#
# Restaure le dump le PLUS RÉCENT de backups/top-db-*.sql.gz (base
# applicative) + backups/umami-*.sql.gz (umami) dans le conteneur de
# dev (qoefi-dev-db).
#
# ⚠️ DESTRUCTIF : remplace intégralement les bases postgres et umami
# du conteneur de dev. Confirmation demandée, sauf avec -y.
# Pour créer un dump : ./scripts/backup-top-db.sh
# =====================================================================
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BACKUP_DIR="${BACKUP_DIR:-$REPO_ROOT/backups}"
DB_CONTAINER="${DB_CONTAINER:-qoefi-dev-db}"
FORCE="${1:-}"

# Le dump le plus récent par date (tri lexicographique = tri chronologique
# avec le format YYYYMMDD).
MAIN_BACKUP="$(ls -1 "$BACKUP_DIR"/top-db-*.sql.gz 2>/dev/null | sort | tail -n 1 || true)"
if [ -z "$MAIN_BACKUP" ]; then
  echo "❌ Aucun backup trouvé dans $BACKUP_DIR (top-db-*.sql.gz)."
  echo "   Lance d'abord : ./scripts/backup-top-db.sh"
  exit 1
fi
UMAMI_BACKUP="${MAIN_BACKUP/top-db/umami}"

echo "💾 Dump à restaurer : $(basename "$MAIN_BACKUP")"
if [ ! -f "$UMAMI_BACKUP" ]; then
  echo "⚠️ Backup umami manquant ($UMAMI_BACKUP) — umami ne sera pas restaurée."
fi

if [ "$FORCE" != "-y" ]; then
  read -r -p "⚠️  Ceci REMPLACE les bases postgres et umami de $DB_CONTAINER. Continuer ? [y/N] " answer
  if [ "$answer" != "y" ] && [ "$answer" != "Y" ]; then
    echo "Abandon."
    exit 0
  fi
fi

echo "💾 Restauration base applicative (postgres)..."
docker exec -i "$DB_CONTAINER" \
  pg_restore -U postgres -d postgres --clean --if-exists --no-owner \
  < "$MAIN_BACKUP"
echo "✅ Base applicative restaurée"

if [ -f "$UMAMI_BACKUP" ]; then
  echo "📊 Restauration umami..."
  docker exec -i "$DB_CONTAINER" \
    pg_restore -U postgres -d umami --clean --if-exists --no-owner \
    < "$UMAMI_BACKUP"
  echo "✅ Umami restaurée"
fi

echo "✨ Restauration terminée : $(du -h "$MAIN_BACKUP" | cut -f1) depuis $(basename "$MAIN_BACKUP")"

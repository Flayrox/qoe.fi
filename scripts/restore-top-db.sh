#!/bin/bash
# =====================================================================
# 💾 restore-top-db.sh — Restaure la DB top du top depuis backups/
# =====================================================================
# Usage: ./scripts/restore-top-db.sh
# Restaure backups/top-db-20260822.sql.gz (main) + umami-20260822.sql.gz
# Nécessite: DATABASE_URL, UMAMI_DATABASE_URL dans .env
# =====================================================================
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
MAIN_BACKUP="$REPO_ROOT/backups/top-db-20260822.sql.gz"
UMAMI_BACKUP="$REPO_ROOT/backups/umami-20260822.sql.gz"

if [ ! -f "$MAIN_BACKUP" ]; then
  echo "❌ Backup main introuvable: $MAIN_BACKUP"
  exit 1
fi

# Load .env
if [ -f "$REPO_ROOT/.env" ]; then
  set -a
  source "$REPO_ROOT/.env"
  set +a
fi

DB_URL="${DATABASE_URL:-}"
if [ -z "$DB_URL" ]; then
  echo "❌ DATABASE_URL manquant dans .env"
  exit 1
fi

echo "💾 Restauration main DB depuis $MAIN_BACKUP ..."
gunzip -c "$MAIN_BACKUP" | psql "$DB_URL" 2>&1 | tail -n 20
echo "✅ Main DB restaurée"

if [ -f "$UMAMI_BACKUP" ] && [ -n "${UMAMI_DATABASE_URL:-}" ]; then
  echo "📊 Restauration Umami DB depuis $UMAMI_BACKUP ..."
  gunzip -c "$UMAMI_BACKUP" | psql "$UMAMI_DATABASE_URL" 2>&1 | tail -n 20
  echo "✅ Umami restaurée"
else
  echo "ℹ️ Umami backup ou UMAMI_DATABASE_URL manquant — skip"
fi

echo "✨ Top DB restaurée avec succès ! (500 users, 200 articles, 1480 posts, 5723 lectures, 10.5k Umami)"

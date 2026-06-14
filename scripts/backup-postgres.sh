#!/bin/bash
# =====================================================================
# 💾 backup-postgres.sh — Backup quotidien de la DB
# =====================================================================
# 📖 Lance ce script via cron sur ton VPS :
#    0 3 * * * /opt/qoe.fi/scripts/backup-postgres.sh
#
# Crée un dump SQL compressé dans le volume postgres_backups.
# Garde les 7 derniers backups, supprime les plus vieux.
# =====================================================================

set -euo pipefail

# ─── Configuration ───────────────────────────────────────────
DB_CONTAINER="${DB_CONTAINER:-qoefi-db}"
DB_USER="${POSTGRES_USER:-qoe}"
DB_NAME="${POSTGRES_DB:-qoe}"
BACKUP_DIR="${BACKUP_DIR:-/backups}"
RETENTION_DAYS="${RETENTION_DAYS:-7}"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="${BACKUP_DIR}/qoe_${TIMESTAMP}.sql.gz"

# ─── Créer le backup ───────────────────────────────────────
echo "💾 Backup de la DB ${DB_NAME}..."
mkdir -p "${BACKUP_DIR}"

# pg_dump dans le container db, pipe vers gzip
docker exec "${DB_CONTAINER}" \
  pg_dump -U "${DB_USER}" -d "${DB_NAME}" --clean --if-exists \
  | gzip > "${BACKUP_FILE}"

# Vérification
if [ ! -s "${BACKUP_FILE}" ]; then
  echo "❌ ERREUR : backup vide ou absent"
  exit 1
fi

BACKUP_SIZE=$(du -h "${BACKUP_FILE}" | cut -f1)
echo "✅ Backup créé : ${BACKUP_FILE} (${BACKUP_SIZE})"

# ─── Rotation (suppression vieux backups) ───────────────────
echo "🧹 Suppression des backups > ${RETENTION_DAYS} jours..."
find "${BACKUP_DIR}" -name "qoe_*.sql.gz" -mtime "+${RETENTION_DAYS}" -delete

# ─── Stats ─────────────────────────────────────────────────
REMAINING=$(ls "${BACKUP_DIR}"/qoe_*.sql.gz 2>/dev/null | wc -l)
echo "📦 Backups restants : ${REMAINING}"

# ─── Optionnel : upload vers S3 / Backblaze ──────────────────
# if [ -n "${S3_BUCKET:-}" ]; then
#   aws s3 cp "${BACKUP_FILE}" "s3://${S3_BUCKET}/postgres/${TIMESTAMP}.sql.gz"
# fi

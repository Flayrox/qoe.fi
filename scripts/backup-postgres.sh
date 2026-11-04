#!/bin/bash
# =====================================================================
# 💾 backup-postgres.sh — Backup quotidien robuste de PostgreSQL (Supabase)
# =====================================================================
# 📖 Lance ce script via cron sur ton VPS :
#    0 3 * * * /root/scripts/backup-postgres.sh >> /var/log/qoe-backup.log 2>&1
#
# Crée un dump SQL compressé avec somme de contrôle sha256 et vérification gzip.
# Rétention automatique des 14 derniers jours.
# =====================================================================

set -euo pipefail

# ─── Configuration ───────────────────────────────────────────
DB_CONTAINER="${DB_CONTAINER:-supabase-db}"
DB_USER="${POSTGRES_USER:-postgres}"
DB_NAME="${POSTGRES_DB:-postgres}"
BACKUP_DIR="${BACKUP_DIR:-/root/migration/daily-backups}"
RETENTION_DAYS="${RETENTION_DAYS:-14}"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="${BACKUP_DIR}/qoe_${TIMESTAMP}.sql.gz"

# ─── Créer le backup ───────────────────────────────────────
echo "💾 [$(date -u)] Démarrage du backup de la DB ${DB_NAME}..."
mkdir -p "${BACKUP_DIR}"

# pg_dump dans le container db, pipe vers gzip
docker exec "${DB_CONTAINER}" \
  pg_dump -U "${DB_USER}" -d "${DB_NAME}" --clean --if-exists \
  | gzip > "${BACKUP_FILE}"

# Vérification présence et taille non vide
if [ ! -s "${BACKUP_FILE}" ]; then
  echo "❌ ERREUR : backup vide ou absent"
  exit 1
fi

# Vérification intégrité gzip
if ! gzip -t "${BACKUP_FILE}"; then
  echo "❌ ERREUR : archive gzip corrompue"
  rm -f "${BACKUP_FILE}"
  exit 1
fi

# Calcul checksum sha256
sha256sum "${BACKUP_FILE}" > "${BACKUP_FILE}.sha256"

BACKUP_SIZE=$(du -h "${BACKUP_FILE}" | cut -f1)
echo "✅ Backup vérifié avec succès : ${BACKUP_FILE} (${BACKUP_SIZE})"

# Snapshot des configurations sensibles
CONF_BACKUP="${BACKUP_DIR}/config-snapshots"
mkdir -p "${CONF_BACKUP}"
[ -f /var/www/qoe.fi/.env.docker ] && cp /var/www/qoe.fi/.env.docker "${CONF_BACKUP}/env.docker.${TIMESTAMP}"
[ -f /var/www/supabase/docker/.env ] && cp /var/www/supabase/docker/.env "${CONF_BACKUP}/supabase.env.${TIMESTAMP}"

# ─── Rotation (suppression vieux backups) ───────────────────
echo "🧹 Suppression des backups > ${RETENTION_DAYS} jours..."
find "${BACKUP_DIR}" -name "qoe_*.sql.gz*" -mtime "+${RETENTION_DAYS}" -delete
find "${CONF_BACKUP}" -type f -mtime "+${RETENTION_DAYS}" -delete 2>/dev/null || true

# ─── Stats ─────────────────────────────────────────────────
REMAINING=$(ls "${BACKUP_DIR}"/qoe_*.sql.gz 2>/dev/null | wc -l)
echo "📦 Backups restants : ${REMAINING}"
echo "🎉 [$(date -u)] Fin de sauvegarde terminée sans incident."

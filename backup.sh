#!/usr/bin/env bash
# backup.sh — Respaldo de la base de datos del Turnero con rotación.
#
# Qué hace:
#   1. pg_dump (consistente) desde el contenedor, comprimido con gzip
#   2. Rota: conserva solo los últimos 14 respaldos
#
# Restauración (probar en una base scratch, nunca sobre la viva):
#   gunzip -c backups/turnero-YYYYMMDD-HHMMSS.sql.gz | \
#     podman exec -i turnero_db_1 psql -U turnero -d turnero_restaurada
#
# Automatización sugerida (respaldo diario 6:00, cron del servidor):
#   0 6 * * * cd /ruta/a/turnero && ./backup.sh >> backups/backup.log 2>&1
set -euo pipefail
cd "$(dirname "$0")"

BACKUP_DIR="./backups"
KEEP=14
mkdir -p "$BACKUP_DIR"

# Runtime: podman o docker
if command -v podman >/dev/null 2>&1; then CT="podman"; else CT="docker"; fi
DB_CONTAINER="turnero_db_1"
if ! $CT ps --format '{{.Names}}' | grep -q "^${DB_CONTAINER}$"; then
  echo "ERROR: no encuentro el contenedor $DB_CONTAINER. ¿Está corriendo el stack?"; exit 1
fi

STAMP=$(date +%Y%m%d-%H%M%S)
FILE="$BACKUP_DIR/turnero-$STAMP.sql.gz"

# --clean --if-exists: la restauración es idempotente (borra antes de crear)
$CT exec "$DB_CONTAINER" pg_dump -U turnero -d turnero --clean --if-exists | gzip > "$FILE"

# Rotación: conservar los últimos $KEEP por fecha
ls -1t "$BACKUP_DIR"/turnero-*.sql.gz 2>/dev/null | tail -n +$((KEEP + 1)) | xargs -r rm -f

echo "OK: $FILE ($(du -h "$FILE" | cut -f1)) — rotación: últimos $KEEP"

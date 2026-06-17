#!/bin/bash

# ShowDeal Database Backup Script
# Automated backup with rotation and optional S3 upload

set -e

# ============================================
# CONFIGURATION
# ============================================

BACKUP_DIR=${1:-"/opt/showdeal/backups"}
RETENTION_DAYS=${2:-30}
DB_NAME=${DB_NAME:-"showdeal_prod"}
DB_USER=${DB_USER:-"showdeal_user"}
DB_HOST=${DB_HOST:-"localhost"}
DB_PORT=${DB_PORT:-5432}

AWS_ENABLED=${AWS_ENABLED:-false}
S3_BUCKET=${S3_BUCKET:-"backups-showdeal"}

LOG_FILE="${BACKUP_DIR}/backups.log"
TIMESTAMP=$(date +%Y%m%d-%H%M%S)
BACKUP_FILE="${BACKUP_DIR}/${DB_NAME}-${TIMESTAMP}.sql.gz"

# ============================================
# FUNCTIONS
# ============================================

log() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

error_exit() {
  log "ERROR: $1"
  exit 1
}

# Ensure backup directory exists
mkdir -p "$BACKUP_DIR"

# ============================================
# BACKUP EXECUTION
# ============================================

log "Starting database backup: $DB_NAME"
log "Backup directory: $BACKUP_DIR"

# Check PostgreSQL connectivity
if ! PGPASSWORD="${POSTGRES_PASSWORD:-}" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -c "SELECT 1" > /dev/null 2>&1; then
  error_exit "Could not connect to PostgreSQL at $DB_HOST:$DB_PORT"
fi

log "Database connectivity verified"

# Create backup
log "Creating backup file: $BACKUP_FILE"

if ! PGPASSWORD="${POSTGRES_PASSWORD:-}" pg_dump \
  -h "$DB_HOST" \
  -p "$DB_PORT" \
  -U "$DB_USER" \
  -d "$DB_NAME" \
  --verbose \
  --format=plain \
  | gzip > "$BACKUP_FILE"; then
  error_exit "Backup failed"
fi

BACKUP_SIZE=$(du -h "$BACKUP_FILE" | cut -f1)
log "✅ Backup completed successfully: $BACKUP_SIZE"

# ============================================
# S3 UPLOAD (optional)
# ============================================

if [ "$AWS_ENABLED" == "true" ]; then
  log "Uploading backup to S3 bucket: $S3_BUCKET"

  if ! command -v aws &> /dev/null; then
    log "⚠️  AWS CLI not found, skipping S3 upload"
  else
    if aws s3 cp "$BACKUP_FILE" "s3://$S3_BUCKET/" --region us-east-1 --sse AES256; then
      log "✅ S3 upload completed"
    else
      log "⚠️  S3 upload failed, backup still available locally"
    fi
  fi
fi

# ============================================
# BACKUP ROTATION (delete old backups)
# ============================================

log "Cleaning up old backups (retention: $RETENTION_DAYS days)"

CUTOFF_DATE=$(date -d "$RETENTION_DAYS days ago" +%s)
DELETED_COUNT=0

while IFS= read -r file; do
  FILE_DATE=$(stat -c %Y "$file" 2>/dev/null || echo 0)

  if [ "$FILE_DATE" -lt "$CUTOFF_DATE" ]; then
    log "Deleting old backup: $(basename $file)"
    rm -f "$file"
    ((DELETED_COUNT++))
  fi
done < <(find "$BACKUP_DIR" -name "${DB_NAME}-*.sql.gz" -type f)

log "✅ Cleanup completed: Deleted $DELETED_COUNT old backups"

# ============================================
# BACKUP VERIFICATION
# ============================================

log "Verifying backup integrity"

if gzip -t "$BACKUP_FILE"; then
  log "✅ Backup integrity verified"
else
  log "⚠️  Warning: Backup file may be corrupted"
  exit 1
fi

# ============================================
# SUMMARY
# ============================================

BACKUP_COUNT=$(find "$BACKUP_DIR" -name "${DB_NAME}-*.sql.gz" -type f | wc -l)

log "=========================================="
log "BACKUP SUMMARY"
log "=========================================="
log "Database:       $DB_NAME"
log "Backup File:    $(basename $BACKUP_FILE)"
log "Size:           $BACKUP_SIZE"
log "Location:       $BACKUP_DIR"
log "Total Backups:  $BACKUP_COUNT"
log "=========================================="

log "✅ Backup job completed successfully"

exit 0

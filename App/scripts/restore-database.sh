#!/bin/bash

# ShowDeal Database Restore Script
# Restores database from backup

set -e

# ============================================
# CONFIGURATION
# ============================================

BACKUP_FILE=$1
DB_NAME=${2:-"showdeal_prod"}
DB_USER=${DB_USER:-"showdeal_user"}
DB_HOST=${DB_HOST:-"localhost"}
DB_PORT=${DB_PORT:-5432}

LOG_FILE="/var/log/showdeal-restore.log"

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

usage() {
  echo "Usage: ./restore-database.sh <backup_file> [database_name]"
  echo ""
  echo "Examples:"
  echo "  ./restore-database.sh /backups/showdeal_prod-20260620-120000.sql.gz"
  echo "  ./restore-database.sh /backups/showdeal_prod-20260620-120000.sql.gz showdeal_prod"
  exit 1
}

# ============================================
# VALIDATION
# ============================================

if [ -z "$BACKUP_FILE" ]; then
  usage
fi

if [ ! -f "$BACKUP_FILE" ]; then
  error_exit "Backup file not found: $BACKUP_FILE"
fi

log "ShowDeal Database Restore Script"
log "=========================================="
log "Backup File:    $BACKUP_FILE"
log "Database:       $DB_NAME"
log "Host:           $DB_HOST:$DB_PORT"
log "=========================================="

# Verify PostgreSQL connectivity
if ! PGPASSWORD="${POSTGRES_PASSWORD:-}" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d postgres -c "SELECT 1" > /dev/null 2>&1; then
  error_exit "Could not connect to PostgreSQL at $DB_HOST:$DB_PORT"
fi

log "PostgreSQL connectivity verified"

# ============================================
# PRE-RESTORE BACKUP
# ============================================

log "Creating pre-restore backup (safety measure)"
SAFE_BACKUP="/var/backups/${DB_NAME}-before-restore-$(date +%Y%m%d-%H%M%S).sql.gz"

if ! mkdir -p /var/backups; then
  log "⚠️  Could not create backup directory /var/backups"
else
  if PGPASSWORD="${POSTGRES_PASSWORD:-}" pg_dump \
    -h "$DB_HOST" \
    -p "$DB_PORT" \
    -U "$DB_USER" \
    -d "$DB_NAME" \
    2>/dev/null | gzip > "$SAFE_BACKUP"; then
    log "✅ Safety backup created: $SAFE_BACKUP"
  else
    log "⚠️  Could not create safety backup"
  fi
fi

# ============================================
# DROP & RECREATE DATABASE
# ============================================

log "Preparing database for restore..."

# Terminate all connections to the database
log "Terminating active connections"

PGPASSWORD="${POSTGRES_PASSWORD:-}" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d postgres <<EOF
SELECT pg_terminate_backend(pg_stat_activity.pid)
FROM pg_stat_activity
WHERE pg_stat_activity.datname = '$DB_NAME'
  AND pid <> pg_backend_pid();
EOF

sleep 2

# Drop existing database
log "Dropping existing database: $DB_NAME"

if ! PGPASSWORD="${POSTGRES_PASSWORD:-}" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d postgres -c "DROP DATABASE IF EXISTS $DB_NAME;"; then
  error_exit "Failed to drop database"
fi

log "✅ Database dropped"

# Create fresh database
log "Creating new database: $DB_NAME"

if ! PGPASSWORD="${POSTGRES_PASSWORD:-}" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d postgres -c "CREATE DATABASE $DB_NAME OWNER $DB_USER;"; then
  error_exit "Failed to create database"
fi

log "✅ Database created"

# ============================================
# RESTORE DATABASE
# ============================================

log "Starting database restore..."
log "This may take several minutes depending on backup size"

START_TIME=$(date +%s)

if ! gunzip -c "$BACKUP_FILE" | PGPASSWORD="${POSTGRES_PASSWORD:-}" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" > /dev/null 2>&1; then
  error_exit "Restore failed - database may be in inconsistent state"
fi

END_TIME=$(date +%s)
DURATION=$((END_TIME - START_TIME))

log "✅ Database restore completed in $DURATION seconds"

# ============================================
# POST-RESTORE VERIFICATION
# ============================================

log "Verifying restored database..."

# Check table count
TABLE_COUNT=$(PGPASSWORD="${POSTGRES_PASSWORD:-}" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -t -c "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='public';")
log "Tables found: $TABLE_COUNT"

# Check row counts for key tables
if [ "$TABLE_COUNT" -gt 0 ]; then
  log "Checking key tables..."

  PGPASSWORD="${POSTGRES_PASSWORD:-}" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" <<EOF
    \echo 'User count:'
    SELECT COUNT(*) FROM r_user;

    \echo 'Asset count:'
    SELECT COUNT(*) FROM r_asset;

    \echo 'Auction count:'
    SELECT COUNT(*) FROM r_auction;

    \echo 'Bid count:'
    SELECT COUNT(*) FROM r_bid;
EOF
else
  log "⚠️  Warning: No tables found in restored database"
fi

# ============================================
# SUMMARY
# ============================================

log ""
log "=========================================="
log "RESTORE COMPLETED SUCCESSFULLY"
log "=========================================="
log "Backup File:     $BACKUP_FILE"
log "Database:        $DB_NAME"
log "Duration:        ${DURATION}s"
log "Safety Backup:   $SAFE_BACKUP"
log "=========================================="
log ""
log "Next steps:"
log "1. Verify application can connect to restored database"
log "2. Run smoke tests to validate data integrity"
log "3. Monitor application logs for errors"
log "4. Keep safety backup in case rollback is needed"
log ""

exit 0

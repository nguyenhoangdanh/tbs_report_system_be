#!/bin/bash
# scripts/backup.sh
# Automated backup script for PostgreSQL

set -e

# Configuration
DB_HOST="${DB_HOST:-postgres-master}"
DB_PORT="${DB_PORT:-5432}"
DB_NAME="${DB_NAME:-weekly_report_backend}"
DB_USER="${DB_USER:-postgres}"
BACKUP_DIR="/backups"
ARCHIVE_DIR="/backups/archive"
RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-30}"

# Create backup directories
mkdir -p "$BACKUP_DIR/daily" "$BACKUP_DIR/weekly" "$BACKUP_DIR/monthly" "$ARCHIVE_DIR"

# Get current date
DATE=$(date +%Y%m%d_%H%M%S)
DAY=$(date +%u)  # 1=Monday, 7=Sunday
DAY_OF_MONTH=$(date +%d)

echo "Starting backup at $(date)"

# Function to perform backup
perform_backup() {
    local backup_type=$1
    local backup_file="$BACKUP_DIR/$backup_type/${DB_NAME}_${backup_type}_${DATE}.sql.gz"
    
    echo "Creating $backup_type backup: $backup_file"
    
    # Create compressed backup
    pg_dump -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" \
        --verbose --clean --if-exists --create \
        --format=custom --compress=9 \
        --file="$backup_file.custom"
    
    # Also create SQL backup for easier manual restore
    pg_dump -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" \
        --verbose --clean --if-exists --create \
        --format=plain | gzip > "$backup_file"
    
    echo "$backup_type backup completed: $backup_file"
    
    # Verify backup
    if [ -f "$backup_file" ] && [ -s "$backup_file" ]; then
        echo "$backup_type backup verified successfully"
        return 0
    else
        echo "ERROR: $backup_type backup failed or is empty"
        return 1
    fi
}

# Daily backup (always)
if perform_backup "daily"; then
    echo "Daily backup successful"
else
    echo "ERROR: Daily backup failed"
    exit 1
fi

# Weekly backup (on Sunday)
if [ "$DAY" -eq 7 ]; then
    if perform_backup "weekly"; then
        echo "Weekly backup successful"
    else
        echo "WARNING: Weekly backup failed"
    fi
fi

# Monthly backup (on 1st day of month)
if [ "$DAY_OF_MONTH" -eq "01" ]; then
    if perform_backup "monthly"; then
        echo "Monthly backup successful"
    else
        echo "WARNING: Monthly backup failed"
    fi
fi

# Cleanup old backups
echo "Cleaning up old backups..."

# Remove daily backups older than retention period
find "$BACKUP_DIR/daily" -name "*.sql.gz*" -mtime +$RETENTION_DAYS -delete
echo "Cleaned up daily backups older than $RETENTION_DAYS days"

# Remove weekly backups older than 12 weeks
find "$BACKUP_DIR/weekly" -name "*.sql.gz*" -mtime +84 -delete
echo "Cleaned up weekly backups older than 12 weeks"

# Remove monthly backups older than 12 months
find "$BACKUP_DIR/monthly" -name "*.sql.gz*" -mtime +365 -delete
echo "Cleaned up monthly backups older than 12 months"

# Remove WAL archives older than 7 days
find "$ARCHIVE_DIR" -name "*" -mtime +7 -delete
echo "Cleaned up WAL archives older than 7 days"

echo "Backup process completed at $(date)"

# Log backup status
echo "$(date): Backup completed successfully" >> "$BACKUP_DIR/backup.log"

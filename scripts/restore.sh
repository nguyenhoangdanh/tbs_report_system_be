#!/bin/bash
# scripts/restore.sh
# Database restore script

set -e

# Configuration
DB_HOST="${DB_HOST:-postgres-master}"
DB_PORT="${DB_PORT:-5432}"
DB_NAME="${DB_NAME:-weekly_report_backend}"
DB_USER="${DB_USER:-postgres}"
BACKUP_DIR="/backups"

# Function to show usage
usage() {
    echo "Usage: $0 <backup_file> [target_database]"
    echo "       $0 list                    # List available backups"
    echo "       $0 latest [daily|weekly|monthly]  # Restore latest backup"
    echo ""
    echo "Examples:"
    echo "  $0 /backups/daily/weekly_report_backend_daily_20241225_120000.sql.gz"
    echo "  $0 latest daily"
    echo "  $0 list"
    exit 1
}

# Function to list available backups
list_backups() {
    echo "Available backups:"
    echo ""
    echo "=== Daily Backups ==="
    ls -la "$BACKUP_DIR/daily/"*.sql.gz 2>/dev/null | tail -10 || echo "No daily backups found"
    echo ""
    echo "=== Weekly Backups ==="
    ls -la "$BACKUP_DIR/weekly/"*.sql.gz 2>/dev/null | tail -5 || echo "No weekly backups found"
    echo ""
    echo "=== Monthly Backups ==="
    ls -la "$BACKUP_DIR/monthly/"*.sql.gz 2>/dev/null | tail -5 || echo "No monthly backups found"
}

# Function to get latest backup
get_latest_backup() {
    local backup_type=${1:-daily}
    local latest_backup=$(ls -t "$BACKUP_DIR/$backup_type/"*.sql.gz 2>/dev/null | head -1)
    
    if [ -z "$latest_backup" ]; then
        echo "ERROR: No $backup_type backups found"
        exit 1
    fi
    
    echo "$latest_backup"
}

# Function to restore backup
restore_backup() {
    local backup_file=$1
    local target_db=${2:-$DB_NAME}
    
    if [ ! -f "$backup_file" ]; then
        echo "ERROR: Backup file not found: $backup_file"
        exit 1
    fi
    
    echo "Restoring backup: $backup_file"
    echo "Target database: $target_db"
    echo "WARNING: This will drop and recreate the database!"
    
    read -p "Are you sure? (y/N): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo "Restore cancelled"
        exit 0
    fi
    
    # Stop application if running
    echo "Stopping application..."
    docker stop weekly_report_backend 2>/dev/null || true
    
    # Create backup of current database
    echo "Creating backup of current database..."
    pg_dump -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$target_db" \
        --format=custom --compress=9 \
        --file="$BACKUP_DIR/pre_restore_backup_$(date +%Y%m%d_%H%M%S).custom" \
        2>/dev/null || echo "Warning: Could not backup current database"
    
    # Restore from backup
    echo "Restoring database..."
    if [[ "$backup_file" == *.custom ]]; then
        # Custom format backup
        pg_restore -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" \
            --dbname="$target_db" --clean --if-exists --create \
            --verbose "$backup_file"
    else
        # SQL format backup
        zcat "$backup_file" | psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d postgres
    fi
    
    echo "Database restored successfully"
    
    # Start application
    echo "Starting application..."
    docker start weekly_report_backend
    
    echo "Restore completed at $(date)"
}

# Main script logic
case "${1:-}" in
    "list")
        list_backups
        ;;
    "latest")
        backup_type=${2:-daily}
        latest_backup=$(get_latest_backup "$backup_type")
        echo "Latest $backup_type backup: $latest_backup"
        restore_backup "$latest_backup"
        ;;
    "")
        usage
        ;;
    *)
        if [ -f "$1" ]; then
            restore_backup "$1" "$2"
        else
            echo "ERROR: Invalid option or file not found: $1"
            usage
        fi
        ;;
esac

---
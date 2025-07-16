#!/bin/bash

# Database Backup Script
set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m'

log() { echo -e "${BLUE}[$(date +'%H:%M:%S')]${NC} $1"; }
success() { echo -e "${GREEN}✅ $1${NC}"; }
error() { echo -e "${RED}❌ $1${NC}"; }

export PATH="/home/hoangdanh2000/.fly/bin:$PATH"

BACKUP_DIR="./backups"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_FILE="$BACKUP_DIR/backup_$TIMESTAMP.sql"

# Create backup directory
mkdir -p "$BACKUP_DIR"

log "💾 Creating database backup..."

# Create backup using flyctl
flyctl ssh console -a weekly-report-backend -C "
    pg_dump \$DATABASE_URL --no-owner --no-privileges --clean --if-exists
" > "$BACKUP_FILE"

if [ -s "$BACKUP_FILE" ]; then
    success "Backup created: $BACKUP_FILE"
    
    # Compress backup
    log "🗜️  Compressing backup..."
    gzip "$BACKUP_FILE"
    
    success "Compressed backup: ${BACKUP_FILE}.gz"
    
    # Show backup info
    BACKUP_SIZE=$(du -h "${BACKUP_FILE}.gz" | cut -f1)
    log "📊 Backup size: $BACKUP_SIZE"
    
    # Clean old backups (keep last 7)
    log "🧹 Cleaning old backups..."
    find "$BACKUP_DIR" -name "backup_*.sql.gz" -type f -mtime +7 -delete
    
    REMAINING_BACKUPS=$(find "$BACKUP_DIR" -name "backup_*.sql.gz" -type f | wc -l)
    log "📁 Remaining backups: $REMAINING_BACKUPS"
    
else
    error "Backup failed - file is empty"
    rm -f "$BACKUP_FILE"
    exit 1
fi

success "🎉 Database backup completed!"

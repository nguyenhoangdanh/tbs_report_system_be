#!/bin/bash

# Local Database Reset Script
set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m'

log() { echo -e "${BLUE}[$(date +'%H:%M:%S')]${NC} $1"; }
success() { echo -e "${GREEN}✅ $1${NC}"; }
error() { echo -e "${RED}❌ $1${NC}"; }

log "🔄 Resetting local database..."

# Stop any running development server
pkill -f "npm.*start" || true

# Reset Docker volumes and restart
log "🐳 Resetting Docker containers..."
docker compose down -v
docker compose up postgres redis -d

# Wait for database
log "⏳ Waiting for database..."
timeout=60
while ! docker compose exec postgres pg_isready -U postgres -d weekly_report_dev >/dev/null 2>&1; do
    timeout=$((timeout - 1))
    if [ $timeout -eq 0 ]; then
        error "Database failed to start"
        exit 1
    fi
    sleep 1
done

# Setup fresh database
log "🔧 Setting up fresh database..."
./scripts/db/local-setup.sh

success "🎉 Local database reset completed!"

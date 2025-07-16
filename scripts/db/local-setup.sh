#!/bin/bash

# Local Database Setup Script
set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log() { echo -e "${BLUE}[$(date +'%H:%M:%S')]${NC} $1"; }
success() { echo -e "${GREEN}✅ $1${NC}"; }
warning() { echo -e "${YELLOW}⚠️  $1${NC}"; }
error() { echo -e "${RED}❌ $1${NC}"; }

log "🔧 Setting up local database..."

# Start Docker containers
log "🐳 Starting Docker containers..."
docker compose up postgres redis -d

# Wait for PostgreSQL
log "⏳ Waiting for PostgreSQL to be ready..."
timeout=60
while ! docker compose exec postgres pg_isready -U postgres -d weekly_report_dev >/dev/null 2>&1; do
    timeout=$((timeout - 1))
    if [ $timeout -eq 0 ]; then
        error "PostgreSQL failed to start within 60 seconds"
        exit 1
    fi
    sleep 1
done
success "PostgreSQL is ready"

# Generate Prisma client
log "📦 Generating Prisma client..."
npx prisma generate

# Apply schema
log "🗄️ Applying database schema..."
dotenv -e .env.local -- npx prisma db push

# Import data if script exists
if [ -f "prisma/import-all-data-from-excel.ts" ]; then
    log "📊 Importing data from Excel..."
    dotenv -e .env.local -- npx tsx prisma/import-all-data-from-excel.ts
else
    # Run seed if no import script
    if [ -f "prisma/seed.ts" ]; then
        log "🌱 Seeding database..."
        dotenv -e .env.local -- npx tsx prisma/seed.ts
    fi
fi

success "🎉 Local database setup completed!"
log "🌐 Access pgAdmin at: http://localhost:5050 (admin@example.com / admin123)"

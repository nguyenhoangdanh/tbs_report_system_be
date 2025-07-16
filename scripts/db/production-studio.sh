#!/bin/bash

# Production Database Studio Access Script
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

# Check if proxy is running
if ! ./scripts/db/proxy.sh status > /dev/null 2>&1; then
    log "🔗 Starting database proxy..."
    ./scripts/db/proxy.sh start
    sleep 5
fi

# Open Prisma Studio with production database via proxy
log "🎨 Opening Prisma Studio for production database..."
warning "This will connect to PRODUCTION database via proxy"
warning "Be careful with any changes!"

sleep 3

# Use studio environment that connects via proxy
dotenv -e .env.studio -- npx prisma studio

log "📝 Prisma Studio session ended"

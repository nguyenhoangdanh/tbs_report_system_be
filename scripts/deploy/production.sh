#!/bin/bash

# Production Deployment Script
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

export PATH="/home/hoangdanh2000/.fly/bin:$PATH"

log "🚀 Starting production deployment..."

# Build application
log "🔨 Building application..."
npm run build

# Deploy to Fly.io
log "📦 Deploying to Fly.io..."
flyctl deploy --strategy immediate

# Wait for deployment
log "⏳ Waiting for deployment to complete..."
sleep 30

# Run database migrations
log "🔄 Running database migrations..."
flyctl ssh console -a weekly-report-backend -C 'npx prisma migrate deploy'

# Verify deployment
log "🔍 Verifying deployment..."
if curl -f https://weekly-report-backend.fly.dev/health > /dev/null 2>&1; then
    success "Health endpoint is working"
else
    error "Health endpoint is not responding"
    exit 1
fi

if curl -f https://weekly-report-backend.fly.dev/api/health > /dev/null 2>&1; then
    success "API health endpoint is working"
else
    warning "API health endpoint is not responding"
fi

if curl -f https://weekly-report-backend.fly.dev/api/health/db > /dev/null 2>&1; then
    success "Database health endpoint is working"
else
    warning "Database health endpoint is not responding"
fi

# Ensure 24/7 operation
log "🔒 Ensuring 24/7 operation..."
./scripts/monitoring/ensure-24-7.sh

success "🎉 Production deployment completed successfully!"

log "📋 Deployment Summary:"
log "   🌐 Application: https://weekly-report-backend.fly.dev"
log "   🏥 Health: https://weekly-report-backend.fly.dev/health"
log "   📊 API: https://weekly-report-backend.fly.dev/api/health"
log "   💾 Database: https://weekly-report-backend.fly.dev/api/health/db"

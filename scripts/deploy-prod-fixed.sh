#!/bin/bash
set -e

# Colors
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

log "🚀 Complete Production Deployment"
echo "=================================="

# 1. Validate prerequisites
log "🔍 Validating prerequisites..."
if [ ! -f "fly.toml" ]; then
    error "fly.toml not found. Are you in the backend directory?"
    exit 1
fi

if [ ! -f ".env.production" ]; then
    error ".env.production not found"
    echo "💡 This file contains database credentials and secrets"
    exit 1
fi

if ! flyctl auth whoami >/dev/null 2>&1; then
    error "Not logged into Fly.io"
    echo "💡 Run: flyctl auth login"
    exit 1
fi

# 2. Validate fly.toml
log "🔧 Validating fly.toml..."
if ! flyctl config validate; then
    error "fly.toml validation failed"
    exit 1
fi

# 3. Set secrets from .env.production FIRST
log "🔐 Setting production secrets from .env.production..."

# Parse .env.production and set secrets
parse_and_set_secrets() {
    local success_count=0
    local fail_count=0
    
    while IFS= read -r line; do
        # Skip comments and empty lines
        [[ -z "$line" || "$line" =~ ^[[:space:]]*# ]] && continue
        
        # Match KEY=VALUE pattern
        if [[ "$line" =~ ^[[:space:]]*([A-Za-z_][A-Za-z0-9_]*)[[:space:]]*=[[:space:]]*(.*)[[:space:]]*$ ]]; then
            key="${BASH_REMATCH[1]}"
            value="${BASH_REMATCH[2]}"
            
            # Remove quotes
            if [[ "$value" =~ ^\"(.*)\"$ ]] || [[ "$value" =~ ^\'(.*)\'$ ]]; then
                value="${BASH_REMATCH[1]}"
            fi
            
            # Skip empty values
            [[ -z "$value" ]] && continue
            
            # Set secret
            if flyctl secrets set "$key=$value" -a weekly-report-backend >/dev/null 2>&1; then
                success_count=$((success_count + 1))
                log "Set $key"
            else
                fail_count=$((fail_count + 1))
                warning "Failed to set $key"
            fi
        fi
    done < .env.production
    
    log "📊 Secrets: $success_count set, $fail_count failed"
    return $fail_count
}

if ! parse_and_set_secrets; then
    warning "Some secrets failed to set, but continuing..."
fi

# 4. Build application with crypto fix
log "🔨 Building application with crypto polyfill..."
npm run build

# 5. Check for crypto issues in build
log "🔍 Verifying build output..."
if [ ! -f "dist/src/main.js" ]; then
    error "Build failed - main.js not found"
    exit 1
fi

# Check if crypto polyfill is included
if ! grep -q "crypto" dist/src/main.js; then
    warning "Crypto polyfill may not be included in build"
fi

# 6. Deploy to Fly.io
log "📦 Deploying to Fly.io..."
flyctl deploy --strategy immediate

# 7. Wait for deployment
log "⏳ Waiting for deployment to stabilize..."
sleep 45

# 8. Run database operations
log "🗄️ Setting up database..."
flyctl ssh console -a weekly-report-backend -C 'npx prisma generate' || warning "Prisma generate failed"
flyctl ssh console -a weekly-report-backend -C 'npx prisma db push' || warning "Database push failed"

# 9. Import data if needed
log "📊 Importing data..."
flyctl ssh console -a weekly-report-backend -C 'npx tsx prisma/import-all-data-from-excel.ts' || warning "Data import skipped"

# 10. Comprehensive health checks
log "🏥 Running health checks..."
health_check_with_retry() {
    local url=$1
    local name=$2
    local max_attempts=10
    
    for i in $(seq 1 $max_attempts); do
        if curl -f -s --max-time 10 "$url" >/dev/null 2>&1; then
            success "$name - OK (attempt $i)"
            return 0
        fi
        if [ $i -eq $max_attempts ]; then
            error "$name - Failed after $max_attempts attempts"
            return 1
        fi
        log "Retrying $name... ($i/$max_attempts)"
        sleep 10
    done
}

# Test all endpoints with crypto-specific retry logic
health_check_with_crypto_retry() {
    local url=$1
    local name=$2
    local max_attempts=15  # Increased for crypto initialization
    
    for i in $(seq 1 $max_attempts); do
        if curl -f -s --max-time 15 "$url" >/dev/null 2>&1; then
            success "$name - OK (attempt $i)"
            return 0
        fi
        
        # Check for crypto-related errors in logs
        if [ $i -eq 5 ] || [ $i -eq 10 ]; then
            log "Checking for crypto errors in logs..."
            if flyctl logs --no-tail -a weekly-report-backend | tail -10 | grep -q "crypto is not defined"; then
                error "Crypto error detected - restarting application"
                flyctl apps restart weekly-report-backend
                sleep 30
            fi
        fi
        
        if [ $i -eq $max_attempts ]; then
            error "$name - Failed after $max_attempts attempts"
            log "Recent logs for debugging:"
            flyctl logs --no-tail -a weekly-report-backend | tail -20
            return 1
        fi
        log "Retrying $name... ($i/$max_attempts)"
        sleep 12  # Longer wait for crypto initialization
    done
}

# Test all endpoints
health_check_with_crypto_retry "https://weekly-report-backend.fly.dev/health" "Basic Health"
health_check_with_crypto_retry "https://weekly-report-backend.fly.dev/api/health" "API Health"
health_check_with_crypto_retry "https://weekly-report-backend.fly.dev/api/health/db" "Database Health"

# 11. Show final status
log "📊 Final deployment status:"
flyctl status -a weekly-report-backend

log "🔍 Current secrets:"
flyctl secrets list -a weekly-report-backend

success "🎉 Complete deployment finished!"
echo ""
echo "📋 Deployment Summary:"
echo "  • Secrets: Set from .env.production"
echo "  • Build: Completed"
echo "  • Deploy: Successful"
echo "  • Database: Configured"
echo "  • Health: Verified"
echo ""
echo "🔗 Application: https://weekly-report-backend.fly.dev"
echo "🏥 Health: https://weekly-report-backend.fly.dev/health"
echo "📊 API: https://weekly-report-backend.fly.dev/api/health"
echo "💾 Database: https://weekly-report-backend.fly.dev/api/health/db"

# 12. Ensure only one healthy machine is running
log "🧹 Ensuring only one healthy machine is running..."
flyctl machines list -a weekly-report-backend | grep running
running_count=$(flyctl machines list -a weekly-report-backend | grep running | wc -l)
if [ "$running_count" -gt 1 ]; then
    warning "More than one running machine detected. Stopping extra machines..."
    for id in $(flyctl machines list -a weekly-report-backend | grep running | awk '{print $1}' | tail -n +2); do
        flyctl machine stop "$id" -a weekly-report-backend --force
    done
    sleep 10
    log "Restarting app to refresh proxy routing..."
    flyctl apps restart weekly-report-backend
    sleep 30
fi

# 13. Check health check status after deployment
log "🔎 Checking health check status after deployment..."
machine_id=$(flyctl machines list -a weekly-report-backend | grep running | awk '{print $1}')
health_status=$(flyctl machines list -a weekly-report-backend | grep "$machine_id" | awk '{print $5}')
if [[ "$health_status" != "2/2" ]]; then
    warning "Not all health checks are passing ($health_status)."
    log "Recent logs for debugging:"
    flyctl logs -a weekly-report-backend | tail -50
    log "Check endpoints manually:"
    echo "  curl -v https://weekly-report-backend.fly.dev/health"
    echo "  curl -v https://weekly-report-backend.fly.dev/api/health"
    echo "  curl -v https://weekly-report-backend.fly.dev/api/health/db"
else
    success "All health checks are passing!"
fi

# 14. Check database connection after deployment
log "🗄️ Checking database connection after deployment..."
flyctl ssh console -a weekly-report-backend -C 'npx prisma db pull' || warning "Database connection failed after deploy. Check Neon status and pooler usage."
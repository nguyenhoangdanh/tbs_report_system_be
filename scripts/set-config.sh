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

log "🔧 Setting production configuration from .env.production"
echo "==========================================================="

# Check if .env.production exists
if [ ! -f ".env.production" ]; then
    error ".env.production file not found!"
    echo "Please create .env.production file first"
    exit 1
fi

# Check if logged into Fly.io
if ! flyctl auth whoami >/dev/null 2>&1; then
    error "Not logged into Fly.io"
    echo "Run: flyctl auth login"
    exit 1
fi

log "📋 Reading .env.production file..."

# Function to extract and clean environment variables
extract_env_vars() {
    # Read .env.production, ignore comments and empty lines, clean quotes
    grep -v '^#' .env.production | grep -v '^$' | while IFS='=' read -r key value; do
        # Skip if key is empty
        [ -z "$key" ] && continue
        
        # Clean key (remove spaces)
        key=$(echo "$key" | tr -d ' ')
        
        # Clean value (remove quotes and trim spaces)
        value=$(echo "$value" | sed 's/^"//; s/"$//; s/^'\''//; s/'\''$//' | xargs)
        
        # Skip if value is empty
        [ -z "$value" ] && continue
        
        echo "$key=$value"
    done
}

# Extract variables
ENV_VARS=$(extract_env_vars)

if [ -z "$ENV_VARS" ]; then
    error "No valid environment variables found in .env.production"
    exit 1
fi

log "🔍 Found environment variables:"
echo "$ENV_VARS" | while IFS='=' read -r key value; do
    # Mask sensitive values
    if [[ "$key" == *"PASSWORD"* ]] || [[ "$key" == *"SECRET"* ]] || [[ "$key" == *"TOKEN"* ]]; then
        masked_value="${value:0:8}***"
        echo "  $key=$masked_value"
    else
        echo "  $key=$value"
    fi
done

echo ""
read -p "Continue setting these secrets on Fly.io? (y/N): " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    warning "Cancelled by user"
    exit 0
fi

log "🚀 Setting secrets on Fly.io..."

# Build flyctl secrets set command
SECRETS_CMD="flyctl secrets set"
SECRET_COUNT=0

echo "$ENV_VARS" | while IFS='=' read -r key value; do
    # Escape special characters in value
    escaped_value=$(printf '%q' "$value")
    SECRETS_CMD="$SECRETS_CMD $key=$escaped_value"
    SECRET_COUNT=$((SECRET_COUNT + 1))
done

# Add app name
SECRETS_CMD="$SECRETS_CMD -a weekly-report-backend"

log "📦 Setting $SECRET_COUNT secrets..."

# Execute the command
eval "$SECRETS_CMD"

if [ $? -eq 0 ]; then
    success "All secrets set successfully!"
else
    error "Failed to set secrets"
    exit 1
fi

log "🔍 Verifying secrets..."
flyctl secrets list -a weekly-report-backend

log "🔄 Restarting application to apply new configuration..."
flyctl apps restart weekly-report-backend

log "⏳ Waiting 30 seconds for application to restart..."
sleep 30

log "🏥 Testing application health..."
for i in {1..10}; do
    if curl -f -s https://weekly-report-backend.fly.dev/health >/dev/null 2>&1; then
        success "Application is healthy! (attempt $i)"
        break
    fi
    if [ $i -eq 10 ]; then
        error "Application health check failed after 10 attempts"
        warning "Check logs: flyctl logs -a weekly-report-backend"
        exit 1
    fi
    echo -n "."
    sleep 10
done

log "🔗 Testing endpoints..."
echo "================================"

# Test health endpoint
if curl -f -s https://weekly-report-backend.fly.dev/health >/dev/null 2>&1; then
    success "/health - OK"
else
    warning "/health - Failed"
fi

# Test API health endpoint
if curl -f -s https://weekly-report-backend.fly.dev/api/health >/dev/null 2>&1; then
    success "/api/health - OK"
else
    warning "/api/health - Failed"
fi

# Test database health endpoint
if curl -f -s https://weekly-report-backend.fly.dev/api/health/db >/dev/null 2>&1; then
    success "/api/health/db - OK"
else
    warning "/api/health/db - Failed (might need database setup)"
fi

log "📊 Final application status:"
flyctl status -a weekly-report-backend

success "🎉 Configuration setup completed!"
echo ""
echo "📋 Summary:"
echo "  • Secrets set from .env.production"
echo "  • Application restarted"
echo "  • Health checks performed"
echo ""
echo "🔗 Application URL: https://weekly-report-backend.fly.dev"
echo ""
echo "💡 Next steps (if needed):"
echo "  • Run database migrations: flyctl ssh console -a weekly-report-backend -C 'npx prisma db push'"
echo "  • Import data: flyctl ssh console -a weekly-report-backend -C 'npx tsx prisma/import-all-data-from-excel.ts'"
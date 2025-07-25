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

APP_NAME="weekly-report-backend"

log "🔍 Checking production secrets"
echo "============================="

# Check if flyctl is available and authenticated
if ! command -v flyctl >/dev/null 2>&1; then
    error "flyctl not found"
    exit 1
fi

if ! flyctl auth whoami >/dev/null 2>&1; then
    error "Not authenticated. Run: flyctl auth login"
    exit 1
fi

# Get secrets list
log "📋 Current secrets on $APP_NAME:"
secrets_output=$(flyctl secrets list -a $APP_NAME)
echo "$secrets_output"

# Count secrets
secret_count=$(echo "$secrets_output" | tail -n +2 | grep -c . || echo "0")
log "📊 Total secrets: $secret_count"

# List just the secret names
log "🔑 Secret names only:"
echo "$secrets_output" | tail -n +2 | awk '{print "  • " $1}'

# Check for required secrets
log "✅ Checking required secrets:"
required_secrets=(
    "DATABASE_URL"
    "DIRECT_URL" 
    "JWT_SECRET"
    "NODE_ENV"
    "PORT"
    "FRONTEND_URL"
    "COOKIE_DOMAIN"
)

missing_secrets=()
for secret in "${required_secrets[@]}"; do
    if echo "$secrets_output" | grep -q "^$secret"; then
        success "$secret - Present"
    else
        error "$secret - Missing"
        missing_secrets+=("$secret")
    fi
done

# Summary
echo ""
log "📊 Summary:"
echo "  • Total secrets: $secret_count"
echo "  • Required secrets: ${#required_secrets[@]}"
echo "  • Missing secrets: ${#missing_secrets[@]}"

if [ ${#missing_secrets[@]} -gt 0 ]; then
    warning "Missing secrets: ${missing_secrets[*]}"
    echo ""
    echo "💡 To set missing secrets, run:"
    echo "  ./set-config-fixed.sh"
else
    success "All required secrets are present!"
fi

# Show last updated info if available
log "📅 Secrets metadata (if available):"
flyctl secrets list -a $APP_NAME --json 2>/dev/null | jq -r '.[] | "\(.name): Last set \(.updated_at // "unknown")"' 2>/dev/null || echo "  JSON format not available or jq not installed"
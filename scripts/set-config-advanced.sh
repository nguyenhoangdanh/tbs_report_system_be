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

# Configuration
APP_NAME="weekly-report-backend"
ENV_FILE=".env.production"

log "🔧 Setting production configuration (Fixed Version)"
echo "=================================================="

# Validate prerequisites
validate_prerequisites() {
    if [ ! -f "$ENV_FILE" ]; then
        error "$ENV_FILE file not found!"
        exit 1
    fi

    if ! command -v flyctl >/dev/null 2>&1; then
        error "flyctl not found in PATH"
        exit 1
    fi

    if ! flyctl auth whoami >/dev/null 2>&1; then
        error "Not authenticated with Fly.io. Run: flyctl auth login"
        exit 1
    fi
}

# Parse .env file
parse_env_file() {
    local env_vars=()
    
    while IFS= read -r line; do
        # Skip empty lines and comments
        [[ -z "$line" || "$line" =~ ^[[:space:]]*# ]] && continue
        
        # Match KEY=VALUE pattern
        if [[ "$line" =~ ^[[:space:]]*([A-Za-z_][A-Za-z0-9_]*)[[:space:]]*=[[:space:]]*(.*)[[:space:]]*$ ]]; then
            key="${BASH_REMATCH[1]}"
            value="${BASH_REMATCH[2]}"
            
            # Remove surrounding quotes
            if [[ "$value" =~ ^\"(.*)\"$ ]] || [[ "$value" =~ ^\'(.*)\'$ ]]; then
                value="${BASH_REMATCH[1]}"
            fi
            
            # Skip empty values
            [[ -z "$value" ]] && continue
            
            env_vars+=("$key=$value")
        fi
    done < "$ENV_FILE"
    
    printf '%s\n' "${env_vars[@]}"
}

# Set secrets with better error handling
set_secrets_with_verbose() {
    local vars=("$@")
    local success_count=0
    local fail_count=0
    local failed_vars=()
    
    log "🔐 Setting secrets with verbose output..."
    
    for var in "${vars[@]}"; do
        IFS='=' read -r key value <<< "$var"
        
        log "Setting $key..."
        
        # Use different approaches for different types of values
        local cmd_output
        local cmd_result
        
        # Try setting with proper escaping
        cmd_output=$(flyctl secrets set "$key=$value" -a "$APP_NAME" 2>&1)
        cmd_result=$?
        
        if [ $cmd_result -eq 0 ]; then
            success_count=$((success_count + 1))
            success "$key set successfully"
        else
            fail_count=$((fail_count + 1))
            failed_vars+=("$key")
            error "Failed to set $key"
            echo "Error output: $cmd_output"
            
            # Try alternative method with quotes
            log "Retrying $key with quotes..."
            if flyctl secrets set "$key=\"$value\"" -a "$APP_NAME" >/dev/null 2>&1; then
                success "$key set with quotes"
                success_count=$((success_count + 1))
                fail_count=$((fail_count - 1))
                failed_vars=("${failed_vars[@]/$key}")
            fi
        fi
    done
    
    log "📊 Results: $success_count successful, $fail_count failed"
    
    if [ $fail_count -gt 0 ]; then
        error "Failed variables: ${failed_vars[*]}"
        return 1
    fi
    
    return 0
}

# Alternative: Set all secrets at once
set_secrets_bulk() {
    local vars=("$@")
    
    log "🚀 Setting all secrets at once..."
    
    # Build command
    local cmd="flyctl secrets set"
    for var in "${vars[@]}"; do
        IFS='=' read -r key value <<< "$var"
        # Properly escape the value
        cmd="$cmd $key=$(printf '%q' "$value")"
    done
    cmd="$cmd -a $APP_NAME"
    
    log "Executing bulk secret set..."
    if eval "$cmd"; then
        success "All secrets set via bulk method"
        return 0
    else
        error "Bulk method failed, trying individual method"
        return 1
    fi
}

# Main execution
main() {
    validate_prerequisites
    
    log "📋 Parsing $ENV_FILE..."
    
    # Parse environment variables
    mapfile -t env_vars < <(parse_env_file)
    
    if [ ${#env_vars[@]} -eq 0 ]; then
        error "No valid environment variables found in $ENV_FILE"
        exit 1
    fi
    
    # Remove duplicates (NODE_ENV appears twice)
    declare -A unique_vars
    for var in "${env_vars[@]}"; do
        IFS='=' read -r key value <<< "$var"
        unique_vars["$key"]="$value"
    done
    
    # Rebuild array without duplicates
    env_vars=()
    for key in "${!unique_vars[@]}"; do
        env_vars+=("$key=${unique_vars[$key]}")
    done
    
    log "🔍 Found ${#env_vars[@]} unique environment variables:"
    for var in "${env_vars[@]}"; do
        IFS='=' read -r key value <<< "$var"
        # Mask sensitive values
        if [[ "$key" =~ (PASSWORD|SECRET|TOKEN|KEY) ]]; then
            echo "  $key=${value:0:8}***"
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
    
    # Try bulk method first, fallback to individual
    if ! set_secrets_bulk "${env_vars[@]}"; then
        warning "Bulk method failed, trying individual method..."
        if ! set_secrets_with_verbose "${env_vars[@]}"; then
            error "Both bulk and individual methods failed"
            exit 1
        fi
    fi
    
    log "🔍 Verifying current secrets..."
    flyctl secrets list -a "$APP_NAME"
    
    log "🔄 Restarting application..."
    flyctl apps restart "$APP_NAME"
    
    log "⏳ Waiting for application restart..."
    sleep 45
    
    # Health checks
    log "🏥 Running health checks..."
    local health_urls=(
        "https://${APP_NAME}.fly.dev/health"
        "https://${APP_NAME}.fly.dev/api/health"
        "https://${APP_NAME}.fly.dev/api/health/db"
    )
    
    for url in "${health_urls[@]}"; do
        local endpoint=${url##*/}
        if curl -f -s --max-time 10 "$url" >/dev/null 2>&1; then
            success "/$endpoint - OK"
        else
            warning "/$endpoint - Failed"
        fi
    done
    
    log "📊 Final status:"
    flyctl status -a "$APP_NAME"
    
    success "🎉 Configuration applied successfully!"
    echo ""
    echo "🔗 Application: https://${APP_NAME}.fly.dev"
}

# Execute main function
main "$@"
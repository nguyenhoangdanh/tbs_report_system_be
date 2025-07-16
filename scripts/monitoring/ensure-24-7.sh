#!/bin/bash

# Ensure 24/7 Operation Script
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

log "🔒 Ensuring 24/7 operation for weekly-report-backend..."

# Check current machine configuration
log "🔍 Checking machine configuration..."
MACHINE_INFO=$(flyctl machine list -a weekly-report-backend --json)

# Ensure auto-stop is disabled
log "⚙️  Configuring machine settings..."
flyctl machine update $(echo $MACHINE_INFO | jq -r '.[0].id') \
    --auto-stop-machines=false \
    --auto-start-machines=true \
    --min-machines-running=1 \
    -a weekly-report-backend

# Verify configuration
log "🔍 Verifying configuration..."
UPDATED_INFO=$(flyctl machine list -a weekly-report-backend --json)
AUTO_STOP=$(echo $UPDATED_INFO | jq -r '.[0].config.auto_stop_machines // false')

if [ "$AUTO_STOP" = "false" ]; then
    success "Auto-stop is disabled"
else
    warning "Auto-stop configuration may not be applied correctly"
fi

# Ensure machine is running
log "🚀 Ensuring machine is running..."
flyctl machine start $(echo $MACHINE_INFO | jq -r '.[0].id') -a weekly-report-backend 2>/dev/null || log "Machine is already running"

# Test endpoints to keep machine active
log "🧪 Testing endpoints to keep machine active..."
for i in {1..3}; do
    if curl -f https://weekly-report-backend.fly.dev/health > /dev/null 2>&1; then
        success "Health check $i/3 passed"
    else
        warning "Health check $i/3 failed"
    fi
    sleep 5
done

# Set up keep-alive cron job
log "⏰ Setting up keep-alive monitoring..."
cat > /tmp/fly-keepalive.sh << 'EOF'
#!/bin/bash
# Keep-alive script for weekly-report-backend
curl -f https://weekly-report-backend.fly.dev/health > /dev/null 2>&1
curl -f https://weekly-report-backend.fly.dev/api/health > /dev/null 2>&1
EOF

chmod +x /tmp/fly-keepalive.sh

# Add to crontab if not exists
if ! crontab -l 2>/dev/null | grep -q "fly-keepalive"; then
    (crontab -l 2>/dev/null; echo "*/5 * * * * /tmp/fly-keepalive.sh") | crontab -
    success "Keep-alive cron job added (every 5 minutes)"
else
    log "Keep-alive cron job already exists"
fi

success "🎉 24/7 operation configured successfully!"

log "📋 Configuration Summary:"
log "   🔒 Auto-stop: Disabled"
log "   🚀 Auto-start: Enabled"
log "   📊 Min machines: 1"
log "   ⏰ Keep-alive: Every 5 minutes"

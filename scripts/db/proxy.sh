#!/bin/bash

# Database Proxy Script for VSCode Access
export PATH="/home/hoangdanh2000/.fly/bin:$PATH"

RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m'

log() { echo -e "${BLUE}[$(date +'%H:%M:%S')]${NC} $1"; }
success() { echo -e "${GREEN}✅ $1${NC}"; }
error() { echo -e "${RED}❌ $1${NC}"; }

PROXY_PORT=5434
PROXY_PID_FILE="/tmp/fly-db-proxy.pid"

start_proxy() {
    if [ -f "$PROXY_PID_FILE" ] && kill -0 $(cat "$PROXY_PID_FILE") 2>/dev/null; then
        log "Database proxy is already running on port $PROXY_PORT"
        return 0
    fi
    
    log "🔗 Starting database proxy on port $PROXY_PORT..."
    
    # Kill any existing process on the port
    lsof -ti:$PROXY_PORT | xargs kill -9 2>/dev/null || true
    
    # Start proxy in background
    flyctl proxy 5432:5432 -a weekly-report-backend-db --local-port $PROXY_PORT > /tmp/fly-proxy.log 2>&1 &
    PROXY_PID=$!
    echo $PROXY_PID > "$PROXY_PID_FILE"
    
    # Wait for proxy to be ready
    sleep 5
    
    if kill -0 $PROXY_PID 2>/dev/null; then
        success "Database proxy started successfully!"
        log "📋 Connection details for VSCode:"
        log "   Host: localhost"
        log "   Port: $PROXY_PORT"
        log "   Database: weekly_report_backend"
        log "   Username: postgres"
        log "   Password: TBSGroup2024SecurePass"
        log ""
        log "💡 Connection URL: postgres://postgres:TBSGroup2024SecurePass@localhost:$PROXY_PORT/weekly_report_backend"
        log "💡 Use 'npm run db:proxy-stop' to stop the proxy"
    else
        error "Failed to start database proxy"
        rm -f "$PROXY_PID_FILE"
        exit 1
    fi
}

stop_proxy() {
    if [ -f "$PROXY_PID_FILE" ]; then
        PID=$(cat "$PROXY_PID_FILE")
        if kill -0 $PID 2>/dev/null; then
            log "🛑 Stopping database proxy..."
            kill $PID
            rm -f "$PROXY_PID_FILE"
            success "Database proxy stopped"
        else
            log "Database proxy was not running"
            rm -f "$PROXY_PID_FILE"
        fi
    else
        log "Database proxy is not running"
    fi
    
    # Also kill any process using the port
    lsof -ti:$PROXY_PORT | xargs kill -9 2>/dev/null || true
}

check_proxy() {
    if [ -f "$PROXY_PID_FILE" ] && kill -0 $(cat "$PROXY_PID_FILE") 2>/dev/null; then
        success "Database proxy is running on port $PROXY_PORT"
        log "📊 Proxy logs:"
        tail -n 10 /tmp/fly-proxy.log 2>/dev/null || log "No logs available"
    else
        log "Database proxy is not running"
        rm -f "$PROXY_PID_FILE"
    fi
}

case "$1" in
    start)
        start_proxy
        ;;
    stop)
        stop_proxy
        ;;
    restart)
        stop_proxy
        sleep 2
        start_proxy
        ;;
    status|check)
        check_proxy
        ;;
    *)
        echo "Usage: $0 {start|stop|restart|status}"
        exit 1
        ;;
esac

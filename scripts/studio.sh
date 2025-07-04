#!/bin/bash
set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

export PATH="/home/hoangdanh2000/.fly/bin:$PATH"

MODE=${1:-"production"}

echo -e "${BLUE}🎨 Database Studio - Mode: ${MODE}${NC}"

if [ "$MODE" = "local" ]; then
    echo -e "${BLUE}🏠 Opening local database studio...${NC}"
    dotenv -e .env.local -- npx prisma studio
    
elif [ "$MODE" = "production" ]; then
    # Cleanup existing proxies
    pkill -f 'flyctl proxy' 2>/dev/null || true
    sleep 3
    
    # Start proxy
    echo -e "${BLUE}🌉 Starting database proxy...${NC}"
    flyctl proxy 5434:5432 -a weekly-report-backend-db &
    PROXY_PID=$!
    
    sleep 30
    
    # Start studio
    echo -e "${BLUE}🎨 Opening production database studio...${NC}"
    echo -e "${GREEN}✅ Studio at http://localhost:5555${NC}"
    echo -e "${YELLOW}💡 Press Ctrl+C to stop${NC}"
    
    npx dotenv -e .env.studio -- npx prisma studio &
    STUDIO_PID=$!
    
    # Cleanup function
    cleanup() {
        kill $PROXY_PID 2>/dev/null || true
        kill $STUDIO_PID 2>/dev/null || true
        pkill -f 'flyctl proxy' 2>/dev/null || true
        pkill -f 'prisma studio' 2>/dev/null || true
        exit 0
    }
    
    trap cleanup INT TERM
    wait
fi

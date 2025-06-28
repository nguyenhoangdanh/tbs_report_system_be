#!/bin/bash
set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

export PATH="/home/hoangdanh2000/.fly/bin:$PATH"

echo -e "${BLUE}🔗 Connecting to Production Database...${NC}"

# Kill existing proxies
pkill -f 'fly proxy' 2>/dev/null || true
sleep 2

# Check if database app is running
DB_STATUS=$(fly status -a weekly-report-backend-db 2>&1 || echo "ERROR")
if echo "$DB_STATUS" | grep -q "stopped\|ERROR"; then
    echo -e "${YELLOW}🔄 Starting database...${NC}"
    fly restart -a weekly-report-backend-db
    sleep 30
fi

# Start proxy
echo -e "${YELLOW}🌉 Starting database proxy on port 5433...${NC}"
fly proxy 5433:5432 -a weekly-report-backend-db &
PROXY_PID=$!

# Wait for proxy
sleep 15

# Test connection
if npx dotenv -e .env.studio -- npx prisma db execute --sql="SELECT 1;" 2>/dev/null; then
    echo -e "${GREEN}✅ Database connection successful!${NC}"
    echo -e "${BLUE}📋 Connection details:${NC}"
    echo "  • Host: localhost"
    echo "  • Port: 5433"
    echo "  • Database: weekly_report_backend"
    echo ""
    echo -e "${BLUE}🛠️ Available commands:${NC}"
    echo "  • Open Studio: pnpm db:studio"
    echo "  • Run migrations: pnpm db:prod:migrate"
    echo "  • Seed data: pnpm db:prod:seed"
    echo "  • Import Excel: pnpm db:prod:import"
    echo ""
    echo -e "${YELLOW}💡 Keep this terminal open to maintain connection${NC}"
    echo -e "${YELLOW}💡 Press Ctrl+C to stop the proxy${NC}"
    
    # Keep running
    wait
else
    echo -e "${RED}❌ Failed to connect to database${NC}"
    kill $PROXY_PID 2>/dev/null || true
    exit 1
fi

# Cleanup on exit
trap 'echo -e "\n${YELLOW}🔄 Stopping database proxy...${NC}"; pkill -f "fly proxy" 2>/dev/null || true; echo -e "${GREEN}✅ Proxy stopped${NC}"; exit 0' INT
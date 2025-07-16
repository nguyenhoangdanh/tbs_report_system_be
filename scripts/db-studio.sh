#!/bin/bash
set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

export PATH="/home/hoangdanh2000/.fly/bin:$PATH"

echo -e "${BLUE}🎨 Open Database Studio${NC}"
echo "======================"

# Check if .env.studio exists
if [ ! -f ".env.studio" ]; then
    echo -e "${RED}❌ .env.studio file not found${NC}"
    echo -e "${BLUE}💡 Run setup first: pnpm setup${NC}"
    exit 1
fi

# Cleanup existing proxies
echo -e "${YELLOW}🧹 Cleaning up existing connections...${NC}"
pkill -f 'flyctl proxy' 2>/dev/null || true
sleep 3

# Check database status
echo -e "${BLUE}📊 Checking database status...${NC}"
if ! flyctl status -a weekly-report-backend-db >/dev/null 2>&1; then
    echo -e "${RED}❌ No database found${NC}"
    echo -e "${BLUE}💡 Run setup first: pnpm setup${NC}"
    exit 1
fi

# Start proxy
echo -e "${BLUE}🌉 Starting database proxy...${NC}"
flyctl proxy 5434:5432 -a weekly-report-backend-db &
PROXY_PID=$!

# Wait for proxy
echo -e "${BLUE}⏳ Waiting for proxy...${NC}"
sleep 30

# Test connection with credentials from .env.studio
echo -e "${BLUE}🔍 Testing connection...${NC}"
DB_URL=$(grep "DATABASE_URL=" .env.studio | cut -d'"' -f2)

if echo "SELECT 1;" | psql "$DB_URL" >/dev/null 2>&1; then
    echo -e "${GREEN}✅ Connection successful${NC}"
else
    echo -e "${RED}❌ Connection failed${NC}"
    echo -e "${BLUE}💡 Check database credentials in .env.studio${NC}"
    kill $PROXY_PID 2>/dev/null || true
    exit 1
fi

# Start studio
echo -e "${BLUE}🎨 Opening Prisma Studio...${NC}"
echo -e "${GREEN}✅ Studio will open at http://localhost:5555${NC}"
echo -e "${YELLOW}💡 Keep this terminal open${NC}"
echo -e "${YELLOW}💡 Press Ctrl+C to stop${NC}"

npx dotenv -e .env.studio -- npx prisma studio &
STUDIO_PID=$!

# Cleanup function
cleanup() {
    echo -e "\n${YELLOW}🔄 Stopping services...${NC}"
    kill $PROXY_PID 2>/dev/null || true
    kill $STUDIO_PID 2>/dev/null || true
    pkill -f 'flyctl proxy' 2>/dev/null || true
    pkill -f 'prisma studio' 2>/dev/null || true
    echo -e "${GREEN}✅ All services stopped${NC}"
    exit 0
}

trap cleanup INT TERM
wait

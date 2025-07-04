#!/bin/bash
set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

export PATH="/home/hoangdanh2000/.fly/bin:$PATH"

echo -e "${BLUE}⚡ Quick Production Reset via Proxy${NC}"
echo "================================="

echo -e "${YELLOW}⚠️ This will reset production database via local proxy${NC}"
read -p "Continue? (y/N): " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo -e "${BLUE}ℹ️ Operation cancelled${NC}"
    exit 0
fi

# Load credentials
if [ -f ".env.production" ]; then
    export $(grep -E "^(DB_|DATABASE_URL)" .env.production | xargs)
else
    echo -e "${RED}❌ .env.production not found${NC}"
    exit 1
fi

# Start proxy in background
echo -e "${BLUE}🌉 Starting database proxy...${NC}"
flyctl proxy 5434:5432 -a weekly-report-backend-db &
PROXY_PID=$!

# Wait for proxy
sleep 10

# Cleanup function
cleanup() {
    echo -e "${BLUE}🧹 Cleaning up proxy...${NC}"
    kill $PROXY_PID 2>/dev/null || true
}
trap cleanup EXIT

# Test proxy connection
echo -e "${BLUE}🧪 Testing proxy connection...${NC}"
if ! PGPASSWORD=$DB_PASSWORD psql -h localhost -p 5434 -U $DB_USER -d $DB_NAME -c "SELECT 1;" >/dev/null 2>&1; then
    echo -e "${RED}❌ Proxy connection failed${NC}"
    exit 1
fi

echo -e "${GREEN}✅ Proxy connection working${NC}"

# Reset schema via proxy
echo -e "${BLUE}🔄 Resetting schema via proxy...${NC}"
PGPASSWORD=$DB_PASSWORD psql -h localhost -p 5434 -U $DB_USER -d $DB_NAME << 'EOF'
-- Drop and recreate schema
DROP SCHEMA IF EXISTS public CASCADE;
CREATE SCHEMA public;
GRANT ALL ON SCHEMA public TO postgres;
GRANT ALL ON SCHEMA public TO public;
EOF

echo -e "${GREEN}✅ Schema reset via proxy${NC}"

# Use proxy for schema deployment
echo -e "${BLUE}🏗️ Deploying schema via proxy...${NC}"
DATABASE_URL="postgres://$DB_USER:$DB_PASSWORD@localhost:5434/$DB_NAME" npx prisma db push

echo -e "${BLUE}📊 Importing data via proxy...${NC}"
if [ -f "prisma/data.xlsx" ]; then
    DATABASE_URL="postgres://$DB_USER:$DB_PASSWORD@localhost:5434/$DB_NAME" npx tsx prisma/import-all-data-from-excel.ts
else
    echo -e "${YELLOW}ℹ️ No Excel file found${NC}"
fi

# Test system
echo -e "${BLUE}🧪 Testing system...${NC}"
sleep 10

if curl -f -s https://weekly-report-backend.fly.dev/api/health/db >/dev/null; then
    echo -e "${GREEN}✅ System working${NC}"
else
    echo -e "${YELLOW}⚠️ System may need time to restart${NC}"
fi

echo -e "${GREEN}🎉 Quick reset completed via proxy!${NC}"

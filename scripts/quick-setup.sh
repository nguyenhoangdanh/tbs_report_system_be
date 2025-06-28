#!/bin/bash
# filepath: /home/hoangdanh2000/Desktop/TBS Group/bento-nestjs/weekly-work-report-system/backend/scripts/quick-setup.sh

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Set Fly.io path
export PATH="/home/hoangdanh2000/.fly/bin:$PATH"

echo -e "${BLUE}🚀 Quick Database Setup for Production...${NC}"

# Check if .env.studio exists
if [ ! -f ".env.studio" ]; then
    echo -e "${YELLOW}📝 Creating .env.studio file...${NC}"
    cat > .env.studio << EOF
DATABASE_URL="postgres://weekly_report_backend:AWVq27MHkURo5ns@localhost:5433/weekly_report_backend"
DIRECT_URL="postgres://weekly_report_backend:AWVq27MHkURo5ns@localhost:5433/weekly_report_backend"
EOF
    echo -e "${GREEN}✅ .env.studio created${NC}"
fi

# Kill any existing proxy
echo -e "${YELLOW}🔄 Cleaning up any existing proxy...${NC}"
pkill -f 'fly proxy.*5433:5432' 2>/dev/null || true
sleep 2

# Start proxy
echo -e "${YELLOW}🌉 Starting database proxy on port 5433...${NC}"
fly proxy 5433:5432 -a weekly-report-backend-db &
PROXY_PID=$!

# Wait for proxy to start
echo -e "${BLUE}⏳ Waiting for proxy to start...${NC}"
sleep 10

# Test connection
echo -e "${BLUE}🔍 Testing database connection...${NC}"
for i in {1..10}; do
    if npx dotenv -e .env.studio -- npx prisma db execute --sql="SELECT 1;" 2>/dev/null; then
        echo -e "${GREEN}✅ Database connection successful${NC}"
        break
    fi
    
    if [ $i -eq 10 ]; then
        echo -e "${RED}❌ Failed to connect to database after 10 attempts${NC}"
        kill $PROXY_PID 2>/dev/null || true
        exit 1
    fi
    
    echo -e "${YELLOW}⏳ Waiting for connection... (attempt $i/10)${NC}"
    sleep 3
done

# Run migrations
echo -e "${BLUE}🔄 Running database migrations...${NC}"
npx dotenv -e .env.studio -- npx prisma migrate deploy

# Seed basic data
echo -e "${BLUE}🌱 Seeding basic data...${NC}"
npx dotenv -e .env.studio -- tsx prisma/seed.ts

# Import Excel data if available
if [ -f "prisma/data.xlsx" ]; then
    echo -e "${BLUE}📊 Importing Excel data...${NC}"
    npx dotenv -e .env.studio -- tsx prisma/import-all-data-from-excel.ts
else
    echo -e "${YELLOW}⚠️  Excel file not found at prisma/data.xlsx${NC}"
    echo -e "${YELLOW}   You can add it later and run the import command${NC}"
fi

# Keep proxy running
echo -e "${GREEN}🎉 Database setup completed!${NC}"
echo -e "${BLUE}📋 Database proxy is running on port 5433${NC}"
echo -e "${BLUE}👤 Default users created:${NC}"
echo "  • SUPERADMIN: CEO001 / 123456"
echo "  • ADMIN: ADM001 / 123456"
echo "  • USER: USR001 / 123456"
echo ""
echo -e "${YELLOW}💡 Proxy is running in background (PID: $PROXY_PID)${NC}"
echo -e "${YELLOW}💡 You can now open Prisma Studio in another terminal:${NC}"
echo "     pnpm db:studio"
echo ""
echo -e "${YELLOW}💡 To stop the proxy later:${NC}"
echo "     kill $PROXY_PID"
echo "     or"
echo "     pkill -f 'fly proxy'"
echo ""

# Wait for user input to stop
read -p "Press Enter to stop the proxy and exit..."

# Clean up
echo -e "${BLUE}🔄 Stopping proxy...${NC}"
kill $PROXY_PID 2>/dev/null || true
pkill -f 'fly proxy.*5433:5432' 2>/dev/null || true
echo -e "${GREEN}✅ Proxy stopped${NC}"
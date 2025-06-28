#!/bin/bash
# filepath: /home/hoangdanh2000/Desktop/TBS Group/bento-nestjs/weekly-work-report-system/backend/scripts/import-data-production.sh

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Set Fly.io path
export PATH="/home/hoangdanh2000/.fly/bin:$PATH"

echo -e "${BLUE}📊 Importing data to PRODUCTION database...${NC}"

# Check if Excel file exists
if [ ! -f "prisma/data.xlsx" ]; then
    echo -e "${RED}❌ Excel file not found at prisma/data.xlsx${NC}"
    echo -e "${BLUE}📋 Expected Excel format:${NC}"
    echo "  Column A: MSNV (Employee Code)"
    echo "  Column B: HỌ VÀ TÊN (Full Name)"
    echo "  Column C: CD (Position)"
    echo "  Column D: VTCV (Job Position)"
    echo "  Column E: PHÒNG BAN (Department)"
    echo "  Column F: TRỰC THUỘC (Office)"
    echo "  Column G: PHONE (Phone Number)"
    exit 1
fi

echo -e "${GREEN}✅ Excel file found${NC}"

# Check if .env.studio exists
if [ ! -f ".env.studio" ]; then
    echo -e "${YELLOW}📝 Creating .env.studio file...${NC}"
    cat > .env.studio << EOF
DATABASE_URL="postgres://weekly_report_backend:AWVq27MHkURo5ns@localhost:15432/weekly_report_backend"
DIRECT_URL="postgres://weekly_report_backend:AWVq27MHkURo5ns@localhost:15432/weekly_report_backend"
EOF
    echo -e "${GREEN}✅ .env.studio created${NC}"
fi

# Kill any existing proxy
pkill -f 'fly proxy' 2>/dev/null || true
sleep 2

# Start proxy
echo -e "${YELLOW}🌉 Starting database proxy...${NC}"
fly proxy 15432:5432 -a weekly-report-backend-db &
PROXY_PID=$!
sleep 10

# Import data
echo -e "${YELLOW}📊 Importing Excel data...${NC}"
npx dotenv -e .env.studio -- tsx prisma/import-all-data-from-excel.ts

# Kill proxy
kill $PROXY_PID 2>/dev/null || true
pkill -f 'fly proxy' 2>/dev/null || true

echo -e "${GREEN}🎉 Production data import completed!${NC}"

# Test database
echo -e "${BLUE}🧪 Testing database...${NC}"
if curl -f -s https://weekly-report-backend.fly.dev/api/health/db > /dev/null; then
    echo -e "${GREEN}✅ Database test passed${NC}"
else
    echo -e "${YELLOW}⚠️  Database test failed, restarting app...${NC}"
    fly apps restart weekly-report-backend
    sleep 10
fi

echo -e "${BLUE}🧪 Test login with imported user:${NC}"
echo "  pnpm test:login"
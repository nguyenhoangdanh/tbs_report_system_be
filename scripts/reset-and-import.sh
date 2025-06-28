#!/bin/bash
# filepath: /home/hoangdanh2000/Desktop/TBS Group/bento-nestjs/weekly-work-report-system/backend/scripts/reset-and-import.sh

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Set Fly.io path
export PATH="/home/hoangdanh2000/.fly/bin:$PATH"

echo -e "${BLUE}🔄 Reset and Import Data Script${NC}"
echo "=================================================="

# Check environment
if [ "$1" = "local" ]; then
    ENVIRONMENT="local"
    echo -e "${BLUE}🎯 Target: LOCAL database${NC}"
elif [ "$1" = "production" ] || [ "$1" = "prod" ]; then
    ENVIRONMENT="production"
    echo -e "${BLUE}🎯 Target: PRODUCTION database${NC}"
else
    echo -e "${YELLOW}📋 Usage: $0 [local|production]${NC}"
    echo "  local      - Reset and import to local database"
    echo "  production - Reset and import to production database"
    exit 1
fi

# Confirmation for production
if [ "$ENVIRONMENT" = "production" ]; then
    echo -e "${RED}⚠️  WARNING: This will RESET the PRODUCTION database!${NC}"
    echo -e "${RED}All existing data will be PERMANENTLY DELETED!${NC}"
    read -p "Are you sure you want to continue? (type 'YES' to confirm): " confirm
    if [ "$confirm" != "YES" ]; then
        echo -e "${YELLOW}❌ Operation cancelled${NC}"
        exit 1
    fi
fi

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

if [ "$ENVIRONMENT" = "local" ]; then
    echo -e "${BLUE}🔄 Resetting LOCAL database...${NC}"
    
    # Reset local database
    npx prisma migrate reset --force
    
    # Import data
    echo -e "${BLUE}📊 Importing data to local database...${NC}"
    npx tsx prisma/seed.ts
    npx tsx prisma/import-all-data-from-excel.ts
    
    echo -e "${GREEN}✅ Local database reset and import completed!${NC}"
    
else
    echo -e "${BLUE}🔄 Resetting PRODUCTION database...${NC}"
    
    # Setup proxy
    if [ ! -f ".env.studio" ]; then
        cat > .env.studio << EOF
DATABASE_URL="postgres://weekly_report_backend:AWVq27MHkURo5ns@localhost:15432/weekly_report_backend"
DIRECT_URL="postgres://weekly_report_backend:AWVq27MHkURo5ns@localhost:15432/weekly_report_backend"
EOF
    fi
    
    # Kill any existing proxy
    pkill -f 'fly proxy' 2>/dev/null || true
    sleep 2
    
    # Start proxy
    echo -e "${YELLOW}🌉 Starting database proxy...${NC}"
    fly proxy 15432:5432 -a weekly-report-backend-db &
    PROXY_PID=$!
    sleep 10
    
    # Reset production database
    echo -e "${YELLOW}🗑️ Resetting production database...${NC}"
    npx dotenv -e .env.studio -- npx prisma migrate reset --force
    
    # Import data
    echo -e "${YELLOW}📊 Importing data to production database...${NC}"
    npx dotenv -e .env.studio -- tsx prisma/seed.ts
    npx dotenv -e .env.studio -- tsx prisma/import-all-data-from-excel.ts
    
    # Kill proxy
    kill $PROXY_PID 2>/dev/null || true
    pkill -f 'fly proxy' 2>/dev/null || true
    
    # Restart production app
    echo -e "${YELLOW}🔄 Restarting production app...${NC}"
    fly apps restart weekly-report-backend
    sleep 15
    
    echo -e "${GREEN}✅ Production database reset and import completed!${NC}"
    
    # Test production
    echo -e "${BLUE}🧪 Testing production app...${NC}"
    if curl -f -s https://weekly-report-backend.fly.dev/api/health/db > /dev/null; then
        echo -e "${GREEN}✅ Production health check passed${NC}"
    else
        echo -e "${RED}❌ Production health check failed${NC}"
    fi
fi

echo -e "${BLUE}🎉 Reset and import completed!${NC}"
echo -e "${BLUE}👤 Default users:${NC}"
echo "  • SUPERADMIN: CEO001 / 123456"
echo "  • ADMIN: ADM001 / 123456"
echo "  • USER: USR001 / 123456"

if [ "$ENVIRONMENT" = "production" ]; then
    echo -e "${BLUE}🧪 Test production login:${NC}"
    echo "  curl -X POST https://weekly-report-backend.fly.dev/api/auth/login -H 'Content-Type: application/json' -d '{\"employeeCode\":\"CEO001\",\"password\":\"123456\"}'"
fi
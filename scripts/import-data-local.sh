#!/bin/bash
# filepath: /home/hoangdanh2000/Desktop/TBS Group/bento-nestjs/weekly-work-report-system/backend/scripts/import-data-local.sh

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}📊 Importing data to LOCAL database...${NC}"

# Check if Excel file exists
if [ ! -f "prisma/data.xlsx" ]; then
    echo -e "${RED}❌ Excel file not found at prisma/data.xlsx${NC}"
    echo -e "${BLUE}📋 Please place your Excel file with the following format:${NC}"
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

# Check if local database is running
echo -e "${BLUE}🔍 Checking local database connection...${NC}"
if ! npx prisma db push --force-reset --accept-data-loss 2>/dev/null; then
    echo -e "${RED}❌ Cannot connect to local database${NC}"
    echo -e "${BLUE}💡 Make sure your local PostgreSQL is running or update DATABASE_URL in .env${NC}"
    exit 1
fi

echo -e "${GREEN}✅ Local database connected${NC}"

# Run migrations
echo -e "${BLUE}🔄 Running migrations...${NC}"
npx prisma migrate deploy

# Generate Prisma client
echo -e "${BLUE}🔄 Generating Prisma client...${NC}"
npx prisma generate

# Import basic seed data first
echo -e "${BLUE}🌱 Seeding basic data...${NC}"
npx tsx prisma/seed.ts

# Import Excel data
echo -e "${BLUE}📊 Importing Excel data...${NC}"
npx tsx prisma/import-all-data-from-excel.ts

echo -e "${GREEN}🎉 Local data import completed!${NC}"

# Test the import
echo -e "${BLUE}🧪 Testing import results...${NC}"
echo -e "${YELLOW}Checking user count...${NC}"
npx prisma db execute --sql="SELECT COUNT(*) as user_count FROM \"User\";"

echo -e "${BLUE}👤 Default test users:${NC}"
echo "  • SUPERADMIN: CEO001 / 123456"
echo "  • ADMIN: ADM001 / 123456"
echo "  • USER: USR001 / 123456"

echo -e "${BLUE}🚀 You can now start the development server:${NC}"
echo "  pnpm start:dev"
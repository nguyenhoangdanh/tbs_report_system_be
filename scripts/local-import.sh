#!/bin/bash
set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}📊 Local Excel Import via Proxy${NC}"
echo "================================="

# Check if data.xlsx exists
if [ ! -f "prisma/data.xlsx" ]; then
    echo -e "${RED}❌ data.xlsx not found in prisma/ folder${NC}"
    echo -e "${BLUE}💡 Please place your Excel file at: prisma/data.xlsx${NC}"
    exit 1
fi

# Check if proxy is running (should be from studio command)
if ! curl -f -s "http://localhost:5434" >/dev/null 2>&1; then
    echo -e "${YELLOW}⚠️ Database proxy not found on localhost:5434${NC}"
    echo -e "${BLUE}💡 Make sure 'pnpm studio' is running in another terminal${NC}"
    exit 1
fi

echo -e "${BLUE}🔍 Proxy detected, running import via local connection...${NC}"

# Run import with studio environment
dotenv -e .env.studio -- npx tsx prisma/import-all-data-from-excel.ts

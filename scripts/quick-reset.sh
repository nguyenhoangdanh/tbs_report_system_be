#!/bin/bash
set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

export PATH="/home/hoangdanh2000/.fly/bin:$PATH"

echo -e "${BLUE}⚡ Quick Production Schema Reset${NC}"
echo "=============================="

echo -e "${YELLOW}⚠️ This will reset production database schema${NC}"
read -p "Continue? (y/N): " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo -e "${BLUE}ℹ️ Operation cancelled${NC}"
    exit 0
fi

# Method 1: Try migrate reset
echo -e "${BLUE}🔄 Attempting migrate reset...${NC}"
if flyctl ssh console -a weekly-report-backend -C "npx prisma migrate reset --force" 2>/dev/null; then
    echo -e "${GREEN}✅ Migrate reset successful${NC}"
else
    echo -e "${YELLOW}⚠️ Migrate reset failed, trying db push...${NC}"
    
    # Method 2: Force push schema
    if flyctl ssh console -a weekly-report-backend -C "npx prisma db push --force-reset"; then
        echo -e "${GREEN}✅ Schema push successful${NC}"
    else
        echo -e "${RED}❌ Both methods failed${NC}"
        exit 1
    fi
fi

# Import data
echo -e "${BLUE}📊 Importing data...${NC}"
if flyctl ssh console -a weekly-report-backend -C "test -f prisma/data.xlsx && npx tsx prisma/import-all-data-from-excel.ts || echo 'No Excel file'"; then
    echo -e "${GREEN}✅ Data import completed${NC}"
else
    echo -e "${YELLOW}ℹ️ Data import skipped${NC}"
fi

# Test
echo -e "${BLUE}🧪 Testing system...${NC}"
if curl -f -s https://weekly-report-backend.fly.dev/api/health/db >/dev/null; then
    echo -e "${GREEN}✅ System working${NC}"
else
    echo -e "${YELLOW}⚠️ System may need time to restart${NC}"
fi

echo -e "${GREEN}🎉 Quick reset completed!${NC}"

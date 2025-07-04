#!/bin/bash
set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

export PATH="/home/hoangdanh2000/.fly/bin:$PATH"

echo -e "${BLUE}📊 FRESH Import with Current Database State${NC}"
echo "==========================================="

echo -e "${YELLOW}⚠️ This will import data to the CURRENT database state${NC}"
echo -e "${YELLOW}⚠️ Make sure you have run database reset if needed${NC}"
read -p "Continue with fresh import? (y/N): " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    exit 0
fi

# Step 1: Restart backend to clear any cached connections
echo -e "${BLUE}🔄 Restarting backend to clear cached connections...${NC}"
flyctl apps restart weekly-report-backend
sleep 45

# Step 2: Verify current database state
echo -e "${BLUE}🔍 Checking current database state...${NC}"
DB_STATE=$(flyctl ssh console -a weekly-report-backend -C "npx prisma db pull --print" 2>/dev/null || echo "failed")

if [[ "$DB_STATE" == *"failed"* ]]; then
    echo -e "${RED}❌ Cannot verify database state${NC}"
    exit 1
fi

echo -e "${GREEN}✅ Database connection verified${NC}"

# Step 3: Force fresh environment and run import
echo -e "${BLUE}📤 Running FRESH import...${NC}"
flyctl ssh console -a weekly-report-backend -C "
export NODE_ENV=production
unset PRISMA_CLIENT_LOG_LEVEL
npx tsx prisma/import-all-data-from-excel.ts
"

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✅ Fresh import completed successfully${NC}"
    
    # Step 4: Test the result
    echo -e "${BLUE}🧪 Testing import result...${NC}"
    LOGIN_TEST=$(curl -s -X POST https://weekly-report-backend.fly.dev/api/auth/login \
        -H "Content-Type: application/json" \
        -H "Origin: https://weeklyreport-orpin.vercel.app" \
        -d '{"employeeCode":"552502356","password":"123456"}' || echo "failed")
    
    if echo "$LOGIN_TEST" | grep -q '"access_token"'; then
        echo -e "${GREEN}🎉 SUCCESS! Import working correctly!${NC}"
    else
        echo -e "${YELLOW}⚠️ Import completed but authentication test failed${NC}"
    fi
else
    echo -e "${RED}❌ Fresh import failed${NC}"
    exit 1
fi

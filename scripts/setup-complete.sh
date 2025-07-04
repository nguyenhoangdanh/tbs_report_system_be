#!/bin/bash
set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

export PATH="/home/hoangdanh2000/.fly/bin:$PATH"

echo -e "${BLUE}🚀 Complete Production Setup${NC}"
echo "============================"
echo -e "${BLUE}📋 Process: Database → Deploy → Test${NC}"
echo ""

read -p "Continue with complete production setup? (y/N): " confirm
if [[ ! "$confirm" =~ ^([yY][eE][sS]|[yY])$ ]]; then
    echo -e "${YELLOW}❌ Setup cancelled${NC}"
    exit 0
fi

# Step 1: Setup database
echo -e "\n${BLUE}🗄️ Step 1: Setting up production database...${NC}"
./scripts/setup-database.sh production

# Step 2: Deploy backend
echo -e "\n${BLUE}🚀 Step 2: Deploying backend...${NC}"
./scripts/deploy.sh

# Step 3: Final tests
echo -e "\n${BLUE}🧪 Step 3: Final system tests...${NC}"

echo -e "${BLUE}Testing all endpoints...${NC}"
curl -f https://weekly-report-backend.fly.dev/health
curl -f https://weekly-report-backend.fly.dev/api/health
curl -f https://weekly-report-backend.fly.dev/api/health/db

echo -e "\n${BLUE}Testing authentication...${NC}"
LOGIN_RESULT=$(curl -s -X POST https://weekly-report-backend.fly.dev/api/auth/login \
    -H "Content-Type: application/json" \
    -H "Origin: https://weeklyreport-orpin.vercel.app" \
    -d '{"employeeCode":"CEO001","password":"123456"}')

if echo "$LOGIN_RESULT" | grep -q '"access_token"'; then
    echo -e "${GREEN}✅ Authentication test passed${NC}"
else
    echo -e "${YELLOW}⚠️ Authentication test failed${NC}"
fi

echo -e "\n${GREEN}🎉 Complete setup finished!${NC}"
echo -e "${BLUE}📊 System Configuration:${NC}"
echo "  • Backend: 512MB RAM, Singapore (~$2/month)"
echo "  • Database: 2GB storage, Singapore (~$4/month)"
echo "  • Total: ~$6/month"
echo ""
echo -e "${BLUE}👤 Test Accounts:${NC}"
echo "  • CEO001 / 123456 (SUPERADMIN)"
echo "  • ADM001 / 123456 (ADMIN)"
echo "  • USR001 / 123456 (USER)"
echo ""
echo -e "${BLUE}🛠️ Management Commands:${NC}"
echo "  • Studio: pnpm studio"
echo "  • Logs: pnpm logs"
echo "  • Status: pnpm status"
echo "  • Scale: pnpm scale:1024 (if more performance needed)"

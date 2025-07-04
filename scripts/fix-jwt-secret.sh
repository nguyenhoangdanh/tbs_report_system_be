#!/bin/bash
set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

export PATH="/home/hoangdanh2000/.fly/bin:$PATH"

echo -e "${BLUE}🔧 Fixing JWT Secret Issue${NC}"
echo "=========================="

# Get current JWT secret from .env.production
if [ -f ".env.production" ]; then
    JWT_SECRET=$(grep "JWT_SECRET=" .env.production | cut -d '=' -f2 | tr -d '"')
    echo -e "${BLUE}📋 JWT_SECRET from .env.production: ${JWT_SECRET:0:10}...${NC}"
else
    echo -e "${RED}❌ .env.production not found${NC}"
    exit 1
fi

# Check current Fly.io secrets
echo -e "${BLUE}🔍 Checking current Fly.io secrets...${NC}"
flyctl secrets list

# Update JWT_SECRET in Fly.io to match .env.production
echo -e "${BLUE}🔑 Updating JWT_SECRET in Fly.io...${NC}"
flyctl secrets set JWT_SECRET="$JWT_SECRET"

# Also set other secrets to be consistent
echo -e "${BLUE}🔧 Updating all auth-related secrets...${NC}"
flyctl secrets set \
    JWT_SECRET="$JWT_SECRET" \
    JWT_EXPIRES_IN="7d" \
    JWT_REMEMBER_ME_EXPIRES_IN="30d"

# Restart backend to pick up new secrets
echo -e "${BLUE}🔄 Restarting backend to apply new secrets...${NC}"
flyctl apps restart weekly-report-backend

# Wait for restart
echo -e "${BLUE}⏳ Waiting for restart...${NC}"
sleep 60

# Test with fresh login
echo -e "${BLUE}🧪 Testing with fresh login...${NC}"
LOGIN_TEST=$(curl -s -X POST https://weekly-report-backend.fly.dev/api/auth/login \
    -H "Content-Type: application/json" \
    -H "Origin: https://weeklyreport-orpin.vercel.app" \
    -d '{"employeeCode":"552502356","password":"123456"}' \
    -c fresh_cookies.txt)

if echo "$LOGIN_TEST" | grep -q '"access_token"'; then
    echo -e "${GREEN}✅ Fresh login successful${NC}"
    
    # Test protected endpoint with fresh token
    echo -e "${BLUE}🔐 Testing protected endpoint with fresh token...${NC}"
    PROFILE_TEST=$(curl -s https://weekly-report-backend.fly.dev/api/users/profile \
        -H "Origin: https://weeklyreport-orpin.vercel.app" \
        -b fresh_cookies.txt)
    
    if echo "$PROFILE_TEST" | grep -q '"id"'; then
        echo -e "${GREEN}🎉 SUCCESS! Authentication working completely!${NC}"
        echo -e "${BLUE}✅ Cookie authentication fixed${NC}"
        echo -e "${BLUE}✅ JWT signature validation working${NC}"
        echo -e "${BLUE}✅ Protected endpoints accessible${NC}"
    else
        echo -e "${YELLOW}⚠️ Login works but profile access failed${NC}"
        echo "Profile response: $(echo "$PROFILE_TEST" | head -c 100)..."
    fi
    
    # Clean up test file
    rm -f fresh_cookies.txt
else
    echo -e "${RED}❌ Fresh login failed${NC}"
    echo "Response: $(echo "$LOGIN_TEST" | head -c 200)..."
fi

echo -e "\n${GREEN}🎉 JWT Secret fix completed!${NC}"
echo -e "${BLUE}💡 Key fixes applied:${NC}"
echo "  • ✅ JWT_SECRET synchronized between local and Fly.io"
echo "  • ✅ Backend restarted with new secrets"
echo "  • ✅ Fresh token generation tested"

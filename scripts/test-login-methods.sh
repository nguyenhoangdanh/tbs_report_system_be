#!/bin/bash
set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}🧪 Testing Login Methods with @tbsgroup.vn${NC}"
echo "============================================="

API_BASE="https://weekly-report-backend.fly.dev/api"

# Test cases
echo -e "\n${BLUE}📋 Test 1: Login with MSNV (numeric)${NC}"
MSNV_TEST=$(curl -s -X POST $API_BASE/auth/login \
    -H "Content-Type: application/json" \
    -H "Origin: https://weeklyreport-orpin.vercel.app" \
    -d '{"employeeCode":"552502356","password":"123456"}' || echo "failed")

if echo "$MSNV_TEST" | grep -q '"access_token"'; then
    echo -e "${GREEN}✅ MSNV login successful${NC}"
    USER_EMAIL=$(echo "$MSNV_TEST" | grep -o '"email":"[^"]*"' | cut -d'"' -f4)
    echo -e "${BLUE}📧 User email: $USER_EMAIL${NC}"
    
    # Extract email prefix for next test
    EMAIL_PREFIX=$(echo "$USER_EMAIL" | cut -d'@' -f1)
    echo -e "${BLUE}🔤 Email prefix: $EMAIL_PREFIX${NC}"
    
    # Test login with email prefix  
    echo -e "\n${BLUE}📋 Test 2: Login with Email Prefix (expecting @tbsgroup.vn)${NC}"
    echo -e "${BLUE}🔍 Testing: $EMAIL_PREFIX -> $USER_EMAIL${NC}"
    
    PREFIX_TEST=$(curl -s -X POST $API_BASE/auth/login \
        -H "Content-Type: application/json" \
        -H "Origin: https://weeklyreport-orpin.vercel.app" \
        -d "{\"employeeCode\":\"$EMAIL_PREFIX\",\"password\":\"123456\"}" || echo "failed")
    
    if echo "$PREFIX_TEST" | grep -q '"access_token"'; then
        echo -e "${GREEN}✅ Email prefix login successful${NC}"
        
        # Verify same user
        PREFIX_EMAIL=$(echo "$PREFIX_TEST" | grep -o '"email":"[^"]*"' | cut -d'"' -f4)
        if [ "$USER_EMAIL" = "$PREFIX_EMAIL" ]; then
            echo -e "${GREEN}✅ Both methods return same user${NC}"
        else
            echo -e "${YELLOW}⚠️ Different users returned${NC}"
            echo "MSNV email: $USER_EMAIL"
            echo "Prefix email: $PREFIX_EMAIL"
        fi
    else
        echo -e "${RED}❌ Email prefix login failed${NC}"
        echo "Response: $(echo "$PREFIX_TEST" | head -c 200)..."
        
        # Debug: Show what we're looking for
        echo -e "${BLUE}🔍 Debug info:${NC}"
        echo "Looking for user with email: ${EMAIL_PREFIX}@tbsgroup.vn"
        echo "Original email from MSNV: $USER_EMAIL"
    fi
    
else
    echo -e "${RED}❌ MSNV login failed${NC}"
    echo "Response: $(echo "$MSNV_TEST" | head -c 200)..."
fi

# Test specific known email prefixes
echo -e "\n${BLUE}📋 Test 3: Testing Known Email Prefixes${NC}"

# Test common prefixes that should exist
for prefix in "danhnh" "admin" "ceo001"; do
    echo -e "${BLUE}🔍 Testing prefix: $prefix${NC}"
    
    TEST_RESULT=$(curl -s -X POST $API_BASE/auth/login \
        -H "Content-Type: application/json" \
        -H "Origin: https://weeklyreport-orpin.vercel.app" \
        -d "{\"employeeCode\":\"$prefix\",\"password\":\"123456\"}" || echo "failed")
    
    if echo "$TEST_RESULT" | grep -q '"access_token"'; then
        FOUND_EMAIL=$(echo "$TEST_RESULT" | grep -o '"email":"[^"]*"' | cut -d'"' -f4)
        echo -e "${GREEN}✅ $prefix -> $FOUND_EMAIL${NC}"
    else
        echo -e "${YELLOW}⚠️ $prefix -> User not found${NC}"
    fi
done

# Test edge cases
echo -e "\n${BLUE}📋 Test 4: Edge Cases${NC}"

# Test invalid formats
for invalid in "123abc" "a" "toolongusernamehere" ""; do
    if [ -z "$invalid" ]; then
        echo -e "${BLUE}🔍 Testing empty input...${NC}"
        continue
    fi
    
    echo -e "${BLUE}🔍 Testing invalid format: '$invalid'${NC}"
    
    INVALID_TEST=$(curl -s -X POST $API_BASE/auth/login \
        -H "Content-Type: application/json" \
        -H "Origin: https://weeklyreport-orpin.vercel.app" \
        -d "{\"employeeCode\":\"$invalid\",\"password\":\"123456\"}" || echo "failed")
    
    if echo "$INVALID_TEST" | grep -q '"access_token"'; then
        echo -e "${RED}❌ Should have failed for: $invalid${NC}"
    else
        echo -e "${GREEN}✅ Correctly rejected: $invalid${NC}"
    fi
done

echo -e "\n${GREEN}🎉 Login method testing completed!${NC}"
echo -e "${BLUE}💡 Summary:${NC}"
echo "  ✅ MSNV (numeric only): e.g., 552502356"
echo "  ✅ Email Prefix (letters): e.g., danhnh (searches for danhnh@tbsgroup.vn)"
echo "  ❌ Full Email: e.g., danhnh@tbsgroup.vn (not supported as input)"
echo "  ❌ Mixed/Invalid: Must be either all digits or letters only"

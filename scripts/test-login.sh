#!/bin/bash
# filepath: /home/hoangdanh2000/Desktop/TBS Group/bento-nestjs/weekly-work-report-system/backend/scripts/test-login.sh

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}🧪 Testing login with real users from database...${NC}"

# Check if .env.studio exists
if [ ! -f ".env.studio" ]; then
    echo -e "${RED}❌ .env.studio file not found${NC}"
    echo -e "${BLUE}💡 Run: pnpm db:connect first${NC}"
    exit 1
fi

# Function to test login
test_login() {
    local employeeCode=$1
    local password=$2
    local description=$3
    
    echo -e "\n${BLUE}🔍 Testing login: ${description}${NC}"
    echo "  Employee Code: ${employeeCode}"
    echo "  Password: ${password}"
    
    response=$(curl -s -w "\n%{http_code}" -X POST https://weekly-report-backend.fly.dev/api/auth/login \
        -H "Content-Type: application/json" \
        -H "Origin: https://weeklyreport-orpin.vercel.app" \
        -d "{\"employeeCode\":\"${employeeCode}\",\"password\":\"${password}\"}")
    
    http_code=$(echo "$response" | tail -n1)
    response_body=$(echo "$response" | head -n -1)
    
    if [ "$http_code" = "200" ]; then
        echo -e "${GREEN}✅ Success (200)${NC}"
        echo "$response_body" | jq -r '.message // .user.firstName + " " + .user.lastName' 2>/dev/null || echo "$response_body"
    else
        echo -e "${RED}❌ Failed ($http_code)${NC}"
        echo "$response_body" | jq -r '.message // .error // .' 2>/dev/null || echo "$response_body"
    fi
}

# Get some real employee codes from database via proxy
echo -e "${BLUE}🔍 Getting real employee codes from database...${NC}"

# Check if proxy is running
if ! npx dotenv -e .env.studio -- npx prisma db execute --sql="SELECT 1;" 2>/dev/null; then
    echo -e "${RED}❌ Database proxy not running${NC}"
    echo -e "${BLUE}💡 Start proxy in another terminal: pnpm db:connect${NC}"
    exit 1
fi

# Get sample users from database
sample_users=$(npx dotenv -e .env.studio -- npx prisma db execute --sql="
SELECT \"employeeCode\", \"firstName\", \"lastName\", \"role\", \"isActive\"
FROM \"User\" 
WHERE \"isActive\" = true 
ORDER BY \"role\" DESC, \"employeeCode\" 
LIMIT 10;
" 2>/dev/null)

echo -e "${GREEN}✅ Found users in database:${NC}"
echo "$sample_users"

echo -e "\n${BLUE}🧪 Testing login with different users...${NC}"

# Test with default seed users (if they exist)
test_login "CEO001" "123456" "Default CEO (from seed)"
test_login "ADM001" "123456" "Default Admin (from seed)"
test_login "USR001" "123456" "Default User (from seed)"

# Test with the employeeCode from your screenshot
test_login "552502356" "123456" "User from screenshot"

# Test with first few users from database (assuming password is 123456)
first_employee=$(echo "$sample_users" | tail -n +2 | head -n 1 | awk '{print $1}' | tr -d '|' | xargs)
if [ ! -z "$first_employee" ]; then
    test_login "$first_employee" "123456" "First user from database"
fi

echo -e "\n${BLUE}🔍 If all tests fail, checking password hash...${NC}"

# Check password hash for a specific user
user_check=$(npx dotenv -e .env.studio -- npx prisma db execute --sql="
SELECT \"employeeCode\", \"firstName\", \"lastName\", \"isActive\", 
       SUBSTRING(\"password\", 1, 20) as password_start
FROM \"User\" 
WHERE \"employeeCode\" IN ('CEO001', 'ADM001', 'USR001', '552502356')
ORDER BY \"employeeCode\";
" 2>/dev/null)

echo -e "${BLUE}User details from database:${NC}"
echo "$user_check"

echo -e "\n${YELLOW}💡 Troubleshooting tips:${NC}"
echo "1. Check if users exist with: pnpm db:studio"
echo "2. Reset passwords with: npx dotenv -e .env.studio -- tsx prisma/seed.ts"
echo "3. Check API logs with: pnpm logs"
echo "4. Test API health: curl https://weekly-report-backend.fly.dev/api/health"
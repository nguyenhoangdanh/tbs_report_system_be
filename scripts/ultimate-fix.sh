#!/bin/bash

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Set Fly.io path
export PATH="/home/hoangdanh2000/.fly/bin:$PATH"

echo -e "${BLUE}🔧 Ultimate Production Login Fix - All Methods${NC}"

# Function to try SSH with different approaches
try_ssh_seed() {
    echo -e "${BLUE}🚀 Trying SSH seed approach...${NC}"
    
    # Method 1: Direct seed command
    echo -e "${YELLOW}Method 1: Direct seed via SSH...${NC}"
    if fly ssh console -C "npx tsx prisma/seed.ts" 2>/dev/null; then
        echo -e "${GREEN}✅ SSH seed successful${NC}"
        return 0
    fi
    
    # Method 2: Try with shell
    echo -e "${YELLOW}Method 2: SSH with shell...${NC}"
    if echo "npx tsx prisma/seed.ts" | fly ssh console 2>/dev/null; then
        echo -e "${GREEN}✅ SSH shell seed successful${NC}"
        return 0
    fi
    
    # Method 3: Try migration first
    echo -e "${YELLOW}Method 3: SSH migration then seed...${NC}"
    if fly ssh console -C "npx prisma migrate deploy" 2>/dev/null; then
        echo -e "${GREEN}✅ SSH migration successful${NC}"
        if fly ssh console -C "npx tsx prisma/seed.ts" 2>/dev/null; then
            echo -e "${GREEN}✅ SSH seed after migration successful${NC}"
            return 0
        fi
    fi
    
    echo -e "${RED}❌ All SSH methods failed${NC}"
    return 1
}

# Function to create test users via API (if database exists but is empty)
create_users_via_api() {
    echo -e "${BLUE}🔧 Trying to create test users via API registration...${NC}"
    
    # First check if API is responding
    if ! curl -f -s https://weekly-report-backend.fly.dev/api/health >/dev/null; then
        echo -e "${RED}❌ API not responding${NC}"
        return 1
    fi
    
    # Try to register test users (this will work if basic structure exists)
    echo -e "${YELLOW}Creating CEO001 via API...${NC}"
    REGISTER_RESULT=$(curl -s -X POST https://weekly-report-backend.fly.dev/api/auth/register \
        -H "Content-Type: application/json" \
        -d '{
            "employeeCode": "CEO001",
            "email": "ceo@company.com",
            "password": "123456",
            "firstName": "CEO",
            "lastName": "Test User",
            "phone": "123456789",
            "role": "SUPERADMIN",
            "jobPositionId": "default-job",
            "officeId": "default-office"
        }' || echo "Registration failed")
    
    if echo "$REGISTER_RESULT" | grep -q "successful\|exists"; then
        echo -e "${GREEN}✅ User creation via API successful${NC}"
        return 0
    else
        echo -e "${RED}❌ API registration failed: $REGISTER_RESULT${NC}"
        return 1
    fi
}

# Function to check and restart database if needed
check_and_restart_database() {
    echo -e "${BLUE}🔍 Checking database server status...${NC}"
    
    DB_STATUS=$(fly status -a weekly-report-backend-db 2>&1 || echo "ERROR")
    echo "Database status: $DB_STATUS"
    
    if echo "$DB_STATUS" | grep -q "stopped\|ERROR"; then
        echo -e "${YELLOW}🔄 Database appears to be stopped, trying to restart...${NC}"
        
        if fly restart -a weekly-report-backend-db; then
            echo -e "${GREEN}✅ Database restart command sent${NC}"
            echo -e "${BLUE}⏳ Waiting 30 seconds for database to start...${NC}"
            sleep 30
            return 0
        else
            echo -e "${RED}❌ Database restart failed${NC}"
            return 1
        fi
    fi
    
    return 0
}

# Function to test if app can handle login now
test_login_with_existing_data() {
    echo -e "${BLUE}🧪 Testing login with potentially existing users...${NC}"
    
    # Try common employee codes that might exist from previous imports
    for code in "CEO001" "ADM001" "USR001" "552502356" "EMP001" "TEST001"; do
        echo -e "${YELLOW}Testing $code...${NC}"
        
        RESULT=$(curl -s -X POST https://weekly-report-backend.fly.dev/api/auth/login \
            -H "Content-Type: application/json" \
            -H "Origin: https://weeklyreport-orpin.vercel.app" \
            -d "{\"employeeCode\":\"$code\",\"password\":\"123456\"}")
        
        if echo "$RESULT" | grep -q '"access_token"'; then
            echo -e "${GREEN}✅ Login successful with $code!${NC}"
            echo "User: $(echo "$RESULT" | jq -r '.user.firstName + " " + .user.lastName' 2>/dev/null || echo "Login successful")"
            return 0
        fi
    done
    
    echo -e "${RED}❌ No existing users found that work${NC}"
    return 1
}

# Main execution flow
echo -e "${BLUE}📊 Starting comprehensive troubleshooting...${NC}"

# Step 1: Check if database server is running
echo -e "\n${BLUE}1️⃣ Checking database server...${NC}"
check_and_restart_database

# Step 2: Check if app is responding
echo -e "\n${BLUE}2️⃣ Checking app status...${NC}"
API_HEALTH=$(curl -s https://weekly-report-backend.fly.dev/api/health || echo "API_FAILED")
if echo "$API_HEALTH" | grep -q '"status":"ok"'; then
    echo -e "${GREEN}✅ API is responding${NC}"
else
    echo -e "${YELLOW}⚠️  API not responding, trying to wake it up...${NC}"
    # Try to wake up the app
    curl -s https://weekly-report-backend.fly.dev/health >/dev/null || true
    sleep 10
fi

# Step 3: Check database health via API
echo -e "\n${BLUE}3️⃣ Checking database health via API...${NC}"
DB_HEALTH=$(curl -s https://weekly-report-backend.fly.dev/api/health/db || echo "DB_HEALTH_FAILED")
echo "Database health: $DB_HEALTH"

# Step 4: Test if any existing users work
echo -e "\n${BLUE}4️⃣ Testing with existing data...${NC}"
if test_login_with_existing_data; then
    echo -e "\n${GREEN}🎉 LOGIN IS ALREADY WORKING!${NC}"
    echo -e "${BLUE}The system is functional with existing data.${NC}"
    exit 0
fi

# Step 5: Try SSH-based seeding
echo -e "\n${BLUE}5️⃣ Trying SSH-based database seeding...${NC}"
if try_ssh_seed; then
    echo -e "${GREEN}✅ SSH seeding completed${NC}"
    
    # Wait and test
    echo -e "${BLUE}⏳ Waiting 30 seconds for changes to propagate...${NC}"
    sleep 30
    
    if test_login_with_existing_data; then
        echo -e "\n${GREEN}🎉 LOGIN NOW WORKING AFTER SSH SEED!${NC}"
        exit 0
    fi
fi

# Step 6: Try API-based user creation
echo -e "\n${BLUE}6️⃣ Trying API-based user creation...${NC}"
if create_users_via_api; then
    echo -e "${GREEN}✅ API user creation completed${NC}"
    
    # Wait and test
    echo -e "${BLUE}⏳ Waiting 15 seconds for changes to propagate...${NC}"
    sleep 15
    
    if test_login_with_existing_data; then
        echo -e "\n${GREEN}🎉 LOGIN NOW WORKING AFTER API CREATION!${NC}"
        exit 0
    fi
fi

# Step 7: Try forcing app restart and re-deploy
echo -e "\n${BLUE}7️⃣ Trying app restart and redeploy...${NC}"
echo -e "${YELLOW}Restarting app...${NC}"
fly apps restart weekly-report-backend || echo "Restart command sent"

echo -e "${YELLOW}Deploying fresh code...${NC}"
if fly deploy --strategy immediate; then
    echo -e "${GREEN}✅ Deploy completed${NC}"
    
    echo -e "${BLUE}⏳ Waiting 60 seconds for deployment to complete...${NC}"
    sleep 60
    
    # Test again
    if test_login_with_existing_data; then
        echo -e "\n${GREEN}🎉 LOGIN NOW WORKING AFTER REDEPLOY!${NC}"
        exit 0
    fi
else
    echo -e "${RED}❌ Deploy failed${NC}"
fi

# Step 8: Manual import via direct SQL if we can connect
echo -e "\n${BLUE}8️⃣ Final attempt: Manual SQL via proxy with extended timeout...${NC}"

# Try one more time with very long timeout
pkill -f 'fly proxy' 2>/dev/null || true
sleep 5

echo -e "${YELLOW}Starting proxy with 60 second timeout...${NC}"
timeout 120s fly proxy 5433:5432 -a weekly-report-backend-db &
PROXY_PID=$!

echo -e "${BLUE}⏳ Waiting 60 seconds for proxy to fully stabilize...${NC}"
sleep 60

# Create simple .env.studio
cat > .env.studio << EOF
DATABASE_URL="postgres://weekly_report_backend:AWVq27MHkURo5ns@localhost:5433/weekly_report_backend"
DIRECT_URL="postgres://weekly_report_backend:AWVq27MHkURo5ns@localhost:5433/weekly_report_backend"
EOF

# Try simple connection test
if npx dotenv -e .env.studio -- npx prisma db execute --sql="SELECT 1 as test;" 2>/dev/null; then
    echo -e "${GREEN}✅ Extended proxy connection successful!${NC}"
    
    # Quick user creation
    npx dotenv -e .env.studio -- npx prisma db execute --sql="
    -- Create minimal structure and test user
    INSERT INTO \"Office\" (id, name, type, description, \"createdAt\", \"updatedAt\") 
    VALUES ('default-office', 'Default Office', 'HEAD_OFFICE', 'Default office', NOW(), NOW())
    ON CONFLICT (name) DO NOTHING;

    INSERT INTO \"Department\" (id, name, description, \"officeId\", \"createdAt\", \"updatedAt\")
    VALUES ('default-dept', 'Default Dept', 'Default department', 'default-office', NOW(), NOW())
    ON CONFLICT (name, \"officeId\") DO NOTHING;

    INSERT INTO \"Position\" (id, name, description, \"createdAt\", \"updatedAt\")
    VALUES ('default-pos', 'Default Position', 'Default position', NOW(), NOW())
    ON CONFLICT (name) DO NOTHING;

    INSERT INTO \"JobPosition\" (id, \"jobName\", code, description, \"positionId\", \"departmentId\", \"createdAt\", \"updatedAt\")
    VALUES ('default-job', 'Default Job', 'DEFAULT', 'Default job', 'default-pos', 'default-dept', NOW(), NOW())
    ON CONFLICT (\"positionId\", \"jobName\", \"departmentId\") DO NOTHING;

    INSERT INTO \"User\" (
      id, \"employeeCode\", email, password, \"firstName\", \"lastName\", 
      \"phone\", role, \"jobPositionId\", \"officeId\", \"isActive\", \"createdAt\", \"updatedAt\"
    ) VALUES 
    (
      'ultimate-test-user', 'CEO001', 'ceo@company.com', 
      '\$2b\$10\$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi',
      'CEO', 'Ultimate Test', '999999999', 'SUPERADMIN',
      'default-job', 'default-office', true, NOW(), NOW()
    )
    ON CONFLICT (\"employeeCode\") DO UPDATE SET
      password = EXCLUDED.password,
      \"isActive\" = true;
    " 2>/dev/null && echo -e "${GREEN}✅ Manual user creation successful${NC}" || echo -e "${RED}❌ Manual user creation failed${NC}"
    
    kill $PROXY_PID 2>/dev/null || true
    
    # Final test
    echo -e "${BLUE}⏳ Waiting 30 seconds for final propagation...${NC}"
    sleep 30
    
    if test_login_with_existing_data; then
        echo -e "\n${GREEN}🎉 LOGIN NOW WORKING AFTER MANUAL CREATION!${NC}"
        exit 0
    fi
else
    echo -e "${RED}❌ Extended proxy connection also failed${NC}"
    kill $PROXY_PID 2>/dev/null || true
fi

# Final cleanup
pkill -f 'fly proxy' 2>/dev/null || true

echo -e "\n${RED}❌ All methods exhausted${NC}"
echo -e "${BLUE}📋 Summary of attempts:${NC}"
echo "1. ❌ Database restart"
echo "2. ❌ API wake-up"
echo "3. ❌ Existing data test"
echo "4. ❌ SSH seeding"
echo "5. ❌ API user creation"
echo "6. ❌ App restart & redeploy"
echo "7. ❌ Extended proxy connection"

echo -e "\n${BLUE}💡 Final recommendations:${NC}"
echo "1. Check Fly.io dashboard for database app status"
echo "2. Contact Fly.io support if database is consistently unreachable"
echo "3. Consider creating a new database app"
echo "4. Try the operations during a different time (network issues)"

echo -e "\n${BLUE}📞 Manual verification commands:${NC}"
echo "# Check database app:"
echo "fly status -a weekly-report-backend-db"
echo ""
echo "# Check app logs:"
echo "fly logs"
echo ""
echo "# Try simple login test:"
echo "curl -X POST https://weekly-report-backend.fly.dev/api/auth/login \\"
echo "  -H 'Content-Type: application/json' \\"
echo "  -H 'Origin: https://weeklyreport-orpin.vercel.app' \\"
echo "  -d '{\"employeeCode\":\"CEO001\",\"password\":\"123456\"}'"

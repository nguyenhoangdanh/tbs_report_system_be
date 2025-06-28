#!/bin/bash
# filepath: /home/hoangdanh2000/Desktop/TBS Group/bento-nestjs/weekly-work-report-system/backend/scripts/diagnose-and-fix.sh

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Set Fly.io path
export PATH="/home/hoangdanh2000/.fly/bin:$PATH"

echo -e "${BLUE}🔍 Comprehensive Database Diagnosis and Fix${NC}"

# Step 1: Check Fly.io authentication
echo -e "${BLUE}1️⃣ Checking Fly.io authentication...${NC}"
if fly auth whoami &>/dev/null; then
    echo -e "${GREEN}✅ Fly.io authentication successful${NC}"
    fly auth whoami
else
    echo -e "${RED}❌ Fly.io authentication failed${NC}"
    echo -e "${YELLOW}Please login: fly auth login${NC}"
    exit 1
fi

# Step 2: Check both apps exist and are running
echo -e "\n${BLUE}2️⃣ Checking app statuses...${NC}"

echo -e "${YELLOW}Checking backend app...${NC}"
BACKEND_STATUS=$(fly status 2>&1 || echo "ERROR")
if echo "$BACKEND_STATUS" | grep -q "ERROR"; then
    echo -e "${RED}❌ Backend app not found or error${NC}"
    echo "$BACKEND_STATUS"
else
    echo -e "${GREEN}✅ Backend app found${NC}"
    echo "$BACKEND_STATUS" | grep -E "(STATE|CHECKS)" || true
fi

echo -e "${YELLOW}Checking database app...${NC}"
DB_STATUS=$(fly status -a weekly-report-backend-db 2>&1 || echo "ERROR")
if echo "$DB_STATUS" | grep -q "ERROR"; then
    echo -e "${RED}❌ Database app not found or error${NC}"
    echo "$DB_STATUS"
    echo -e "${BLUE}💡 Creating database app...${NC}"
    
    # Try to create database if it doesn't exist
    fly postgres create --name weekly-report-backend-db --region sin --initial-cluster-size 1 --vm-size shared-cpu-1x --volume-size 10 || {
        echo -e "${RED}❌ Failed to create database${NC}"
        exit 1
    }
else
    echo -e "${GREEN}✅ Database app found${NC}"
    echo "$DB_STATUS" | grep -E "(STATE|CHECKS)" || true
fi

# Step 3: Check database connection info
echo -e "\n${BLUE}3️⃣ Getting database connection info...${NC}"
DB_INFO=$(fly postgres connect -a weekly-report-backend-db --help 2>&1 || echo "No postgres connect available")
echo "$DB_INFO"

# Step 4: Try different connection methods
echo -e "\n${BLUE}4️⃣ Testing different connection methods...${NC}"

# Method 1: Try proxy on different port
echo -e "${YELLOW}Method 1: Testing proxy on port 5433...${NC}"
pkill -f 'fly proxy' 2>/dev/null || true
sleep 2

timeout 15s fly proxy 5433:5432 -a weekly-report-backend-db &
PROXY_PID=$!
sleep 8

if nc -z localhost 5433 2>/dev/null; then
    echo -e "${GREEN}✅ Proxy connection on 5433 successful${NC}"
    PROXY_WORKS=true
else
    echo -e "${RED}❌ Proxy connection on 5433 failed${NC}"
    PROXY_WORKS=false
fi

kill $PROXY_PID 2>/dev/null || true

# Method 2: Try proxy on different port 
echo -e "${YELLOW}Method 2: Testing proxy on port 15432...${NC}"
timeout 15s fly proxy 15432:5432 -a weekly-report-backend-db &
PROXY_PID=$!
sleep 8

if nc -z localhost 15432 2>/dev/null; then
    echo -e "${GREEN}✅ Proxy connection on 15432 successful${NC}"
    ALT_PROXY_WORKS=true
    ALT_PORT=15432
else
    echo -e "${RED}❌ Proxy connection on 15432 failed${NC}"
    ALT_PROXY_WORKS=false
fi

kill $PROXY_PID 2>/dev/null || true

# Step 5: Get database credentials and test
echo -e "\n${BLUE}5️⃣ Checking database secrets and configuration...${NC}"
echo -e "${YELLOW}Current database secrets:${NC}"
fly secrets list | grep -E "(DATABASE_URL|DIRECT_URL)" || echo "No database secrets found"

# Step 6: Fix database connection based on findings
echo -e "\n${BLUE}6️⃣ Applying fixes...${NC}"

if [ "$PROXY_WORKS" = true ] || [ "$ALT_PROXY_WORKS" = true ]; then
    # Use working proxy port
    if [ "$PROXY_WORKS" = true ]; then
        WORKING_PORT=5433
    else
        WORKING_PORT=15432
    fi
    
    echo -e "${GREEN}✅ Proxy works on port $WORKING_PORT, proceeding with database setup...${NC}"
    
    # Update .env.studio
    cat > .env.studio << EOF
DATABASE_URL="postgres://weekly_report_backend:AWVq27MHkURo5ns@localhost:$WORKING_PORT/weekly_report_backend"
DIRECT_URL="postgres://weekly_report_backend:AWVq27MHkURo5ns@localhost:$WORKING_PORT/weekly_report_backend"
EOF
    
    # Start proxy
    echo -e "${YELLOW}🌉 Starting working proxy on port $WORKING_PORT...${NC}"
    fly proxy $WORKING_PORT:5432 -a weekly-report-backend-db &
    PROXY_PID=$!
    sleep 10
    
    # Test and setup database
    echo -e "${YELLOW}🧪 Testing database connection...${NC}"
    if npx dotenv -e .env.studio -- npx prisma db execute --sql="SELECT 1;" 2>/dev/null; then
        echo -e "${GREEN}✅ Database connection successful!${NC}"
        
        # Run migrations
        echo -e "${YELLOW}🔄 Running migrations...${NC}"
        npx dotenv -e .env.studio -- npx prisma migrate deploy
        
        # Seed basic data
        echo -e "${YELLOW}🌱 Seeding basic data...${NC}"
        npx dotenv -e .env.studio -- tsx prisma/seed.ts
        
        # Create test users
        echo -e "${YELLOW}👥 Creating test users...${NC}"
        npx dotenv -e .env.studio -- npx prisma db execute --sql="
        INSERT INTO \"User\" (
          id, \"employeeCode\", email, password, \"firstName\", \"lastName\", 
          \"phone\", role, \"jobPositionId\", \"officeId\", \"isActive\", \"createdAt\", \"updatedAt\"
        ) VALUES 
        (
          'test-ceo-001', 'CEO001', 'ceo@company.com', 
          '\$2b\$10\$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi',
          'CEO', 'Test User', '123456789', 'SUPERADMIN',
          (SELECT id FROM \"JobPosition\" LIMIT 1),
          (SELECT id FROM \"Office\" LIMIT 1),
          true, NOW(), NOW()
        ),
        (
          'user-552502356', '552502356', '552502356@company.com', 
          '\$2b\$10\$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi',
          'User', '552502356', '552502356', 'USER',
          (SELECT id FROM \"JobPosition\" LIMIT 1),
          (SELECT id FROM \"Office\" LIMIT 1),
          true, NOW(), NOW()
        )
        ON CONFLICT (\"employeeCode\") DO UPDATE SET
          password = EXCLUDED.password,
          \"isActive\" = true,
          \"updatedAt\" = NOW();
        "
        
        echo -e "${GREEN}✅ Database setup completed via proxy!${NC}"
        
    else
        echo -e "${RED}❌ Database connection still failing${NC}"
    fi
    
    # Clean up proxy
    kill $PROXY_PID 2>/dev/null || true
    
else
    echo -e "${RED}❌ Neither proxy method worked${NC}"
    echo -e "${BLUE}💡 Possible solutions:${NC}"
    echo "1. Check if database app is running: fly status -a weekly-report-backend-db"
    echo "2. Restart database: fly restart -a weekly-report-backend-db"
    echo "3. Check network connectivity"
    echo "4. Verify database credentials"
fi

# Step 7: Update app secrets with working configuration
echo -e "\n${BLUE}7️⃣ Updating app configuration...${NC}"

# Try internal URL first
echo -e "${YELLOW}Setting internal database URL...${NC}"
fly secrets set DATABASE_URL="postgres://weekly_report_backend:AWVq27MHkURo5ns@weekly-report-backend-db.flycast:5432/weekly_report_backend?sslmode=prefer&connect_timeout=60" || {
    echo -e "${RED}❌ Failed to set internal URL${NC}"
}

fly secrets set DIRECT_URL="postgres://weekly_report_backend:AWVq27MHkURo5ns@weekly-report-backend-db.flycast:5432/weekly_report_backend?sslmode=prefer&connect_timeout=60" || {
    echo -e "${RED}❌ Failed to set direct URL${NC}"
}

# Step 8: Deploy and test
echo -e "\n${BLUE}8️⃣ Testing final result...${NC}"

echo -e "${YELLOW}Deploying app...${NC}"
fly deploy --strategy immediate || echo "Deploy may have failed"

echo -e "${YELLOW}Waiting for app to start...${NC}"
sleep 30

echo -e "${YELLOW}Testing API endpoints...${NC}"

# Test health
curl -s https://weekly-report-backend.fly.dev/health || echo "Health endpoint failed"

# Test database health
DB_HEALTH_FINAL=$(curl -s https://weekly-report-backend.fly.dev/api/health/db || echo "DB health failed")
echo "Final database health: $DB_HEALTH_FINAL"

# Test login
echo -e "${YELLOW}Testing login...${NC}"
LOGIN_TEST=$(curl -s -X POST https://weekly-report-backend.fly.dev/api/auth/login \
  -H "Content-Type: application/json" \
  -H "Origin: https://weeklyreport-orpin.vercel.app" \
  -d '{"employeeCode":"CEO001","password":"123456"}' || echo "Login failed")

if echo "$LOGIN_TEST" | grep -q '"access_token"'; then
    echo -e "${GREEN}✅ Login test successful!${NC}"
else
    echo -e "${RED}❌ Login test failed${NC}"
    echo "Response: $LOGIN_TEST"
fi

echo -e "\n${BLUE}🎉 Diagnosis and fix completed!${NC}"
echo -e "${BLUE}📋 Summary:${NC}"
echo "  • Database app: $(echo "$DB_STATUS" | grep -q "started" && echo "✅ Running" || echo "❌ Not running")"
echo "  • Proxy connection: $([ "$PROXY_WORKS" = true ] || [ "$ALT_PROXY_WORKS" = true ] && echo "✅ Working" || echo "❌ Failed")"
echo "  • App deployment: Check above for status"
echo "  • Login test: $(echo "$LOGIN_TEST" | grep -q '"access_token"' && echo "✅ Working" || echo "❌ Failed")"

echo -e "\n${BLUE}📞 Test manually:${NC}"
echo "curl -X POST https://weekly-report-backend.fly.dev/api/auth/login \\"
echo "  -H 'Content-Type: application/json' \\"
echo "  -H 'Origin: https://weeklyreport-orpin.vercel.app' \\"
echo "  -d '{\"employeeCode\":\"CEO001\",\"password\":\"123456\"}'"
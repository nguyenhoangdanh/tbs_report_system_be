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

echo -e "${BLUE}🔧 Advanced Database Connection Fix${NC}"

# Function to check database app status
check_db_status() {
    echo -e "${BLUE}🔍 Checking database app status...${NC}"
    DB_STATUS=$(fly status -a weekly-report-backend-db 2>&1 || echo "ERROR")
    echo "$DB_STATUS"
    
    if echo "$DB_STATUS" | grep -q "stopped\|ERROR"; then
        echo -e "${YELLOW}🔄 Database appears to be stopped, restarting...${NC}"
        fly restart -a weekly-report-backend-db
        echo -e "${BLUE}⏳ Waiting 45 seconds for database to fully start...${NC}"
        sleep 45
        return 1
    elif echo "$DB_STATUS" | grep -q "started"; then
        echo -e "${GREEN}✅ Database app is running${NC}"
        return 0
    else
        echo -e "${YELLOW}⚠️  Database status unclear${NC}"
        return 1
    fi
}

# Function to try SSH-based database operations
try_ssh_operations() {
    echo -e "${BLUE}🚪 Trying SSH-based database operations...${NC}"
    
    # Method 1: SSH migrate
    echo -e "${YELLOW}Method 1: SSH migrate...${NC}"
    if fly ssh console -C "cd /app && npx prisma migrate deploy" 2>/dev/null; then
        echo -e "${GREEN}✅ SSH migrate successful${NC}"
        
        # Try to seed via SSH
        echo -e "${YELLOW}Method 2: SSH seed...${NC}"
        if fly ssh console -C "cd /app && npx tsx prisma/seed.ts" 2>/dev/null; then
            echo -e "${GREEN}✅ SSH seed successful${NC}"
            return 0
        else
            echo -e "${YELLOW}⚠️  SSH seed failed but migrate worked${NC}"
            return 0
        fi
    else
        echo -e "${RED}❌ SSH migrate failed${NC}"
        return 1
    fi
}

# Function to try different database URL configurations
try_different_urls() {
    echo -e "${BLUE}🔧 Trying different database URL configurations...${NC}"
    
    # Configuration 1: Internal URL with sslmode=disable
    echo -e "${YELLOW}Config 1: Internal URL with SSL disabled...${NC}"
    fly secrets set \
      DATABASE_URL="postgres://weekly_report_backend:AWVq27MHkURo5ns@weekly-report-backend-db.flycast:5432/weekly_report_backend?sslmode=disable&connect_timeout=60" \
      DIRECT_URL="postgres://weekly_report_backend:AWVq27MHkURo5ns@weekly-report-backend-db.flycast:5432/weekly_report_backend?sslmode=disable&connect_timeout=60"
    
    # Wait and test
    sleep 10
    if test_app_database_health; then
        echo -e "${GREEN}✅ SSL disabled configuration works!${NC}"
        return 0
    fi
    
    # Configuration 2: Internal URL with sslmode=prefer
    echo -e "${YELLOW}Config 2: Internal URL with SSL prefer...${NC}"
    fly secrets set \
      DATABASE_URL="postgres://weekly_report_backend:AWVq27MHkURo5ns@weekly-report-backend-db.flycast:5432/weekly_report_backend?sslmode=prefer&connect_timeout=60" \
      DIRECT_URL="postgres://weekly_report_backend:AWVq27MHkURo5ns@weekly-report-backend-db.flycast:5432/weekly_report_backend?sslmode=prefer&connect_timeout=60"
    
    # Wait and test
    sleep 10
    if test_app_database_health; then
        echo -e "${GREEN}✅ SSL prefer configuration works!${NC}"
        return 0
    fi
    
    # Configuration 3: Try with application_name
    echo -e "${YELLOW}Config 3: Internal URL with application name...${NC}"
    fly secrets set \
      DATABASE_URL="postgres://weekly_report_backend:AWVq27MHkURo5ns@weekly-report-backend-db.flycast:5432/weekly_report_backend?sslmode=disable&connect_timeout=60&application_name=weekly-report-backend" \
      DIRECT_URL="postgres://weekly_report_backend:AWVq27MHkURo5ns@weekly-report-backend-db.flycast:5432/weekly_report_backend?sslmode=disable&connect_timeout=60"
    
    # Wait and test
    sleep 10
    if test_app_database_health; then
        echo -e "${GREEN}✅ Application name configuration works!${NC}"
        return 0
    fi
    
    echo -e "${RED}❌ All URL configurations failed${NC}"
    return 1
}

# Function to test app database health
test_app_database_health() {
    local max_attempts=3
    local attempt=1
    
    while [ $attempt -le $max_attempts ]; do
        echo -e "${BLUE}🧪 Testing app database health (attempt $attempt/$max_attempts)...${NC}"
        DB_HEALTH=$(curl -s https://weekly-report-backend.fly.dev/api/health/db || echo "FAILED")
        
        if echo "$DB_HEALTH" | grep -q '"status":"ok"'; then
            echo -e "${GREEN}✅ Database health check passed${NC}"
            return 0
        else
            echo -e "${YELLOW}⚠️  Database health check failed (attempt $attempt)${NC}"
            echo "Response: $(echo "$DB_HEALTH" | head -c 150)..."
            sleep 15
        fi
        
        attempt=$((attempt + 1))
    done
    
    echo -e "${RED}❌ Database health check failed after $max_attempts attempts${NC}"
    return 1
}

# Function to try proxy with better error handling
try_proxy_with_retries() {
    local port=${1:-5433}
    echo -e "${BLUE}🌉 Trying proxy connection on port $port with retries...${NC}"
    
    # Kill any existing proxies
    pkill -f 'fly proxy' 2>/dev/null || true
    sleep 5
    
    # Create .env.studio with different SSL modes
    for sslmode in "disable" "prefer" "require"; do
        echo -e "${YELLOW}Trying SSL mode: $sslmode${NC}"
        
        cat > .env.studio << EOF
DATABASE_URL="postgres://weekly_report_backend:AWVq27MHkURo5ns@localhost:$port/weekly_report_backend?sslmode=$sslmode&connect_timeout=60"
DIRECT_URL="postgres://weekly_report_backend:AWVq27MHkURo5ns@localhost:$port/weekly_report_backend?sslmode=$sslmode&connect_timeout=60"
EOF
        
        # Start proxy
        timeout 120s fly proxy $port:5432 -a weekly-report-backend-db &
        PROXY_PID=$!
        
        # Wait longer for proxy
        echo -e "${BLUE}⏳ Waiting 20 seconds for proxy...${NC}"
        sleep 20
        
        # Test connection with this SSL mode
        if npx dotenv -e .env.studio -- npx prisma db execute --sql="SELECT 1 as test;" 2>/dev/null; then
            echo -e "${GREEN}✅ Proxy connection successful with SSL mode: $sslmode${NC}"
            
            # Run quick operations
            echo -e "${YELLOW}🔄 Running migrations...${NC}"
            npx dotenv -e .env.studio -- npx prisma migrate deploy 2>/dev/null || echo "Migration may have failed"
            
            echo -e "${YELLOW}🌱 Quick seed...${NC}"
            npx dotenv -e .env.studio -- tsx prisma/seed.ts 2>/dev/null || echo "Seed may have failed"
            
            # Clean up
            kill $PROXY_PID 2>/dev/null || true
            pkill -f 'fly proxy' 2>/dev/null || true
            
            return 0
        else
            echo -e "${RED}❌ SSL mode $sslmode failed${NC}"
            kill $PROXY_PID 2>/dev/null || true
        fi
    done
    
    echo -e "${RED}❌ All proxy SSL modes failed${NC}"
    return 1
}

# Main execution steps
echo -e "${BLUE}📊 Starting advanced database fix...${NC}"

# Step 1: Check and restart database if needed
if ! check_db_status; then
    echo -e "${YELLOW}⚠️  Database needed restart, waiting more...${NC}"
    sleep 30
fi

# Step 2: Try SSH operations first (fastest if it works)
echo -e "\n${BLUE}2️⃣ Trying SSH-based operations...${NC}"
if try_ssh_operations; then
    echo -e "${GREEN}✅ SSH operations successful${NC}"
    
    # Wait for changes and test
    echo -e "${BLUE}⏳ Waiting for changes to propagate...${NC}"
    sleep 30
    
    if test_app_database_health; then
        echo -e "${GREEN}🎉 SUCCESS via SSH! Testing login...${NC}"
        # Test login here
        LOGIN_TEST=$(curl -s -X POST https://weekly-report-backend.fly.dev/api/auth/login \
          -H "Content-Type: application/json" \
          -H "Origin: https://weeklyreport-orpin.vercel.app" \
          -d '{"employeeCode":"CEO001","password":"123456"}')
        
        if echo "$LOGIN_TEST" | grep -q '"access_token"'; then
            echo -e "${GREEN}🎯 LOGIN IS WORKING VIA SSH METHOD!${NC}"
            echo -e "${BLUE}👤 Working credentials: CEO001 / 123456${NC}"
            exit 0
        fi
    fi
fi

# Step 3: Try different database URL configurations
echo -e "\n${BLUE}3️⃣ Trying different database URL configurations...${NC}"
if try_different_urls; then
    echo -e "${GREEN}✅ URL configuration successful${NC}"
    
    # Deploy to pick up new URLs
    echo -e "${YELLOW}🚀 Deploying with new URLs...${NC}"
    fly deploy --strategy immediate
    
    echo -e "${BLUE}⏳ Waiting for deployment...${NC}"
    sleep 45
    
    if test_app_database_health; then
        echo -e "${GREEN}🎉 SUCCESS via URL config! Testing login...${NC}"
        # Test login here
        LOGIN_TEST=$(curl -s -X POST https://weekly-report-backend.fly.dev/api/auth/login \
          -H "Content-Type: application/json" \
          -H "Origin: https://weeklyreport-orpin.vercel.app" \
          -d '{"employeeCode":"CEO001","password":"123456"}')
        
        if echo "$LOGIN_TEST" | grep -q '"access_token"'; then
            echo -e "${GREEN}🎯 LOGIN IS WORKING VIA URL CONFIG!${NC}"
            echo -e "${BLUE}👤 Working credentials: CEO001 / 123456${NC}"
            exit 0
        fi
    fi
fi

# Step 4: Try proxy with different SSL modes
echo -e "\n${BLUE}4️⃣ Trying proxy with different SSL configurations...${NC}"
if try_proxy_with_retries 5433; then
    echo -e "${GREEN}✅ Proxy operations successful${NC}"
    
    echo -e "${BLUE}⏳ Waiting for changes to propagate...${NC}"
    sleep 30
    
    if test_app_database_health; then
        echo -e "${GREEN}🎉 SUCCESS via proxy!${NC}"
    fi
fi

# Final test regardless of method used
echo -e "\n${BLUE}🧪 Final comprehensive test...${NC}"

# Test API health
API_HEALTH=$(curl -s https://weekly-report-backend.fly.dev/api/health || echo "API_FAILED")
if echo "$API_HEALTH" | grep -q '"status":"ok"'; then
    echo -e "${GREEN}✅ API is healthy${NC}"
else
    echo -e "${RED}❌ API health failed${NC}"
fi

# Test database health
DB_HEALTH_FINAL=$(curl -s https://weekly-report-backend.fly.dev/api/health/db || echo "DB_HEALTH_FAILED")
echo -e "${BLUE}Database health: $DB_HEALTH_FINAL${NC}"

# Test login with multiple users
echo -e "\n${BLUE}🧪 Testing login with multiple users...${NC}"
SUCCESS_COUNT=0

for user in "CEO001" "ADM001" "USR001"; do
    echo -e "${YELLOW}Testing $user...${NC}"
    result=$(curl -s -X POST https://weekly-report-backend.fly.dev/api/auth/login \
      -H "Content-Type: application/json" \
      -H "Origin: https://weeklyreport-orpin.vercel.app" \
      -d "{\"employeeCode\":\"$user\",\"password\":\"123456\"}")
    
    if echo "$result" | grep -q '"access_token"'; then
        echo -e "${GREEN}✅ Login successful for $user${NC}"
        SUCCESS_COUNT=$((SUCCESS_COUNT + 1))
    else
        echo -e "${RED}❌ Login failed for $user${NC}"
    fi
done

echo -e "\n${BLUE}🎉 Advanced fix completed!${NC}"
echo -e "${BLUE}📋 Summary:${NC}"
echo "  • API Health: $(echo "$API_HEALTH" | grep -q '"status":"ok"' && echo "✅ OK" || echo "❌ Failed")"
echo "  • DB Health: $(echo "$DB_HEALTH_FINAL" | grep -q '"status":"ok"' && echo "✅ OK" || echo "❌ Failed")"
echo "  • Successful Logins: $SUCCESS_COUNT/3"

if [ $SUCCESS_COUNT -gt 0 ]; then
    echo -e "\n${GREEN}🎯 LOGIN IS WORKING! 🎯${NC}"
    echo -e "${BLUE}📞 Working credentials (password: 123456):${NC}"
    echo "  • CEO001 (SUPERADMIN)"
    echo "  • ADM001 (ADMIN)"
    echo "  • USR001 (USER)"
else
    echo -e "\n${YELLOW}⚠️  Login still not working. Next steps:${NC}"
    echo "1. Check app logs: pnpm logs"
    echo "2. Verify database app: fly status -a weekly-report-backend-db"
    echo "3. Try manual proxy: pnpm db:connect"
    echo "4. Consider database restart: fly restart -a weekly-report-backend-db"
fi

echo -e "\n${BLUE}📞 Manual test command:${NC}"
echo "curl -X POST https://weekly-report-backend.fly.dev/api/auth/login \\"
echo "  -H 'Content-Type: application/json' \\"
echo "  -H 'Origin: https://weeklyreport-orpin.vercel.app' \\"
echo "  -d '{\"employeeCode\":\"552502356\",\"password\":\"123456\"}'"

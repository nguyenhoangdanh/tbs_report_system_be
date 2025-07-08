#!/bin/bash
set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

export PATH="/home/hoangdanh2000/.fly/bin:$PATH"

echo -e "${BLUE}🔄 Restarting All Services for Fresh Start${NC}"
echo "=========================================="

echo -e "${YELLOW}⚠️ This will restart backend and database${NC}"
read -p "Continue? (y/N): " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    exit 0
fi

# Step 1: Restart backend
echo -e "\n${BLUE}🚀 Step 1: Restarting backend...${NC}"
flyctl apps restart weekly-report-backend

echo -e "${BLUE}⏳ Waiting for backend restart...${NC}"
sleep 45

# Step 2: Check backend health
echo -e "\n${BLUE}🏥 Step 2: Checking backend health...${NC}"
for i in {1..10}; do
    HEALTH_CHECK=$(curl -s -w "%{http_code}" https://weekly-report-backend.fly.dev/health || echo "failed")
    if [[ "$HEALTH_CHECK" == *"200"* ]]; then
        echo -e "${GREEN}✅ Backend is healthy after $i attempts${NC}"
        break
    fi
    if [ $i -eq 10 ]; then
        echo -e "${RED}❌ Backend health check failed after 10 attempts${NC}"
        exit 1
    fi
    echo "Attempt $i/10..."
    sleep 15
done

# Step 3: Check database
echo -e "\n${BLUE}🗄️ Step 3: Checking database...${NC}"
if flyctl status -a weekly-report-backend-db >/dev/null 2>&1; then
    echo -e "${GREEN}✅ Database is running${NC}"
    
    # Test DB connection
    DB_CHECK=$(curl -s -w "%{http_code}" https://weekly-report-backend.fly.dev/api/health/db || echo "failed")
    if [[ "$DB_CHECK" == *"200"* ]]; then
        echo -e "${GREEN}✅ Database connection working${NC}"
    else
        echo -e "${YELLOW}⚠️ Database connection issue, waiting...${NC}"
        sleep 30
        
        DB_CHECK=$(curl -s -w "%{http_code}" https://weekly-report-backend.fly.dev/api/health/db || echo "failed")
        if [[ "$DB_CHECK" == *"200"* ]]; then
            echo -e "${GREEN}✅ Database connection restored${NC}"
        else
            echo -e "${RED}❌ Database connection still failing${NC}"
        fi
    fi
else
    echo -e "${RED}❌ Database not found${NC}"
fi

# Step 4: Test API endpoints
echo -e "\n${BLUE}🧪 Step 4: Testing API endpoints...${NC}"

# Test health
echo "Testing /health..."
curl -s https://weekly-report-backend.fly.dev/health | head -c 100

# Test API health
echo -e "\nTesting /api/health..."
curl -s https://weekly-report-backend.fly.dev/api/health | head -c 100

# Test login endpoint
echo -e "\nTesting login endpoint..."
LOGIN_TEST=$(curl -s -X POST https://weekly-report-backend.fly.dev/api/auth/login \
    -H "Content-Type: application/json" \
    -H "Origin: https://weeklyreport-orpin.vercel.app" \
    -d '{"employeeCode":"552502356","password":"123456"}' || echo "failed")

if echo "$LOGIN_TEST" | grep -q '"access_token"'; then
    echo -e "${GREEN}✅ Login endpoint working${NC}"
else
    echo -e "${YELLOW}⚠️ Login test failed (may need data)${NC}"
fi

# Step 5: Performance test
echo -e "\n${BLUE}⚡ Step 5: Performance test...${NC}"

# Test response times
echo "Measuring response times..."
for endpoint in "/health" "/api/health"; do
    START=$(date +%s%N)
    curl -s "https://weekly-report-backend.fly.dev$endpoint" >/dev/null
    END=$(date +%s%N)
    TIME=$(( (END - START) / 1000000 ))
    
    if [ "$TIME" -lt 1000 ]; then
        echo -e "${GREEN}✅ $endpoint: ${TIME}ms${NC}"
    elif [ "$TIME" -lt 3000 ]; then
        echo -e "${YELLOW}⚠️ $endpoint: ${TIME}ms${NC}"
    else
        echo -e "${RED}❌ $endpoint: ${TIME}ms (too slow)${NC}"
    fi
done

echo -e "\n${GREEN}🎉 All services restarted!${NC}"
echo -e "${BLUE}📊 System should now be fast and responsive${NC}"
echo -e "${BLUE}💡 If still slow, run: pnpm fix-24-7${NC}"
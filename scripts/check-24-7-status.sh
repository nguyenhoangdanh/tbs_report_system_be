#!/bin/bash
set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

export PATH="/home/hoangdanh2000/.fly/bin:$PATH"

echo -e "${BLUE}🔍 Checking 24/7 Status & Wake-up Issues${NC}"
echo "========================================"

# Step 1: Check machine status
echo -e "\n${BLUE}📊 Step 1: Machine Status${NC}"
MACHINE_STATUS=$(flyctl machine list --json 2>/dev/null || echo "[]")

if [[ "$MACHINE_STATUS" == "[]" ]]; then
    echo -e "${RED}❌ No machines found${NC}"
    exit 1
fi

echo "$MACHINE_STATUS" | jq -r '.[] | "ID: \(.id) | State: \(.state) | Created: \(.created_at) | Last Start: \(.last_start)"'

# Check if machines are sleeping
SLEEPING_COUNT=$(echo "$MACHINE_STATUS" | jq '[.[] | select(.state == "stopped" or .state == "suspended")] | length')
RUNNING_COUNT=$(echo "$MACHINE_STATUS" | jq '[.[] | select(.state == "started")] | length')

echo -e "\n${BLUE}📋 Machine Summary:${NC}"
echo "  Running: $RUNNING_COUNT"
echo "  Sleeping/Stopped: $SLEEPING_COUNT"

if [ "$SLEEPING_COUNT" -gt 0 ]; then
    echo -e "${YELLOW}⚠️ Some machines are sleeping - this causes wake-up delays${NC}"
fi

# Step 2: Check fly.toml configuration
echo -e "\n${BLUE}📄 Step 2: Checking fly.toml Configuration${NC}"
if [ -f "fly.toml" ]; then
    echo -e "${GREEN}✅ fly.toml found${NC}"
    
    # Check critical 24/7 settings
    AUTO_STOP=$(grep -o "auto_stop_machines = [^#]*" fly.toml | head -1 || echo "not found")
    MIN_MACHINES=$(grep -o "min_machines_running = [^#]*" fly.toml | head -1 || echo "not found")
    MAX_MACHINES=$(grep -o "max_machines_running = [^#]*" fly.toml | head -1 || echo "not found")
    
    echo "  auto_stop_machines: $AUTO_STOP"
    echo "  min_machines_running: $MIN_MACHINES"
    echo "  max_machines_running: $MAX_MACHINES"
    
    if [[ "$AUTO_STOP" == *"false"* ]]; then
        echo -e "${GREEN}✅ auto_stop_machines correctly set to false${NC}"
    else
        echo -e "${RED}❌ auto_stop_machines should be false for 24/7${NC}"
    fi
else
    echo -e "${RED}❌ fly.toml not found${NC}"
fi

# Step 3: Test current response time
echo -e "\n${BLUE}⏱️ Step 3: Testing Current Response Time${NC}"

# Test health endpoint
echo "Testing health endpoint..."
HEALTH_START=$(date +%s%N)
HEALTH_RESPONSE=$(curl -s -w "%{http_code}|%{time_total}" https://weekly-report-backend.fly.dev/health || echo "failed|0")
HEALTH_END=$(date +%s%N)
HEALTH_TIME=$(( (HEALTH_END - HEALTH_START) / 1000000 ))

if [[ "$HEALTH_RESPONSE" == *"200"* ]]; then
    RESPONSE_TIME=$(echo "$HEALTH_RESPONSE" | cut -d'|' -f2)
    echo -e "${GREEN}✅ Health endpoint: ${RESPONSE_TIME}s (${HEALTH_TIME}ms total)${NC}"
else
    echo -e "${RED}❌ Health endpoint failed${NC}"
fi

# Test API endpoint
echo "Testing API endpoint..."
API_START=$(date +%s%N)
API_RESPONSE=$(curl -s -w "%{http_code}|%{time_total}" https://weekly-report-backend.fly.dev/api/health || echo "failed|0")
API_END=$(date +%s%N)
API_TIME=$(( (API_END - API_START) / 1000000 ))

if [[ "$API_RESPONSE" == *"200"* ]]; then
    RESPONSE_TIME=$(echo "$API_RESPONSE" | cut -d'|' -f2)
    echo -e "${GREEN}✅ API endpoint: ${RESPONSE_TIME}s (${API_TIME}ms total)${NC}"
else
    echo -e "${RED}❌ API endpoint failed${NC}"
fi

# Step 4: Check recent logs for sleep patterns
echo -e "\n${BLUE}📋 Step 4: Checking Recent Activity${NC}"
echo "Checking logs for sleep/wake patterns..."

RECENT_LOGS=$(flyctl logs --no-tail | tail -20 || echo "failed to get logs")

if echo "$RECENT_LOGS" | grep -i "machine.*start\|wake\|sleep\|stop" >/dev/null; then
    echo -e "${YELLOW}⚠️ Found sleep/wake activity in recent logs:${NC}"
    echo "$RECENT_LOGS" | grep -i "machine.*start\|wake\|sleep\|stop" | tail -5
else
    echo -e "${GREEN}✅ No recent sleep/wake activity found${NC}"
fi

# Step 5: Check database connection
echo -e "\n${BLUE}🗄️ Step 5: Database Status${NC}"
if flyctl status -a weekly-report-backend-db >/dev/null 2>&1; then
    echo -e "${GREEN}✅ Database is running${NC}"
    
    # Test database endpoint
    DB_START=$(date +%s%N)
    DB_RESPONSE=$(curl -s -w "%{http_code}|%{time_total}" https://weekly-report-backend.fly.dev/api/health/db || echo "failed|0")
    DB_END=$(date +%s%N)
    DB_TIME=$(( (DB_END - DB_START) / 1000000 ))
    
    if [[ "$DB_RESPONSE" == *"200"* ]]; then
        RESPONSE_TIME=$(echo "$DB_RESPONSE" | cut -d'|' -f2)
        echo -e "${GREEN}✅ Database connection: ${RESPONSE_TIME}s (${DB_TIME}ms total)${NC}"
    else
        echo -e "${RED}❌ Database connection failed${NC}"
    fi
else
    echo -e "${RED}❌ Database not found or not running${NC}"
fi

# Step 6: Recommendations
echo -e "\n${BLUE}💡 Step 6: Diagnosis & Recommendations${NC}"

TOTAL_RESPONSE_TIME=$(( HEALTH_TIME + API_TIME + DB_TIME ))

if [ "$TOTAL_RESPONSE_TIME" -gt 10000 ]; then
    echo -e "${RED}❌ SLOW RESPONSE DETECTED (${TOTAL_RESPONSE_TIME}ms total)${NC}"
    echo -e "${YELLOW}🔍 Likely causes:${NC}"
    echo "  1. Machine was sleeping (auto_stop_machines = true)"
    echo "  2. Cold start after inactivity"
    echo "  3. Database connection issues"
    echo ""
    echo -e "${BLUE}🔧 Recommended fixes:${NC}"
    echo "  1. Fix auto-stop: pnpm fix-24-7"
    echo "  2. Restart all services: pnpm restart-all"
    echo "  3. Check configuration: pnpm check-config"
elif [ "$TOTAL_RESPONSE_TIME" -gt 5000 ]; then
    echo -e "${YELLOW}⚠️ MODERATE DELAY (${TOTAL_RESPONSE_TIME}ms total)${NC}"
    echo "  Response time is slower than optimal"
    echo "  Consider running: pnpm optimize-performance"
else
    echo -e "${GREEN}✅ GOOD PERFORMANCE (${TOTAL_RESPONSE_TIME}ms total)${NC}"
    echo "  System is responding normally"
fi

# Step 7: Auto-fix prompt
echo -e "\n${BLUE}🚀 Step 7: Quick Fix Options${NC}"
if [ "$SLEEPING_COUNT" -gt 0 ] || [[ "$AUTO_STOP" != *"false"* ]]; then
    echo -e "${YELLOW}❓ Would you like to apply 24/7 fixes automatically?${NC}"
    read -p "Apply fixes now? (y/N): " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        echo -e "${BLUE}🔧 Applying 24/7 fixes...${NC}"
        ./scripts/fix-24-7.sh
    fi
else
    echo -e "${GREEN}✅ Configuration looks good for 24/7 operation${NC}"
fi

echo -e "\n${GREEN}🎉 Check completed!${NC}"
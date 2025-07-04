#!/bin/bash
set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

export PATH="/home/hoangdanh2000/.fly/bin:$PATH"

echo -e "${BLUE}🔧 Deploy Single Machine Only${NC}"
echo "=============================="

# Step 1: Clean slate - destroy all existing machines
echo -e "${BLUE}🧹 Ensuring clean slate...${NC}"
EXISTING_MACHINES=$(flyctl machine list --json 2>/dev/null | grep -o '"id":"[^"]*"' | cut -d'"' -f4 || echo "")

if [ ! -z "$EXISTING_MACHINES" ]; then
    echo -e "${YELLOW}⚠️ Destroying all existing machines for clean deployment...${NC}"
    for machine_id in $EXISTING_MACHINES; do
        echo "Destroying: $machine_id"
        flyctl machine destroy $machine_id --force || true
    done
    sleep 15
fi

# Step 2: Deploy with single machine configuration (fixed flags)
echo -e "${BLUE}🚀 Deploying exactly 1 machine...${NC}"
flyctl deploy --strategy immediate --primary-region sin

# Step 3: Wait and verify
echo -e "${BLUE}⏳ Waiting for deployment...${NC}"
sleep 60

# Step 4: Force single machine if multiple created
echo -e "${BLUE}📊 Checking machine count...${NC}"
MACHINE_COUNT=$(flyctl machine list --json 2>/dev/null | grep -c '"id"' || echo "0")
echo "Current machine count: $MACHINE_COUNT"

if [ "$MACHINE_COUNT" -gt 1 ]; then
    echo -e "${YELLOW}⚠️ Multiple machines detected, keeping only 1...${NC}"
    MACHINES=$(flyctl machine list --json | grep -o '"id":"[^"]*"' | cut -d'"' -f4)
    FIRST_MACHINE=$(echo "$MACHINES" | head -1)
    
    for machine_id in $(echo "$MACHINES" | tail -n +2); do
        echo "Destroying extra machine: $machine_id"
        flyctl machine destroy $machine_id --force
    done
    
    FINAL_MACHINE=$FIRST_MACHINE
elif [ "$MACHINE_COUNT" -eq 1 ]; then
    FINAL_MACHINE=$(flyctl machine list --json | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
    echo -e "${GREEN}✅ Perfect! Exactly 1 machine${NC}"
else
    echo -e "${RED}❌ No machines found${NC}"
    exit 1
fi

# Step 5: Configure the single machine
echo -e "${BLUE}🔧 Configuring machine $FINAL_MACHINE...${NC}"
flyctl machine update $FINAL_MACHINE --restart always
flyctl scale memory 512
flyctl scale count 1

# Step 6: Test deployment
echo -e "${BLUE}🧪 Testing single machine...${NC}"
for i in {1..10}; do
    echo "Health test $i/10..."
    
    if curl -f -s https://weekly-report-backend.fly.dev/health >/dev/null; then
        echo -e "${GREEN}✅ Health check passed${NC}"
        break
    fi
    
    if [ $i -eq 10 ]; then
        echo -e "${RED}❌ Health checks failed${NC}"
        flyctl logs --no-tail | tail -20
        exit 1
    fi
    
    sleep 15
done

# Test API
if curl -f -s https://weekly-report-backend.fly.dev/api/health >/dev/null; then
    echo -e "${GREEN}✅ API health passed${NC}"
else
    echo -e "${RED}❌ API health failed${NC}"
fi

# Test database
if curl -f -s https://weekly-report-backend.fly.dev/api/health/db >/dev/null; then
    echo -e "${GREEN}✅ Database health passed${NC}"
else
    echo -e "${RED}❌ Database health failed${NC}"
fi

# Test login
echo -e "${BLUE}🔐 Testing authentication...${NC}"
LOGIN_TEST=$(curl -s -X POST https://weekly-report-backend.fly.dev/api/auth/login \
    -H "Content-Type: application/json" \
    -H "Origin: https://weeklyreport-orpin.vercel.app" \
    -d '{"employeeCode":"552502356","password":"123456"}' || echo "failed")

if echo "$LOGIN_TEST" | grep -q '"access_token"'; then
    echo -e "${GREEN}🎉 SUCCESS! Authentication working!${NC}"
else
    echo -e "${YELLOW}⚠️ Authentication test failed${NC}"
    echo "Response: $(echo "$LOGIN_TEST" | head -c 100)..."
fi

echo -e "\n${GREEN}🎉 Single machine deployment completed!${NC}"
echo -e "${BLUE}📊 Final Status:${NC}"
flyctl status
flyctl machine list

echo -e "\n${BLUE}💰 Optimized Cost:${NC}"
echo "  • 1 Machine: 512MB = ~$2/month"
echo "  • Database: ~$4/month"  
echo "  • Total: ~$6/month"

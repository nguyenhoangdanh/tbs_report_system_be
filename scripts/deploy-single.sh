#!/bin/bash
set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

export PATH="/home/hoangdanh2000/.fly/bin:$PATH"

echo -e "${BLUE}🚀 Deploy Single Machine Only${NC}"
echo "=============================="

# Step 1: Destroy any existing machines
echo -e "${BLUE}🧹 Ensuring only 1 machine exists...${NC}"
EXISTING_MACHINES=$(flyctl machine list --json | grep -o '"id":"[^"]*"' | cut -d'"' -f4 || echo "")

if [ ! -z "$EXISTING_MACHINES" ]; then
    echo -e "${YELLOW}⚠️ Found existing machines, destroying all...${NC}"
    for machine_id in $EXISTING_MACHINES; do
        echo "Destroying machine: $machine_id"
        flyctl machine destroy $machine_id --force || true
    done
    sleep 10
fi

# Step 2: Deploy with explicit single machine strategy
echo -e "${BLUE}🏗️ Deploying single machine...${NC}"
flyctl deploy \
    --strategy immediate \
    --primary-region sin \
    --vm-size shared-cpu-1x \
    --vm-memory 512 \
    --ha=false

# Step 3: Wait for deployment
echo -e "${BLUE}⏳ Waiting for single machine deployment...${NC}"
sleep 45

# Step 4: Verify only 1 machine exists
echo -e "${BLUE}📊 Verifying machine count...${NC}"
MACHINE_COUNT=$(flyctl machine list --json | grep -c '"id"' || echo "0")
echo "Machine count: $MACHINE_COUNT"

if [ "$MACHINE_COUNT" -eq 1 ]; then
    echo -e "${GREEN}✅ Perfect! Exactly 1 machine running${NC}"
elif [ "$MACHINE_COUNT" -gt 1 ]; then
    echo -e "${YELLOW}⚠️ Multiple machines detected, fixing...${NC}"
    # Keep only the first machine, destroy others
    MACHINES=$(flyctl machine list --json | grep -o '"id":"[^"]*"' | cut -d'"' -f4)
    FIRST_MACHINE=$(echo "$MACHINES" | head -1)
    echo "Keeping machine: $FIRST_MACHINE"
    
    for machine_id in $(echo "$MACHINES" | tail -n +2); do
        echo "Destroying extra machine: $machine_id"
        flyctl machine destroy $machine_id --force
    done
else
    echo -e "${RED}❌ No machines found${NC}"
    exit 1
fi

# Step 5: Configure the single machine for 24/7
MACHINE_ID=$(flyctl machine list --json | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
echo -e "${BLUE}🔧 Configuring machine $MACHINE_ID for 24/7...${NC}"
flyctl machine update $MACHINE_ID --restart always

# Step 6: Test deployment
echo -e "${BLUE}🧪 Testing single machine deployment...${NC}"
for i in {1..8}; do
    if curl -f -s https://weekly-report-backend.fly.dev/health >/dev/null; then
        echo -e "${GREEN}✅ Single machine is healthy${NC}"
        break
    fi
    if [ $i -eq 8 ]; then
        echo -e "${RED}❌ Machine health check failed${NC}"
        exit 1
    fi
    echo -e "${YELLOW}⏳ Waiting for machine... ($i/8)${NC}"
    sleep 15
done

# Step 7: Final status
echo -e "${GREEN}🎉 Single machine deployment completed!${NC}"
echo -e "${BLUE}📊 Final Configuration:${NC}"
flyctl status
flyctl machine list

echo -e "\n${BLUE}💰 Cost Summary:${NC}"
echo "  • Machines: 1 x 512MB = ~$2/month"
echo "  • Database: ~$4/month"
echo "  • Total: ~$6/month"

echo -e "\n${BLUE}🔗 Endpoints:${NC}"
echo "  • Health: https://weekly-report-backend.fly.dev/health"
echo "  • API: https://weekly-report-backend.fly.dev/api/health"

#!/bin/bash
set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

export PATH="/home/hoangdanh2000/.fly/bin:$PATH"

echo -e "${BLUE}💰 Full System Cost Optimization${NC}"
echo "=================================="

echo -e "${BLUE}🎯 Target Configuration:${NC}"
echo "  • Backend: Singapore, 512MB, 1 machine = $2/month"
echo "  • Database: Singapore, 2GB, 1 machine = $4/month"
echo "  • Total: $6/month (97% savings vs $200+/month)"

read -p "Apply full optimization? (y/N): " confirm
if [[ ! "$confirm" =~ ^([yY][eE][sS]|[yY])$ ]]; then
    echo -e "${YELLOW}❌ Cancelled${NC}"
    exit 0
fi

# Step 1: Optimize backend
echo -e "\n${BLUE}🔧 Step 1: Optimizing backend...${NC}"
flyctl scale memory 512 --yes
flyctl scale count 1 --region sin

# Remove extra machines if any
MACHINE_COUNT=$(flyctl machine list --json 2>/dev/null | grep -c '"id"' || echo "0")
if [ "$MACHINE_COUNT" -gt 1 ]; then
    echo -e "${YELLOW}⚠️ Removing extra machines...${NC}"
    MACHINE_IDS=$(flyctl machine list --json 2>/dev/null | grep -o '"id":"[^"]*"' | cut -d'"' -f4)
    MACHINE_ARRAY=($MACHINE_IDS)
    
    # Keep first machine, destroy others
    for i in "${!MACHINE_ARRAY[@]}"; do
        if [ $i -gt 0 ]; then
            flyctl machine destroy ${MACHINE_ARRAY[$i]} --force || true
        fi
    done
fi

# Step 2: Optimize database
echo -e "\n${BLUE}🗄️ Step 2: Checking database optimization...${NC}"
DB_STATUS=$(flyctl status -a weekly-report-backend-db 2>&1 || echo "NO_DB")

if echo "$DB_STATUS" | grep -q "weekly-report-backend-db"; then
    echo -e "${YELLOW}⚠️ Existing database found${NC}"
    read -p "Replace with optimized 2GB database? (y/N): " db_confirm
    
    if [[ "$db_confirm" =~ ^([yY][eE][sS]|[yY])$ ]]; then
        # Destroy old database
        echo -e "${BLUE}🗑️ Removing expensive database...${NC}"
        flyctl postgres detach --app weekly-report-backend weekly-report-backend-db || true
        flyctl apps destroy weekly-report-backend-db --yes || true
        sleep 30
        
        # Create new optimized database
        echo -e "${BLUE}🆕 Creating optimized database...${NC}"
        ./scripts/db-setup.sh create
    fi
else
    echo -e "${BLUE}🆕 Creating optimized database...${NC}"
    ./scripts/db-setup.sh create
fi

# Step 3: Restart and verify
echo -e "\n${BLUE}🔄 Step 3: Final restart and verification...${NC}"
flyctl apps restart weekly-report-backend
sleep 60

# Test health
for i in {1..5}; do
    if curl -f -s https://weekly-report-backend.fly.dev/health >/dev/null; then
        echo -e "${GREEN}✅ Optimization successful${NC}"
        break
    fi
    echo -e "${YELLOW}⏳ Testing... ($i/5)${NC}"
    sleep 20
done

# Show final status
echo -e "\n${GREEN}🎉 Cost optimization completed!${NC}"
echo -e "${BLUE}📊 Final configuration:${NC}"
flyctl status
flyctl machine list

echo -e "\n${BLUE}💰 Monthly costs:${NC}"
echo "  • Backend: ~$2/month"
echo "  • Database: ~$4/month"
echo "  • Total: ~$6/month"
echo "  • Annual savings: ~$2,328"

echo -e "\n${BLUE}🧪 Next steps:${NC}"
echo "  • Setup database: pnpm db:setup"
echo "  • Open studio: pnpm db:studio"
echo "  • Test system: pnpm test:health"

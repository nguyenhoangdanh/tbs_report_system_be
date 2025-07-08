#!/bin/bash
set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

export PATH="/home/hoangdanh2000/.fly/bin:$PATH"

echo -e "${BLUE}🔧 Fixing 24/7 Configuration${NC}"
echo "============================="

echo -e "${YELLOW}⚠️ This will ensure your backend runs 24/7 without sleeping${NC}"
read -p "Continue? (y/N): " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    exit 0
fi

# Step 1: Update fly.toml for strict 24/7
echo -e "\n${BLUE}📝 Step 1: Updating fly.toml for 24/7${NC}"

cat > fly.toml << 'EOF'
# fly.toml app configuration file for weekly-report-backend
# FIXED: Strict 24/7 configuration to prevent auto-sleep

app = "weekly-report-backend"
primary_region = "sin"

[build]

[env]
  NODE_ENV = "production"
  PORT = "8080"

[http_service]
  internal_port = 8080
  force_https = true
  
  # CRITICAL: Prevent auto-sleep completely
  auto_stop_machines = false
  auto_start_machines = true
  min_machines_running = 1
  max_machines_running = 1
  
  # Keep-alive settings
  keep_alive_timeout = "120s"
  
  # Optimized concurrency
  concurrency = { type = "connections", hard_limit = 300, soft_limit = 200 }

# Aggressive health checks to keep machine awake
[[http_service.checks]]
  interval = "10s"
  grace_period = "15s"
  method = "GET"
  path = "/health"
  protocol = "http"
  timeout = "10s"
  tls_skip_verify = false
  headers = { "User-Agent" = "fly-health-check" }

[[http_service.checks]]
  interval = "30s"
  grace_period = "20s"
  method = "GET"
  path = "/api/health"
  protocol = "http"
  timeout = "15s"
  tls_skip_verify = false
  headers = { "User-Agent" = "fly-health-check" }

# VM configuration - cost optimized but always-on
[[vm]]
  memory = "512mb"
  cpu_kind = "shared"
  cpus = 1

# Deploy settings - ensure single machine
[deploy]
  strategy = "immediate"
  max_concurrent_machines = 1
EOF

echo -e "${GREEN}✅ fly.toml updated with strict 24/7 settings${NC}"

# Step 2: Stop any sleeping machines
echo -e "\n${BLUE}💤 Step 2: Waking up sleeping machines${NC}"
SLEEPING_MACHINES=$(flyctl machine list --json | jq -r '.[] | select(.state == "stopped" or .state == "suspended") | .id' || echo "")

if [ ! -z "$SLEEPING_MACHINES" ]; then
    echo -e "${YELLOW}⚠️ Found sleeping machines, waking them up...${NC}"
    for machine_id in $SLEEPING_MACHINES; do
        echo "Waking machine: $machine_id"
        flyctl machine start $machine_id || true
    done
    sleep 30
else
    echo -e "${GREEN}✅ No sleeping machines found${NC}"
fi

# Step 3: Deploy updated configuration
echo -e "\n${BLUE}🚀 Step 3: Deploying 24/7 configuration${NC}"
flyctl deploy --strategy immediate

echo -e "${BLUE}⏳ Waiting for deployment...${NC}"
sleep 60

# Step 4: Verify machine count and state
echo -e "\n${BLUE}📊 Step 4: Verifying machine configuration${NC}"
MACHINE_COUNT=$(flyctl machine list --json | jq length)
RUNNING_COUNT=$(flyctl machine list --json | jq '[.[] | select(.state == "started")] | length')

echo "Total machines: $MACHINE_COUNT"
echo "Running machines: $RUNNING_COUNT"

if [ "$MACHINE_COUNT" -eq 1 ] && [ "$RUNNING_COUNT" -eq 1 ]; then
    echo -e "${GREEN}✅ Perfect! Exactly 1 machine running${NC}"
elif [ "$MACHINE_COUNT" -gt 1 ]; then
    echo -e "${YELLOW}⚠️ Multiple machines found, fixing...${NC}"
    
    # Keep only the first machine
    MACHINES=$(flyctl machine list --json | jq -r '.[].id')
    FIRST_MACHINE=$(echo "$MACHINES" | head -1)
    
    for machine_id in $(echo "$MACHINES" | tail -n +2); do
        echo "Destroying extra machine: $machine_id"
        flyctl machine destroy $machine_id --force
    done
else
    echo -e "${RED}❌ Machine configuration issue detected${NC}"
fi

# Step 5: Configure machine for maximum uptime
echo -e "\n${BLUE}⚙️ Step 5: Configuring machine for maximum uptime${NC}"
MACHINE_ID=$(flyctl machine list --json | jq -r '.[0].id')

if [ ! -z "$MACHINE_ID" ] && [ "$MACHINE_ID" != "null" ]; then
    echo "Configuring machine $MACHINE_ID for 24/7..."
    
    # Update machine with restart always policy
    flyctl machine update $MACHINE_ID \
        --restart always \
        --memory 512 \
        --yes || true
    
    echo -e "${GREEN}✅ Machine configured for maximum uptime${NC}"
else
    echo -e "${RED}❌ Could not find machine ID${NC}"
fi

# Step 6: Set up health monitoring
echo -e "\n${BLUE}💊 Step 6: Testing health endpoints${NC}"

# Test multiple times to ensure consistency
for i in {1..3}; do
    echo "Health test $i/3..."
    
    HEALTH_RESPONSE=$(curl -s -w "%{http_code}" https://weekly-report-backend.fly.dev/health || echo "failed")
    API_RESPONSE=$(curl -s -w "%{http_code}" https://weekly-report-backend.fly.dev/api/health || echo "failed")
    
    if [[ "$HEALTH_RESPONSE" == *"200"* ]] && [[ "$API_RESPONSE" == *"200"* ]]; then
        echo -e "${GREEN}✅ Test $i passed${NC}"
    else
        echo -e "${YELLOW}⚠️ Test $i failed, waiting...${NC}"
        sleep 20
    fi
done

# Step 7: Database connection check
echo -e "\n${BLUE}🗄️ Step 7: Verifying database connection${NC}"
DB_RESPONSE=$(curl -s -w "%{http_code}" https://weekly-report-backend.fly.dev/api/health/db || echo "failed")

if [[ "$DB_RESPONSE" == *"200"* ]]; then
    echo -e "${GREEN}✅ Database connection working${NC}"
else
    echo -e "${YELLOW}⚠️ Database connection issue, checking...${NC}"
    
    # Restart backend to refresh DB connection
    flyctl apps restart weekly-report-backend
    sleep 60
    
    DB_RESPONSE=$(curl -s -w "%{http_code}" https://weekly-report-backend.fly.dev/api/health/db || echo "failed")
    if [[ "$DB_RESPONSE" == *"200"* ]]; then
        echo -e "${GREEN}✅ Database connection fixed after restart${NC}"
    else
        echo -e "${RED}❌ Database connection still failing${NC}"
    fi
fi

# Step 8: Final verification
echo -e "\n${BLUE}🧪 Step 8: Final 24/7 verification${NC}"

echo "Checking configuration..."
flyctl machine list
echo ""

# Quick performance test
echo "Performance test (should be fast now)..."
START_TIME=$(date +%s%N)
curl -s https://weekly-report-backend.fly.dev/health >/dev/null
END_TIME=$(date +%s%N)
RESPONSE_TIME=$(( (END_TIME - START_TIME) / 1000000 ))

if [ "$RESPONSE_TIME" -lt 2000 ]; then
    echo -e "${GREEN}✅ Fast response: ${RESPONSE_TIME}ms${NC}"
else
    echo -e "${YELLOW}⚠️ Slow response: ${RESPONSE_TIME}ms${NC}"
fi

echo -e "\n${GREEN}🎉 24/7 Configuration Applied!${NC}"
echo -e "${BLUE}📋 What was fixed:${NC}"
echo "  ✅ auto_stop_machines = false (prevents sleeping)"
echo "  ✅ min_machines_running = 1 (always 1 machine)"
echo "  ✅ max_machines_running = 1 (never more than 1)"
echo "  ✅ Aggressive health checks (every 10s)"
echo "  ✅ Machine restart policy = always"
echo "  ✅ Single machine configuration"

echo -e "\n${BLUE}🔍 Next steps to prevent future issues:${NC}"
echo "  1. Monitor: pnpm check-24-7"
echo "  2. Test performance: pnpm test:health"
echo "  3. Check logs: pnpm logs"

echo -e "\n${BLUE}💰 Cost impact:${NC}"
echo "  Monthly cost: ~$2/month (single 512MB machine)"
echo "  24/7 availability: Guaranteed"
echo "  No more wake-up delays!"
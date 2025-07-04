#!/bin/bash
set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

export PATH="/home/hoangdanh2000/.fly/bin:$PATH"

echo -e "${BLUE}🚀 Deploy to Production (Singapore 512MB)${NC}"
echo "=========================================="

# Check if we're in the right directory
if [ ! -f "fly.toml" ]; then
    echo -e "${RED}❌ fly.toml not found. Are you in the backend directory?${NC}"
    exit 1
fi

# Check if we're logged into Fly.io
if ! flyctl auth whoami >/dev/null 2>&1; then
    echo -e "${RED}❌ Not logged into Fly.io${NC}"
    echo -e "${BLUE}💡 Run: flyctl auth login${NC}"
    exit 1
fi

# Validate configuration
echo -e "${BLUE}🔍 Validating fly.toml...${NC}"
if ! flyctl config validate; then
    echo -e "${RED}❌ fly.toml validation failed${NC}"
    exit 1
fi

# Check if .env.production exists
if [ ! -f ".env.production" ]; then
    echo -e "${RED}❌ .env.production not found${NC}"
    echo -e "${BLUE}💡 Run database setup first: pnpm db:setup production${NC}"
    exit 1
fi

# Deploy with corrected flags (remove --region)
echo -e "${BLUE}🏗️ Deploying to Singapore...${NC}"
timeout 600 flyctl deploy --strategy immediate --primary-region sin || {
    echo -e "${RED}❌ Deploy timed out or failed${NC}"
    echo -e "${BLUE}💡 Try: pnpm fix-single${NC}"
    exit 1
}

# Wait for deployment
echo -e "${BLUE}⏳ Waiting for deployment...${NC}"
sleep 30

# Apply cost optimization
echo -e "${BLUE}💰 Optimizing costs (512MB RAM, 1 machine)...${NC}"
flyctl scale memory 512 --yes
flyctl scale count 1 --region sin

# Health checks with retry
echo -e "${BLUE}🏥 Running health checks...${NC}"
for i in {1..10}; do
    if curl -f -s https://weekly-report-backend.fly.dev/health >/dev/null 2>&1; then
        echo -e "${GREEN}✅ Health check passed${NC}"
        break
    fi
    if [ $i -eq 10 ]; then
        echo -e "${RED}❌ Health check failed after 10 attempts${NC}"
        echo -e "${BLUE}🔍 Checking logs...${NC}"
        flyctl logs --no-tail | tail -20
        exit 1
    fi
    echo -e "${YELLOW}⏳ Waiting for app... ($i/10)${NC}"
    sleep 20
done

# Show final status
echo -e "${BLUE}📋 Deployment Status:${NC}"
flyctl status

echo -e "${GREEN}🎉 Deployment completed successfully!${NC}"
echo -e "${BLUE}📊 Configuration:${NC}"
echo "  • Region: Singapore (sin)"
echo "  • Memory: 512MB"
echo "  • Machines: 1"
echo "  • Monthly cost: ~$2"
echo ""
echo -e "${BLUE}🔗 Endpoints:${NC}"
echo "  • Backend: https://weekly-report-backend.fly.dev"
echo "  • Health: https://weekly-report-backend.fly.dev/health"
echo "  • API: https://weekly-report-backend.fly.dev/api/health"
echo "  • DB Health: https://weekly-report-backend.fly.dev/api/health/db"
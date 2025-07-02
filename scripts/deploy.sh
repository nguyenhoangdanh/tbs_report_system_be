#!/bin/bash
set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

export PATH="/home/hoangdanh2000/.fly/bin:$PATH"

echo -e "${BLUE}🚀 Deploying to Fly.io...${NC}"

# Validate configuration
echo -e "${BLUE}🔍 Validating fly.toml...${NC}"
if ! fly config validate; then
    echo -e "${RED}❌ fly.toml validation failed${NC}"
    exit 1
fi

# Deploy
echo -e "${BLUE}🏗️ Building and deploying...${NC}"
fly deploy --strategy immediate

# Wait for deployment
echo -e "${BLUE}⏳ Waiting for deployment...${NC}"
sleep 30

# Health checks
echo -e "${BLUE}🏥 Running health checks...${NC}"

for i in {1..3}; do
    if curl -f -s https://weekly-report-backend.fly.dev/health >/dev/null; then
        echo -e "${GREEN}✅ Health check passed${NC}"
        break
    fi
    echo -e "${YELLOW}⏳ Waiting for app to start... ($i/3)${NC}"
    sleep 20
done

# Show status
echo -e "${BLUE}📋 App Status:${NC}"
fly status

echo -e "${GREEN}🎉 Deployment completed!${NC}"
echo -e "${BLUE}🔗 Available endpoints:${NC}"
echo "  • Health: https://weekly-report-backend.fly.dev/health"
echo "  • API: https://weekly-report-backend.fly.dev/api"
echo ""
echo -e "${BLUE}📝 Next steps:${NC}"
echo "  • Setup database: pnpm db:prod:setup"
echo "  • View logs: pnpm fly:logs:live"
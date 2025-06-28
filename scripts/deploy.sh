#!/bin/bash
# filepath: /home/hoangdanh2000/Desktop/TBS Group/bento-nestjs/weekly-work-report-system/backend/scripts/deploy.sh

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Set Fly.io path
export PATH="/home/hoangdanh2000/.fly/bin:$PATH"

echo -e "${BLUE}🚀 Deploying Weekly Report Backend to Fly.io...${NC}"

# Validate fly.toml first
echo -e "${BLUE}🔍 Validating fly.toml configuration...${NC}"
if ! fly config validate; then
    echo -e "${RED}❌ fly.toml validation failed${NC}"
    exit 1
fi

echo -e "${GREEN}✅ fly.toml validation passed${NC}"

# Build and deploy
echo -e "${BLUE}🏗️  Building and deploying...${NC}"
fly deploy --strategy immediate

echo -e "${BLUE}⏳ Waiting for deployment to complete...${NC}"
sleep 15

# Health checks
echo -e "${BLUE}🏥 Running health checks...${NC}"

# Check basic health
echo -e "${YELLOW}Checking basic health...${NC}"
if curl -f -s https://weekly-report-backend.fly.dev/health > /dev/null; then
    echo -e "${GREEN}✅ Basic health check passed${NC}"
else
    echo -e "${RED}❌ Basic health check failed${NC}"
    echo -e "${YELLOW}⚠️  App might be starting up, trying again in 30 seconds...${NC}"
    sleep 30
    if curl -f -s https://weekly-report-backend.fly.dev/health > /dev/null; then
        echo -e "${GREEN}✅ Basic health check passed on retry${NC}"
    else
        echo -e "${RED}❌ Basic health check still failing${NC}"
        echo -e "${BLUE}📋 App Status:${NC}"
        fly status
        exit 1
    fi
fi

# Check API health
echo -e "${YELLOW}Checking API health...${NC}"
if curl -f -s https://weekly-report-backend.fly.dev/api/health > /dev/null; then
    echo -e "${GREEN}✅ API health check passed${NC}"
else
    echo -e "${RED}❌ API health check failed${NC}"
    echo -e "${BLUE}📋 Recent logs:${NC}"
    fly logs | tail -10
    exit 1
fi

# Check database health
echo -e "${YELLOW}Checking database health...${NC}"
if curl -f -s https://weekly-report-backend.fly.dev/api/health/db > /dev/null; then
    echo -e "${GREEN}✅ Database health check passed${NC}"
else
    echo -e "${YELLOW}⚠️  Database health check failed - you may need to run migrations${NC}"
    echo -e "${BLUE}💡 Run: ${YELLOW}./scripts/setup-database.sh${NC} to setup database"
fi

echo -e "${GREEN}🎉 Deployment completed successfully!${NC}"
echo -e "${BLUE}📋 App Status:${NC}"
fly status

echo -e "${BLUE}🔗 Available endpoints:${NC}"
echo "  • Health: https://weekly-report-backend.fly.dev/health"
echo "  • API Health: https://weekly-report-backend.fly.dev/api/health"
echo "  • Database Health: https://weekly-report-backend.fly.dev/api/health/db"
echo "  • API Docs: https://weekly-report-backend.fly.dev/api"

echo -e "${BLUE}📝 To view logs: ${YELLOW}pnpm logs:live${NC}"
echo -e "${BLUE}📝 To setup database: ${YELLOW}./scripts/setup-database.sh${NC}"
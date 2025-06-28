#!/bin/bash
# filepath: /home/hoangdanh2000/Desktop/TBS Group/bento-nestjs/weekly-work-report-system/backend/scripts/setup.sh

set -e

echo "🚀 Setting up Weekly Report Backend for Fly.io deployment..."

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Set Fly.io path
export FLYCTL_INSTALL="/home/hoangdanh2000/.fly"
export PATH="$FLYCTL_INSTALL/bin:$PATH"

echo -e "${BLUE}📋 Checking prerequisites...${NC}"

# Check if fly CLI is installed
if ! command -v fly &> /dev/null; then
    echo -e "${YELLOW}⚠️  Fly CLI not found. Installing...${NC}"
    curl -L https://fly.io/install.sh | sh
    export PATH="$FLYCTL_INSTALL/bin:$PATH"
fi

# Check if logged in
if ! fly auth whoami &> /dev/null; then
    echo -e "${YELLOW}🔐 Please login to Fly.io...${NC}"
    fly auth login
fi

echo -e "${GREEN}✅ Prerequisites checked${NC}"

# Install dependencies
echo -e "${BLUE}📦 Installing dependencies...${NC}"
pnpm install

# Generate Prisma client
echo -e "${BLUE}🔄 Generating Prisma client...${NC}"
npx prisma generate

# Make scripts executable
echo -e "${BLUE}🔧 Making scripts executable...${NC}"
chmod +x scripts/*.sh

echo -e "${GREEN}✅ Setup completed successfully!${NC}"
echo -e "${BLUE}📝 Next steps:${NC}"
echo "  1. Run: ${YELLOW}./scripts/deploy.sh${NC} to deploy"
echo "  2. Run: ${YELLOW}./scripts/setup-database.sh${NC} to setup database"
echo "  3. Run: ${YELLOW}pnpm health${NC} to check if app is running"
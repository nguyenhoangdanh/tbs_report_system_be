#!/bin/bash
set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}🚂 Deploy to Railway (Fixed)${NC}"
echo "============================="

# Check if Railway CLI is installed
if ! command -v railway &> /dev/null; then
    echo -e "${RED}❌ Railway CLI not found${NC}"
    echo -e "${BLUE}💡 Install: npm install -g @railway/cli${NC}"
    exit 1
fi

# Check if logged in
if ! railway whoami >/dev/null 2>&1; then
    echo -e "${YELLOW}⚠️  Not logged into Railway${NC}"
    echo -e "${BLUE}🔐 Logging in...${NC}"
    railway login
fi

# Check if project exists and create service
echo -e "${BLUE}🔍 Checking Railway project status...${NC}"
if ! railway status >/dev/null 2>&1; then
    echo -e "${YELLOW}⚠️  No Railway project linked${NC}"
    echo -e "${BLUE}🏗️ Creating new project...${NC}"
    railway init
fi

# Check if service exists, if not create one
echo -e "${BLUE}🔧 Setting up Railway service...${NC}"
if ! railway service >/dev/null 2>&1; then
    echo -e "${BLUE}🆕 Creating new service...${NC}"
    railway service create weekly-report-backend
    railway service connect weekly-report-backend
fi

# Set environment variables using the newer syntax
echo -e "${BLUE}🔧 Setting environment variables...${NC}"

# Create a temporary file with all environment variables
cat > .env.railway << EOF
NODE_ENV=production
PORT=8080
DATABASE_URL=postgresql://neondb_owner:npg_7yTaSgJPi6Wb@ep-purple-base-a1jv1gjr.ap-southeast-1.aws.neon.tech/weekly-report_db?sslmode=require
DIRECT_URL=postgresql://neondb_owner:npg_7yTaSgJPi6Wb@ep-purple-base-a1jv1gjr.ap-southeast-1.aws.neon.tech/weekly-report_db
JWT_SECRET=aJX3NYxZepmbIbxjnRdLcus+VZVIHE0YtXsXjcpNyTA=
JWT_EXPIRES_IN=7d
JWT_REMEMBER_ME_EXPIRES_IN=30d
FRONTEND_URL=https://weeklyreport-orpin.vercel.app
CORS_ORIGINS=https://weeklyreport-orpin.vercel.app,https://weeklyreportsystem-mu.vercel.app
EOF

# Upload environment variables
railway variables set --file .env.railway

# Clean up temporary file
rm .env.railway

echo -e "${GREEN}✅ Environment variables set${NC}"

# Verify service is connected
echo -e "${BLUE}🔍 Verifying service connection...${NC}"
railway service

# Build locally first
echo -e "${BLUE}🏗️ Building application...${NC}"
pnpm run build

# Deploy to Railway
echo -e "${BLUE}🚂 Deploying to Railway...${NC}"
railway up --detach

# Wait for deployment
echo -e "${BLUE}⏳ Waiting for deployment...${NC}"
sleep 45

# Get domain
echo -e "${BLUE}🌐 Getting application domain...${NC}"
DOMAIN=""
for i in {1..5}; do
    DOMAIN=$(railway domain 2>/dev/null | grep -o 'https://[^ ]*' | head -n1 || echo "")
    if [ -n "$DOMAIN" ]; then
        break
    fi
    echo -e "${YELLOW}⏳ Waiting for domain... ($i/5)${NC}"
    sleep 10
done

if [ -z "$DOMAIN" ]; then
    echo -e "${YELLOW}⚠️  No domain found, generating one...${NC}"
    railway domain create
    sleep 10
    DOMAIN=$(railway domain 2>/dev/null | grep -o 'https://[^ ]*' | head -n1 || echo "")
fi

if [ -n "$DOMAIN" ]; then
    echo -e "${BLUE}🌐 Application URL: $DOMAIN${NC}"
    
    # Health checks
    echo -e "${BLUE}🏥 Running health checks...${NC}"
    for i in {1..15}; do
        if curl -f -s "$DOMAIN/health" >/dev/null 2>&1; then
            echo -e "${GREEN}✅ Health check passed${NC}"
            break
        fi
        if [ $i -eq 15 ]; then
            echo -e "${RED}❌ Health check failed after 15 attempts${NC}"
            echo -e "${BLUE}🔍 Checking logs...${NC}"
            railway logs --tail 20
            echo -e "${YELLOW}⚠️  The app might still be starting up. Please check Railway dashboard.${NC}"
            break
        fi
        echo -e "${YELLOW}⏳ Waiting for app... ($i/15)${NC}"
        sleep 20
    done

    # Test endpoints (only if health check passed)
    if curl -f -s "$DOMAIN/health" >/dev/null 2>&1; then
        echo -e "${BLUE}🧪 Testing endpoints...${NC}"
        echo -n "  • Health: "
        if curl -f -s "$DOMAIN/health" | grep -q "ok"; then
            echo -e "${GREEN}✅${NC}"
        else
            echo -e "${RED}❌${NC}"
        fi

        echo -n "  • API Health: "
        if curl -f -s "$DOMAIN/api/health" | grep -q "ok"; then
            echo -e "${GREEN}✅${NC}"
        else
            echo -e "${RED}❌${NC}"
        fi
    fi

    echo -e "${GREEN}🎉 Deployment completed!${NC}"
    echo -e "${BLUE}📊 Railway Deployment:${NC}"
    echo "  • URL: $DOMAIN"
    echo "  • Health: $DOMAIN/health"
    echo "  • API: $DOMAIN/api/health"
    echo "  • Cost: ~$5/month (much cheaper than Fly.io)"
    echo ""
    echo -e "${BLUE}💡 Next steps:${NC}"
    echo "  1. Run migration: railway run npx prisma migrate deploy"
    echo "  2. Seed database: railway run npx tsx prisma/seed.ts"
    echo "  3. Import data: railway run npx tsx prisma/import-all-data-from-excel.ts"
    echo ""
    echo -e "${BLUE}🔗 Useful commands:${NC}"
    echo "  • View logs: railway logs"
    echo "  • Open dashboard: railway open"
    echo "  • Check status: railway status"
else
    echo -e "${RED}❌ Could not get domain${NC}"
    echo -e "${BLUE}💡 Check Railway dashboard for deployment status${NC}"
    echo -e "${BLUE}🔗 Open dashboard: railway open${NC}"
fi

# Show final service info
echo -e "${BLUE}📋 Service Information:${NC}"
railway service || echo "Service info not available"

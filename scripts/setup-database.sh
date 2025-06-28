#!/bin/bash
# filepath: /home/hoangdanh2000/Desktop/TBS Group/bento-nestjs/weekly-work-report-system/backend/scripts/setup-database.sh

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Set Fly.io path
export PATH="/home/hoangdanh2000/.fly/bin:$PATH"

echo -e "${BLUE}🗄️  Setting up database for Weekly Report Backend...${NC}"

# Check if .env.studio exists
if [ ! -f ".env.studio" ]; then
    echo -e "${YELLOW}📝 Creating .env.studio file...${NC}"
    cat > .env.studio << EOF
DATABASE_URL="postgres://weekly_report_backend:AWVq27MHkURo5ns@localhost:5433/weekly_report_backend"
DIRECT_URL="postgres://weekly_report_backend:AWVq27MHkURo5ns@localhost:5433/weekly_report_backend"
EOF
    echo -e "${GREEN}✅ .env.studio created${NC}"
fi

# Function to setup database via proxy
setup_with_proxy() {
    echo -e "${BLUE}🔄 Setting up database via proxy...${NC}"
    
    # Kill any existing proxy
    pkill -f 'fly proxy.*5433:5432' 2>/dev/null || true
    pkill -f 'fly proxy.*15432:5432' 2>/dev/null || true
    sleep 2
    
    # Start proxy in background
    echo -e "${YELLOW}🌉 Starting database proxy on port 5433...${NC}"
    fly proxy 5433:5432 -a weekly-report-backend-db &
    PROXY_PID=$!
    sleep 10
    
    # Test proxy connection
    echo -e "${BLUE}🔍 Testing proxy connection...${NC}"
    if ! npx dotenv -e .env.studio -- npx prisma db execute --sql="SELECT 1;" 2>/dev/null; then
        echo -e "${RED}❌ Cannot connect via proxy${NC}"
        kill $PROXY_PID 2>/dev/null || true
        return 1
    fi
    
    echo -e "${GREEN}✅ Proxy connection successful${NC}"
    
    # Run migrations
    echo -e "${YELLOW}🔄 Running migrations...${NC}"
    npx dotenv -e .env.studio -- npx prisma migrate deploy
    
    # Seed basic data
    echo -e "${YELLOW}🌱 Seeding basic data...${NC}"
    npx dotenv -e .env.studio -- tsx prisma/seed.ts
    
    # Import Excel data if file exists
    if [ -f "prisma/data.xlsx" ]; then
        echo -e "${YELLOW}📊 Importing Excel data...${NC}"
        npx dotenv -e .env.studio -- tsx prisma/import-all-data-from-excel.ts
    else
        echo -e "${YELLOW}⚠️  Excel file not found at prisma/data.xlsx${NC}"
        echo -e "${YELLOW}   You can import data later using: pnpm db:ops${NC}"
    fi
    
    # Kill proxy
    kill $PROXY_PID 2>/dev/null || true
    pkill -f 'fly proxy.*5433:5432' 2>/dev/null || true
    
    echo -e "${GREEN}✅ Database setup completed via proxy${NC}"
    return 0
}

# Check if app is running
echo -e "${BLUE}🔍 Checking if app is running...${NC}"
APP_RUNNING=false
if curl -f -s https://weekly-report-backend.fly.dev/health > /dev/null 2>&1; then
    APP_RUNNING=true
    echo -e "${GREEN}✅ App is running${NC}"
else
    echo -e "${YELLOW}⚠️  App is not running yet${NC}"
fi

# Try remote setup first if app is running
if [ "$APP_RUNNING" = true ]; then
    echo -e "${BLUE}🎯 Attempting remote database setup...${NC}"
    if fly ssh console -C 'cd /app && npx prisma migrate deploy' 2>/dev/null; then
        echo -e "${GREEN}✅ Remote migrations successful${NC}"
        if fly ssh console -C 'cd /app && npx tsx prisma/seed.ts' 2>/dev/null; then
            echo -e "${GREEN}✅ Remote seeding successful${NC}"
        else
            echo -e "${YELLOW}⚠️  Remote seeding failed, trying proxy method...${NC}"
            setup_with_proxy
        fi
    else
        echo -e "${YELLOW}⚠️  Remote setup failed, using proxy method...${NC}"
        setup_with_proxy
    fi
else
    echo -e "${BLUE}🔄 App not running, using proxy method...${NC}"
    if ! setup_with_proxy; then
        echo -e "${RED}❌ Proxy setup failed${NC}"
        exit 1
    fi
fi

# Test database connection
echo -e "${BLUE}🧪 Testing database connection...${NC}"
if curl -f -s https://weekly-report-backend.fly.dev/api/health/db > /dev/null 2>&1; then
    echo -e "${GREEN}✅ Database connection test passed${NC}"
else
    echo -e "${YELLOW}⚠️  Database connection test failed${NC}"
    echo -e "${BLUE}💡 This is normal if the app hasn't started yet${NC}"
    echo -e "${BLUE}💡 Try: ${YELLOW}curl https://weekly-report-backend.fly.dev/health${NC} to wake up the app"
fi

echo -e "${GREEN}🎉 Database setup completed!${NC}"
echo -e "${BLUE}👤 Default users created:${NC}"
echo "  • SUPERADMIN: CEO001 / 123456"
echo "  • ADMIN: ADM001 / 123456"
echo "  • USER: USR001 / 123456"

echo -e "${BLUE}🛠️  Available database tools:${NC}"
echo "  • Connect to DB: ${YELLOW}pnpm db:connect${NC}"
echo "  • Open Prisma Studio: ${YELLOW}pnpm db:studio${NC}"
echo "  • Database Operations: ${YELLOW}pnpm db:ops${NC}"
echo "  • Health Check: ${YELLOW}curl https://weekly-report-backend.fly.dev/api/health/db${NC}"
echo "  • Test Login: ${YELLOW}pnpm test:login${NC}"
#!/bin/bash
# filepath: /home/hoangdanh2000/Desktop/TBS Group/bento-nestjs/weekly-work-report-system/backend/scripts/prisma-studio.sh

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}🎨 Opening Prisma Studio with Production Database...${NC}"

# Check if .env.studio exists
if [ ! -f ".env.studio" ]; then
    echo -e "${YELLOW}📝 Creating .env.studio file...${NC}"
    cat > .env.studio << EOF
DATABASE_URL="postgres://weekly_report_backend:AWVq27MHkURo5ns@localhost:5433/weekly_report_backend"
DIRECT_URL="postgres://weekly_report_backend:AWVq27MHkURo5ns@localhost:5433/weekly_report_backend"
EOF
    echo -e "${GREEN}✅ .env.studio created${NC}"
fi

# Function to check if port 5433 is accessible
check_port() {
    local port=$1
    if nc -z localhost $port 2>/dev/null; then
        return 0  # Port is accessible
    elif lsof -Pi :$port -sTCP:LISTEN -t >/dev/null 2>&1; then
        return 0  # Port is in use
    else
        return 1  # Port is not accessible
    fi
}

# Function to test database connection with better error handling
test_db_connection() {
    echo -e "${BLUE}🔍 Testing database connection with detailed output...${NC}"
    
    # Test 1: Check if port is reachable
    if ! check_port 5433; then
        echo -e "${RED}❌ Port 5433 is not accessible${NC}"
        return 1
    fi
    
    echo -e "${GREEN}✅ Port 5433 is accessible${NC}"
    
    # Test 2: Try simple psql connection if available
    if command -v psql &> /dev/null; then
        echo -e "${BLUE}🔍 Testing with psql...${NC}"
        if PGPASSWORD=AWVq27MHkURo5ns psql -h localhost -p 5433 -U weekly_report_backend -d weekly_report_backend -c "SELECT 1;" >/dev/null 2>&1; then
            echo -e "${GREEN}✅ psql connection successful${NC}"
            return 0
        else
            echo -e "${YELLOW}⚠️  psql connection failed${NC}"
        fi
    fi
    
    # Test 3: Try with Prisma
    echo -e "${BLUE}🔍 Testing with Prisma...${NC}"
    if npx dotenv -e .env.studio -- npx prisma db execute --sql="SELECT 1;" 2>/dev/null; then
        echo -e "${GREEN}✅ Prisma connection successful${NC}"
        return 0
    else
        echo -e "${RED}❌ Prisma connection failed${NC}"
        
        # Show more detailed error
        echo -e "${BLUE}🔍 Running detailed Prisma test...${NC}"
        npx dotenv -e .env.studio -- npx prisma db execute --sql="SELECT 1;" 2>&1 || true
        return 1
    fi
}

# Function to check if Prisma Studio port is available
check_studio_port() {
    local port=${1:-5555}
    if lsof -Pi :$port -sTCP:LISTEN -t >/dev/null 2>&1; then
        return 0  # Port is in use
    else
        return 1  # Port is free
    fi
}

# Check if port 5433 is open
echo -e "${BLUE}🔍 Checking if database proxy is running on port 5433...${NC}"
if ! check_port 5433; then
    echo -e "${RED}❌ Port 5433 is not accessible${NC}"
    echo -e "${BLUE}💡 You need to start the database proxy first:${NC}"
    echo ""
    echo -e "${YELLOW}In Terminal 1 (keep this running):${NC}"
    echo "  pnpm db:connect"
    echo ""
    echo -e "${YELLOW}Then in Terminal 2 (this terminal):${NC}"
    echo "  pnpm db:studio"
    echo ""
    exit 1
fi

echo -e "${GREEN}✅ Port 5433 is accessible${NC}"

# Test database connection with more detailed output
if ! test_db_connection; then
    echo -e "${RED}❌ Cannot connect to database${NC}"
    echo -e "${BLUE}💡 Troubleshooting steps:${NC}"
    echo ""
    echo -e "${YELLOW}1. Check if the proxy terminal shows any errors${NC}"
    echo -e "${YELLOW}2. Try restarting the proxy:${NC}"
    echo "   - Stop the proxy (Ctrl+C in proxy terminal)"
    echo "   - Run: pnpm db:connect"
    echo ""
    echo -e "${YELLOW}3. Or try the manual approach:${NC}"
    echo "   export DATABASE_URL=\"postgres://weekly_report_backend:AWVq27MHkURo5ns@localhost:5433/weekly_report_backend\""
    echo "   npx prisma studio --port 5555"
    echo ""
    exit 1
fi

echo -e "${GREEN}✅ Database connection verified${NC}"

# Find available port for Prisma Studio
STUDIO_PORT=5555
while check_studio_port $STUDIO_PORT; do
    STUDIO_PORT=$((STUDIO_PORT + 1))
    if [ $STUDIO_PORT -gt 5565 ]; then
        echo -e "${RED}❌ Cannot find available port for Prisma Studio${NC}"
        exit 1
    fi
done

echo -e "${BLUE}🎨 Starting Prisma Studio on port ${STUDIO_PORT}...${NC}"

# Start Prisma Studio
echo -e "${GREEN}✅ Prisma Studio starting...${NC}"
echo -e "${BLUE}🌐 Studio will be available at: http://localhost:${STUDIO_PORT}${NC}"
echo -e "${YELLOW}💡 Press Ctrl+C to stop Prisma Studio${NC}"
echo -e "${YELLOW}💡 Keep the database proxy running in the other terminal${NC}"
echo ""

# Set environment variable explicitly and run Prisma Studio
export DATABASE_URL="postgres://weekly_report_backend:AWVq27MHkURo5ns@localhost:5433/weekly_report_backend"
export DIRECT_URL="postgres://weekly_report_backend:AWVq27MHkURo5ns@localhost:5433/weekly_report_backend"

# Run Prisma Studio with explicit environment
BROWSER=none npx dotenv -e .env.studio -- npx prisma studio --port $STUDIO_PORT

echo -e "${GREEN}✅ Prisma Studio stopped${NC}"
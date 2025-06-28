#!/bin/bash
# filepath: /home/hoangdanh2000/Desktop/TBS Group/bento-nestjs/weekly-work-report-system/backend/scripts/db-connect.sh

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Set Fly.io path
export PATH="/home/hoangdanh2000/.fly/bin:$PATH"

echo -e "${BLUE}🔗 Connecting to Production Database...${NC}"

# Check if .env.studio exists, create if not
if [ ! -f ".env.studio" ]; then
    echo -e "${YELLOW}📝 Creating .env.studio file...${NC}"
    cat > .env.studio << EOF
DATABASE_URL="postgres://weekly_report_backend:AWVq27MHkURo5ns@localhost:5433/weekly_report_backend"
DIRECT_URL="postgres://weekly_report_backend:AWVq27MHkURo5ns@localhost:5433/weekly_report_backend"
EOF
    echo -e "${GREEN}✅ .env.studio created${NC}"
fi

# Function to check if port is in use
check_port() {
    local port=$1
    if lsof -Pi :$port -sTCP:LISTEN -t >/dev/null; then
        return 0  # Port is in use
    else
        return 1  # Port is free
    fi
}

# Function to kill existing proxy
kill_existing_proxy() {
    echo -e "${YELLOW}🔄 Killing any existing database proxy...${NC}"
    pkill -f 'fly proxy.*5433:5432' 2>/dev/null || true
    pkill -f 'fly proxy.*15432:5432' 2>/dev/null || true
    sleep 2
}

# Function to start proxy
start_proxy() {
    echo -e "${YELLOW}🌉 Starting database proxy on port 5433...${NC}"
    
    # Check if port 5433 is already in use
    if check_port 5433; then
        echo -e "${RED}❌ Port 5433 is already in use${NC}"
        echo -e "${BLUE}💡 Checking what's using port 5433:${NC}"
        lsof -i :5433
        echo -e "${YELLOW}⚠️  Killing processes on port 5433...${NC}"
        lsof -ti :5433 | xargs kill -9 2>/dev/null || true
        sleep 2
    fi
    
    # Start the proxy in background
    nohup fly proxy 5433:5432 -a weekly-report-backend-db > /tmp/fly-proxy.log 2>&1 &
    PROXY_PID=$!
    
    # Wait for proxy to start
    echo -e "${BLUE}⏳ Waiting for proxy to start...${NC}"
    sleep 5
    
    # Test proxy connection
    echo -e "${BLUE}🔍 Testing proxy connection...${NC}"
    for i in {1..10}; do
        if check_port 5433; then
            echo -e "${GREEN}✅ Proxy is running on port 5433${NC}"
            echo -e "${BLUE}📡 Proxy PID: ${PROXY_PID}${NC}"
            return 0
        fi
        echo -e "${YELLOW}⏳ Waiting for proxy... (attempt $i/10)${NC}"
        sleep 2
    done
    
    echo -e "${RED}❌ Failed to start proxy${NC}"
    return 1
}

# Function to test database connection
test_connection() {
    echo -e "${BLUE}🧪 Testing database connection...${NC}"
    
    # Test with psql if available
    if command -v psql &> /dev/null; then
        if PGPASSWORD=AWVq27MHkURo5ns psql -h localhost -p 5433 -U weekly_report_backend -d weekly_report_backend -c "SELECT 1;" &>/dev/null; then
            echo -e "${GREEN}✅ Database connection successful${NC}"
            return 0
        fi
    fi
    
    # Test with Prisma
    if npx dotenv -e .env.studio -- npx prisma db execute --sql="SELECT 1;" 2>/dev/null; then
        echo -e "${GREEN}✅ Database connection successful (via Prisma)${NC}"
        return 0
    fi
    
    echo -e "${RED}❌ Database connection failed${NC}"
    return 1
}

# Main execution
main() {
    # Check if fly CLI is available
    if ! command -v fly &> /dev/null; then
        echo -e "${RED}❌ Fly CLI not found${NC}"
        echo -e "${BLUE}💡 Run: ./scripts/setup.sh to install Fly CLI${NC}"
        exit 1
    fi
    
    # Kill any existing proxy
    kill_existing_proxy
    
    # Start proxy
    if start_proxy; then
        # Test connection
        if test_connection; then
            echo -e "${GREEN}🎉 Database proxy is ready!${NC}"
            echo -e "${BLUE}📋 Connection details:${NC}"
            echo "  • Host: localhost"
            echo "  • Port: 5433"
            echo "  • Database: weekly_report_backend"
            echo "  • Username: weekly_report_backend"
            echo "  • Password: AWVq27MHkURo5ns"
            echo ""
            echo -e "${BLUE}🛠️  Available commands:${NC}"
            echo "  • Open Prisma Studio: ./scripts/prisma-studio.sh"
            echo "  • Run migrations: npx dotenv -e .env.studio -- npx prisma migrate deploy"
            # echo "  • Seed database: npx dotenv -e .env.studio -- tsx prisma/seed.ts"
            echo "  • Import Excel: npx dotenv -e .env.studio -- tsx prisma/import-all-data-from-excel.ts"
            echo ""
            echo -e "${YELLOW}💡 Keep this terminal open to maintain the database connection${NC}"
            echo -e "${YELLOW}💡 Press Ctrl+C to stop the proxy${NC}"
            
            # Keep the script running
            wait
        else
            echo -e "${RED}❌ Failed to connect to database${NC}"
            exit 1
        fi
    else
        echo -e "${RED}❌ Failed to start proxy${NC}"
        exit 1
    fi
}

# Handle Ctrl+C
trap 'echo -e "\n${YELLOW}🔄 Stopping database proxy...${NC}"; kill_existing_proxy; echo -e "${GREEN}✅ Database proxy stopped${NC}"; exit 0' INT

# Run main function
main
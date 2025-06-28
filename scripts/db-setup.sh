#!/bin/bash
set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

export PATH="/home/hoangdanh2000/.fly/bin:$PATH"

OPERATION=${1:-"setup"}

echo -e "${BLUE}🚀 Database Setup for Production - Operation: $OPERATION${NC}"

# Functions
cleanup_proxies() {
    echo -e "${YELLOW}🧹 Cleaning up existing proxies...${NC}"
    pkill -f 'fly proxy' 2>/dev/null || true
    sleep 3
}

check_database_status() {
    echo -e "${BLUE}🔍 Checking database server status...${NC}"
    DB_STATUS=$(fly status -a weekly-report-backend-db 2>&1 || echo "ERROR")
    
    if echo "$DB_STATUS" | grep -q "stopped\|ERROR"; then
        echo -e "${YELLOW}🔄 Database server is stopped, starting...${NC}"
        fly restart -a weekly-report-backend-db
        echo -e "${BLUE}⏳ Waiting 45 seconds for database to start...${NC}"
        sleep 45
        return 1
    else
        echo -e "${GREEN}✅ Database server is running${NC}"
        return 0
    fi
}

test_connection() {
    echo -e "${BLUE}🔍 Testing database connection...${NC}"
    for i in {1..10}; do
        if npx dotenv -e .env.studio -- npx prisma db execute --sql="SELECT 1 as test;" 2>/dev/null; then
            echo -e "${GREEN}✅ Database connected (attempt $i)${NC}"
            return 0
        fi
        echo -e "${YELLOW}⏳ Waiting for connection... ($i/10)${NC}"
        sleep 5
    done
    echo -e "${RED}❌ Connection failed after 10 attempts${NC}"
    return 1
}

setup_proxy() {
    echo -e "${BLUE}🌉 Setting up database proxy...${NC}"
    
    cleanup_proxies
    
    # Start proxy with timeout
    timeout 300s fly proxy 5433:5432 -a weekly-report-backend-db &
    PROXY_PID=$!
    
    echo -e "${BLUE}⏳ Waiting 20 seconds for proxy to stabilize...${NC}"
    sleep 20
    
    if ! test_connection; then
        echo -e "${RED}❌ Failed to establish proxy connection${NC}"
        kill $PROXY_PID 2>/dev/null || true
        return 1
    fi
    
    echo -e "${GREEN}✅ Proxy connection established${NC}"
    return 0
}

run_database_operations() {
    case $OPERATION in
        "migrate")
            echo -e "${YELLOW}🔄 Running migrations...${NC}"
            npx dotenv -e .env.studio -- npx prisma migrate deploy
            ;;
        "seed")
            echo -e "${YELLOW}🌱 Seeding basic data...${NC}"
            npx dotenv -e .env.studio -- tsx prisma/seed.ts
            ;;
        "import")
            if [ -f "prisma/data.xlsx" ]; then
                echo -e "${YELLOW}📊 Importing Excel data...${NC}"
                npx dotenv -e .env.studio -- tsx prisma/import-all-data-from-excel.ts
            else
                echo -e "${YELLOW}⚠️ No Excel file found at prisma/data.xlsx${NC}"
                echo -e "${BLUE}💡 Skipping Excel import${NC}"
            fi
            ;;
        "reset")
            echo -e "${RED}⚠️ WARNING: This will delete all data!${NC}"
            read -p "Type 'CONFIRM' to proceed: " confirm
            if [ "$confirm" = "CONFIRM" ]; then
                echo -e "${BLUE}🗑️ Resetting database...${NC}"
                npx dotenv -e .env.studio -- npx prisma migrate reset --force
                echo -e "${YELLOW}🌱 Re-seeding after reset...${NC}"
                npx dotenv -e .env.studio -- tsx prisma/seed.ts
            else
                echo -e "${YELLOW}❌ Reset cancelled${NC}"
                return 1
            fi
            ;;
        "full"|"setup")
            echo -e "${YELLOW}🔄 Full setup: generate + migrate + seed + import${NC}"
            
            # Generate Prisma client
            echo -e "${BLUE}🔄 Generating Prisma client...${NC}"
            npx prisma generate
            
            # Run migrations
            npx dotenv -e .env.studio -- npx prisma migrate deploy
            
            # Seed basic data
            npx dotenv -e .env.studio -- tsx prisma/seed.ts
            
            # Import Excel if available
            if [ -f "prisma/data.xlsx" ]; then
                npx dotenv -e .env.studio -- tsx prisma/import-all-data-from-excel.ts
                echo -e "${GREEN}✅ Excel data imported${NC}"
            else
                echo -e "${YELLOW}ℹ️ No Excel file found, creating additional test users...${NC}"
                # Create test user 552502356 if no Excel file
                npx dotenv -e .env.studio -- npx prisma db execute --sql="
                INSERT INTO \"User\" (
                  id, \"employeeCode\", email, password, \"firstName\", \"lastName\", 
                  \"phone\", role, \"jobPositionId\", \"officeId\", \"isActive\", \"createdAt\", \"updatedAt\"
                ) VALUES (
                  'user-552502356', '552502356', '552502356@company.com', 
                  '\$2b\$10\$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi',
                  'User', '552502356', '552502356', 'USER',
                  (SELECT id FROM \"JobPosition\" LIMIT 1),
                  (SELECT id FROM \"Office\" LIMIT 1),
                  true, NOW(), NOW()
                )
                ON CONFLICT (\"employeeCode\") DO UPDATE SET
                  password = EXCLUDED.password,
                  \"isActive\" = true,
                  \"updatedAt\" = NOW();
                " 2>/dev/null && echo -e "${GREEN}✅ Test user 552502356 created${NC}" || echo -e "${YELLOW}⚠️ User creation may have failed${NC}"
            fi
            ;;
        *)
            echo -e "${RED}❌ Unknown operation: $OPERATION${NC}"
            echo -e "${BLUE}💡 Available operations: migrate, seed, import, reset, full, setup${NC}"
            return 1
            ;;
    esac
}

cleanup() {
    if [ ! -z "$PROXY_PID" ]; then
        kill $PROXY_PID 2>/dev/null || true
    fi
    cleanup_proxies
}

# Main execution
trap cleanup EXIT

echo -e "${BLUE}📊 Checking system status...${NC}"

# Check if database server is running
check_database_status

# Setup proxy connection
if setup_proxy; then
    # Run the requested operations
    if run_database_operations; then
        echo -e "${GREEN}✅ Database operations completed successfully!${NC}"
        
        # Test the result
        echo -e "${BLUE}🧪 Testing API after setup...${NC}"
        sleep 30
        
        # Test database health via API
        DB_HEALTH=$(curl -s https://weekly-report-backend.fly.dev/api/health/db || echo "Health check failed")
        echo -e "${BLUE}🏥 Database health: $DB_HEALTH${NC}"
        
        # Test login
        echo -e "${BLUE}🧪 Testing login...${NC}"
        LOGIN_TEST=$(curl -s -X POST https://weekly-report-backend.fly.dev/api/auth/login \
            -H "Content-Type: application/json" \
            -H "Origin: https://weeklyreport-orpin.vercel.app" \
            -d '{"employeeCode":"CEO001","password":"123456"}')
        
        if echo "$LOGIN_TEST" | grep -q '"access_token"'; then
            echo -e "${GREEN}🎉 SUCCESS! Login is working!${NC}"
            echo -e "${BLUE}👤 Test credentials:${NC}"
            echo "  • CEO001 / 123456 (SUPERADMIN)"
            echo "  • ADM001 / 123456 (ADMIN)" 
            echo "  • USR001 / 123456 (USER)"
            echo "  • 552502356 / 123456 (USER)"
        else
            echo -e "${YELLOW}⚠️ Setup completed but login test failed${NC}"
            echo -e "${BLUE}💡 Try again in a few minutes for changes to propagate${NC}"
            echo "Response: $(echo "$LOGIN_TEST" | head -c 200)..."
        fi
    else
        echo -e "${RED}❌ Database operations failed${NC}"
        exit 1
    fi
else
    echo -e "${RED}❌ Failed to setup database connection${NC}"
    exit 1
fi

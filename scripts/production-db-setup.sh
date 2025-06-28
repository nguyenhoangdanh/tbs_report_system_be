#!/bin/bash

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Set Fly.io path
export PATH="/home/hoangdanh2000/.fly/bin:$PATH"

# Check if we have command line argument
if [ $# -gt 0 ]; then
    OPERATION_MODE="$1"
else
    OPERATION_MODE="interactive"
fi

echo -e "${BLUE}🚀 Complete Production Database Setup Guide${NC}"
echo "=================================================="

# Function to cleanup proxies
cleanup_proxies() {
    echo -e "${YELLOW}🧹 Cleaning up existing proxies...${NC}"
    pkill -f 'fly proxy' 2>/dev/null || true
    sleep 3
}

# Function to test database connection with better error handling
test_connection() {
    local port=$1
    echo -e "${BLUE}🔍 Testing database connection on port $port...${NC}"
    
    for i in {1..5}; do
        if npx dotenv -e .env.studio -- npx prisma db execute --sql="SELECT 1 as test;" 2>/dev/null; then
            echo -e "${GREEN}✅ Database connection successful (attempt $i)${NC}"
            return 0
        else
            echo -e "${YELLOW}⚠️  Connection failed (attempt $i/5), retrying...${NC}"
            sleep 5
        fi
    done
    
    echo -e "${RED}❌ Database connection failed after 5 attempts${NC}"
    
    # Show detailed error for debugging
    echo -e "${BLUE}🔍 Detailed connection test:${NC}"
    npx dotenv -e .env.studio -- npx prisma db execute --sql="SELECT 1 as test;" 2>&1 || true
    return 1
}

# Function to run database operations
run_db_operations() {
    local operation=$1
    
    case $operation in
        "generate")
            echo -e "${BLUE}🔄 Generating Prisma client...${NC}"
            npx prisma generate
            echo -e "${GREEN}✅ Prisma client generated${NC}"
            ;;
        "migrate")
            echo -e "${BLUE}🔄 Running database migrations...${NC}"
            npx dotenv -e .env.studio -- npx prisma migrate deploy
            echo -e "${GREEN}✅ Migrations completed${NC}"
            ;;
        "seed")
            echo -e "${BLUE}🌱 Seeding basic data...${NC}"
            npx dotenv -e .env.studio -- tsx prisma/seed.ts
            echo -e "${GREEN}✅ Basic data seeded${NC}"
            ;;
        "import")
            if [ -f "prisma/data.xlsx" ]; then
                echo -e "${BLUE}📊 Importing Excel data...${NC}"
                npx dotenv -e .env.studio -- tsx prisma/import-all-data-from-excel.ts
                echo -e "${GREEN}✅ Excel data imported${NC}"
            else
                echo -e "${YELLOW}⚠️  No Excel file found at prisma/data.xlsx${NC}"
                echo -e "${BLUE}💡 Skipping Excel import${NC}"
            fi
            ;;
        "reset")
            echo -e "${RED}⚠️  WARNING: This will DELETE ALL DATA!${NC}"
            if [ "$OPERATION_MODE" = "interactive" ]; then
                read -p "Type 'CONFIRM' to proceed: " confirm
                if [ "$confirm" != "CONFIRM" ]; then
                    echo -e "${YELLOW}❌ Reset cancelled${NC}"
                    return 1
                fi
            fi
            echo -e "${BLUE}🗑️  Resetting database...${NC}"
            npx dotenv -e .env.studio -- npx prisma migrate reset --force
            echo -e "${GREEN}✅ Database reset completed${NC}"
            ;;
        *)
            echo -e "${RED}❌ Unknown operation: $operation${NC}"
            return 1
            ;;
    esac
}

# Function to setup proxy and run operations
setup_and_run() {
    local operations=("$@")
    
    # Setup .env.studio with SSL configuration for production
    echo -e "${BLUE}📝 Creating .env.studio file with SSL config...${NC}"
    cat > .env.studio << EOF
DATABASE_URL="postgres://weekly_report_backend:AWVq27MHkURo5ns@localhost:5433/weekly_report_backend?sslmode=require&connect_timeout=60&pool_timeout=60"
DIRECT_URL="postgres://weekly_report_backend:AWVq27MHkURo5ns@localhost:5433/weekly_report_backend?sslmode=require&connect_timeout=60"
EOF
    
    cleanup_proxies
    
    # Start proxy with longer timeout
    echo -e "${YELLOW}🌉 Starting database proxy...${NC}"
    timeout 300s fly proxy 5433:5432 -a weekly-report-backend-db &
    PROXY_PID=$!
    
    # Wait longer for proxy to start and stabilize
    echo -e "${BLUE}⏳ Waiting for proxy to initialize (20 seconds)...${NC}"
    sleep 20
    
    # Test connection
    if ! test_connection 5433; then
        echo -e "${RED}❌ Cannot connect to database${NC}"
        kill $PROXY_PID 2>/dev/null || true
        cleanup_proxies
        return 1
    fi
    
    # Run operations
    for operation in "${operations[@]}"; do
        echo -e "\n${BLUE}▶️  Running operation: $operation${NC}"
        if ! run_db_operations "$operation"; then
            echo -e "${RED}❌ Operation '$operation' failed${NC}"
            kill $PROXY_PID 2>/dev/null || true
            cleanup_proxies
            return 1
        fi
    done
    
    # Cleanup
    kill $PROXY_PID 2>/dev/null || true
    cleanup_proxies
    
    echo -e "${GREEN}🎉 All operations completed successfully!${NC}"
    return 0
}

# Handle command line arguments
case $OPERATION_MODE in
    "migrate")
        echo -e "${BLUE}🏗️  Running migrations only...${NC}"
        setup_and_run "migrate"
        ;;
    "seed")
        echo -e "${BLUE}🌱 Seeding basic data only...${NC}"
        setup_and_run "seed"
        ;;
    "import")
        echo -e "${BLUE}📊 Importing Excel data only...${NC}"
        setup_and_run "import"
        ;;
    "reset")
        echo -e "${BLUE}🗑️  Resetting database...${NC}"
        setup_and_run "reset" "seed"
        ;;
    "full")
        echo -e "${BLUE}🚀 Complete setup...${NC}"
        setup_and_run "generate" "migrate" "seed" "import"
        ;;
    "quick")
        echo -e "${BLUE}🔧 Quick setup...${NC}"
        setup_and_run "generate" "migrate" "seed"
        ;;
    "interactive"|*)
        # Interactive menu
        echo -e "${BLUE}📋 Choose your operation:${NC}"
        echo "1. 🔄 Generate Prisma Client"
        echo "2. 🏗️  Run Migrations"
        echo "3. 🌱 Seed Basic Data"
        echo "4. 📊 Import Excel Data"
        echo "5. 🗑️  Reset Database (DANGEROUS!)"
        echo "6. 🚀 Complete Setup (Generate + Migrate + Seed + Import)"
        echo "7. 🔧 Quick Setup (Generate + Migrate + Seed)"
        echo "8. 📱 Custom Operations"

        read -p "Enter your choice (1-8): " choice

        case $choice in
            1)
                run_db_operations "generate"
                ;;
            2)
                setup_and_run "migrate"
                ;;
            3)
                setup_and_run "seed"
                ;;
            4)
                setup_and_run "import"
                ;;
            5)
                setup_and_run "reset" "seed"
                ;;
            6)
                setup_and_run "generate" "migrate" "seed" "import"
                ;;
            7)
                setup_and_run "generate" "migrate" "seed"
                ;;
            8)
                echo -e "${BLUE}💡 Custom operations - select multiple:${NC}"
                echo "Available: generate, migrate, seed, import, reset"
                read -p "Enter operations (space-separated): " -a custom_ops
                setup_and_run "${custom_ops[@]}"
                ;;
            *)
                echo -e "${RED}❌ Invalid choice${NC}"
                exit 1
                ;;
        esac
        ;;
esac

# Only run final tests for operations that need them
if [ "$OPERATION_MODE" != "generate" ]; then
    # Final test
    echo -e "\n${BLUE}🧪 Testing final result...${NC}"
    sleep 10

    # Test API health
    echo -e "${YELLOW}Testing API health...${NC}"
    API_HEALTH=$(curl -s https://weekly-report-backend.fly.dev/api/health || echo "API_FAILED")
    if echo "$API_HEALTH" | grep -q '"status":"ok"'; then
        echo -e "${GREEN}✅ API is healthy${NC}"
    else
        echo -e "${YELLOW}⚠️  API may still be starting up${NC}"
    fi

    # Test database health
    echo -e "${YELLOW}Testing database health...${NC}"
    DB_HEALTH=$(curl -s https://weekly-report-backend.fly.dev/api/health/db || echo "DB_HEALTH_FAILED")
    if echo "$DB_HEALTH" | grep -q '"status":"ok"'; then
        echo -e "${GREEN}✅ Database is healthy${NC}"
    else
        echo -e "${YELLOW}⚠️  Database health check failed${NC}"
        echo "Response: $DB_HEALTH"
    fi

    # Test login
    echo -e "${YELLOW}Testing login...${NC}"
    LOGIN_TEST=$(curl -s -X POST https://weekly-report-backend.fly.dev/api/auth/login \
      -H "Content-Type: application/json" \
      -H "Origin: https://weeklyreport-orpin.vercel.app" \
      -d '{"employeeCode":"CEO001","password":"123456"}' || echo "LOGIN_FAILED")

    if echo "$LOGIN_TEST" | grep -q '"access_token"'; then
        echo -e "${GREEN}✅ Login test successful!${NC}"
    else
        echo -e "${RED}❌ Login test failed${NC}"
        echo "Response: $(echo "$LOGIN_TEST" | head -c 200)..."
    fi

    echo -e "\n${BLUE}📋 Summary:${NC}"
    echo "  • Operations: ✅ Completed"
    echo "  • API Health: $(echo "$API_HEALTH" | grep -q '"status":"ok"' && echo "✅ OK" || echo "❌ Failed")"
    echo "  • DB Health: $(echo "$DB_HEALTH" | grep -q '"status":"ok"' && echo "✅ OK" || echo "❌ Failed")"
    echo "  • Login Test: $(echo "$LOGIN_TEST" | grep -q '"access_token"' && echo "✅ OK" || echo "❌ Failed")"

    echo -e "\n${BLUE}👤 Test Users (password: 123456):${NC}"
    echo "  • CEO001 (SUPERADMIN)"
    echo "  • ADM001 (ADMIN)"  
    echo "  • USR001 (USER)"

    echo -e "\n${BLUE}📞 Manual test command:${NC}"
    echo "curl -X POST https://weekly-report-backend.fly.dev/api/auth/login \\"
    echo "  -H 'Content-Type: application/json' \\"
    echo "  -H 'Origin: https://weeklyreport-orpin.vercel.app' \\"
    echo "  -d '{\"employeeCode\":\"CEO001\",\"password\":\"123456\"}'"
fi

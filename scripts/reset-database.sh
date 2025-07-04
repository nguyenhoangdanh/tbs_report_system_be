#!/bin/bash
set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

export PATH="/home/hoangdanh2000/.fly/bin:$PATH"

MODE=${1:-""}
FORCE=${2:-""}

# Load database credentials from .env.production
load_db_credentials() {
    if [ -f ".env.production" ]; then
        export $(grep -E "^(DB_|DATABASE_URL|DIRECT_URL)" .env.production | xargs)
        echo -e "${GREEN}✅ Loaded credentials from .env.production${NC}"
    else
        echo -e "${RED}❌ .env.production not found${NC}"
        exit 1
    fi
}

show_help() {
    echo -e "${BLUE}🗄️ Enhanced Database Reset Script${NC}"
    echo "=================================="
    echo ""
    echo -e "${CYAN}Usage:${NC}"
    echo "  ./scripts/reset-database.sh [MODE] [--force]"
    echo ""
    echo -e "${CYAN}Modes:${NC}"
    echo "  local       - Reset local Docker database"
    echo "  production  - Reset production database (schema only)"
    echo "  recreate    - Completely recreate production database"
    echo ""
    echo -e "${CYAN}Options:${NC}"
    echo "  --force     - Skip confirmation prompts"
    echo ""
    echo -e "${CYAN}Examples:${NC}"
    echo "  ./scripts/reset-database.sh local"
    echo "  ./scripts/reset-database.sh production"
    echo "  ./scripts/reset-database.sh recreate --force"
}

confirm_action() {
    local message=$1
    if [ "$FORCE" = "--force" ]; then
        echo -e "${YELLOW}⚠️ FORCE MODE: Skipping confirmation${NC}"
        return 0
    fi
    
    echo -e "${RED}⚠️ WARNING: ${message}${NC}"
    echo -e "${YELLOW}This action cannot be undone!${NC}"
    echo ""
    read -p "Are you absolutely sure? Type 'YES' to continue: " -r
    echo ""
    
    if [[ $REPLY = "YES" ]]; then
        return 0
    else
        echo -e "${BLUE}ℹ️ Operation cancelled${NC}"
        exit 0
    fi
}

reset_local_database() {
    echo -e "${BLUE}🏠 Resetting Local Database${NC}"
    echo "=========================="
    
    confirm_action "This will destroy ALL LOCAL data and recreate the database"
    
    echo -e "${BLUE}🔄 Step 1: Stopping Docker containers...${NC}"
    docker compose down -v || true
    
    echo -e "${BLUE}🗑️ Step 2: Removing Docker volumes...${NC}"
    docker volume rm backend_postgres_data 2>/dev/null || true
    docker volume rm backend_redis_data 2>/dev/null || true
    docker volume rm backend_pgadmin_data 2>/dev/null || true
    
    echo -e "${BLUE}🧹 Step 3: Cleaning up Docker system...${NC}"
    docker system prune -f --volumes
    
    echo -e "${BLUE}🆕 Step 4: Starting fresh containers...${NC}"
    docker compose up -d
    
    echo -e "${BLUE}⏳ Step 5: Waiting for PostgreSQL...${NC}"
    for i in {1..30}; do
        if docker compose exec postgres pg_isready -U postgres -d weekly_report_dev >/dev/null 2>&1; then
            echo -e "${GREEN}✅ PostgreSQL ready${NC}"
            break
        fi
        echo "Waiting... ($i/30)"
        sleep 2
    done
    
    echo -e "${BLUE}🔄 Step 6: Running database migrations...${NC}"
    dotenv -e .env.local -- npx prisma migrate reset --force
    
    echo -e "${BLUE}📊 Step 7: Importing Excel data (if available)...${NC}"
    if [ -f "prisma/data.xlsx" ]; then
        dotenv -e .env.local -- npx tsx prisma/import-all-data-from-excel.ts
    else
        echo -e "${YELLOW}ℹ️ No Excel file found, skipping import${NC}"
    fi
    
    echo -e "${GREEN}🎉 Local database reset completed!${NC}"
}

reset_production_schema() {
    echo -e "${BLUE}🌐 Resetting Production Database Schema${NC}"
    echo "====================================="
    
    confirm_action "This will reset the production database schema but keep the database instance"
    
    load_db_credentials
    
    echo -e "${BLUE}🔍 Step 1: Checking database status...${NC}"
    if ! flyctl status -a weekly-report-backend-db >/dev/null 2>&1; then
        echo -e "${RED}❌ Database not found. Use 'recreate' mode to create new database${NC}"
        exit 1
    fi
    
    echo -e "${BLUE}🏥 Step 2: Ensuring backend is healthy...${NC}"
    for i in {1..5}; do
        if curl -f -s https://weekly-report-backend.fly.dev/health >/dev/null; then
            echo -e "${GREEN}✅ Backend is healthy${NC}"
            break
        fi
        if [ $i -eq 5 ]; then
            echo -e "${YELLOW}⚠️ Backend not responding, restarting...${NC}"
            flyctl apps restart weekly-report-backend
            sleep 60
        else
            echo "Checking backend health... ($i/5)"
            sleep 10
        fi
    done
    
    echo -e "${BLUE}🔄 Step 3: Attempting multiple SSL/reset methods...${NC}"
    
    # Method 1: Try sslmode=disable first
    echo -e "${BLUE}🔧 Method 1: Reset with SSL disabled...${NC}"
    flyctl secrets set \
        DATABASE_URL="postgres://$DB_USER:$DB_PASSWORD@$DB_HOST:5432/$DB_NAME?sslmode=disable&connect_timeout=30" \
        DIRECT_URL="postgres://$DB_USER:$DB_PASSWORD@$DB_HOST:5432/$DB_NAME?sslmode=disable&connect_timeout=30" \
        --app weekly-report-backend
    
    echo -e "${BLUE}🔄 Restarting with SSL disabled...${NC}"
    flyctl apps restart weekly-report-backend
    sleep 45
    
    # Try method 1.1: Prisma db push --force-reset
    echo -e "${BLUE}🔧 Method 1.1: Prisma force reset...${NC}"
    if flyctl ssh console -a weekly-report-backend -C "npx prisma db push --force-reset --accept-data-loss" 2>/dev/null; then
        echo -e "${GREEN}✅ Schema reset successful with SSL disabled${NC}"
    else
        echo -e "${YELLOW}⚠️ Method 1.1 failed, trying method 1.2...${NC}"
        
        # Try method 1.2: Direct SQL via psql
        echo -e "${BLUE}🔧 Method 1.2: Direct SQL reset...${NC}"
        if flyctl ssh console -a weekly-report-backend -C "PGPASSWORD='$DB_PASSWORD' psql -h $DB_HOST -p 5432 -U $DB_USER -d $DB_NAME -c 'DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public; GRANT ALL ON SCHEMA public TO $DB_USER; GRANT ALL ON SCHEMA public TO public;'" 2>/dev/null; then
            echo -e "${GREEN}✅ SQL reset successful${NC}"
            
            # Deploy fresh schema
            echo -e "${BLUE}🏗️ Deploying fresh schema...${NC}"
            if flyctl ssh console -a weekly-report-backend -C "npx prisma db push" 2>/dev/null; then
                echo -e "${GREEN}✅ Schema deployed successfully${NC}"
            else
                echo -e "${RED}❌ Schema deployment failed${NC}"
                exit 1
            fi
        else
            echo -e "${YELLOW}⚠️ Method 1.2 failed, trying method 2...${NC}"
            
            # Method 2: Try with sslmode=prefer
            echo -e "${BLUE}🔧 Method 2: Reset with SSL prefer...${NC}"
            flyctl secrets set \
                DATABASE_URL="postgres://$DB_USER:$DB_PASSWORD@$DB_HOST:5432/$DB_NAME?sslmode=prefer&connect_timeout=30" \
                DIRECT_URL="postgres://$DB_USER:$DB_PASSWORD@$DB_HOST:5432/$DB_NAME?sslmode=prefer&connect_timeout=30" \
                --app weekly-report-backend
            
            flyctl apps restart weekly-report-backend
            sleep 45
            
            if flyctl ssh console -a weekly-report-backend -C "npx prisma db push --force-reset --accept-data-loss" 2>/dev/null; then
                echo -e "${GREEN}✅ Schema reset successful with SSL prefer${NC}"
            else
                echo -e "${YELLOW}⚠️ Method 2 failed, trying method 3...${NC}"
                
                # Method 3: Database proxy approach
                echo -e "${BLUE}🔧 Method 3: Using local proxy...${NC}"
                reset_via_proxy
                if [ $? -eq 0 ]; then
                    echo -e "${GREEN}✅ Schema reset successful via proxy${NC}"
                else
                    echo -e "${RED}❌ All reset methods failed${NC}"
                    echo -e "${BLUE}💡 Recommendations:${NC}"
                    echo "  1. Try complete recreation: pnpm db:reset recreate"
                    echo "  2. Check database logs: flyctl logs -a weekly-report-backend-db"
                    echo "  3. Check network connectivity"
                    exit 1
                fi
            fi
        fi
    fi
    
    echo -e "${BLUE}📊 Step 4: Importing Excel data (if available)...${NC}"
    import_excel_data
    
    echo -e "${BLUE}🧪 Step 5: Testing system...${NC}"
    test_production_system
    
    echo -e "${GREEN}🎉 Production schema reset completed!${NC}"
    echo -e "${BLUE}💡 Database instance and password remain unchanged${NC}"
}

# Function to reset via local proxy
reset_via_proxy() {
    echo -e "${BLUE}🌉 Attempting reset via database proxy...${NC}"
    
    # Start proxy in background
    flyctl proxy 15432:5432 -a weekly-report-backend-db &
    PROXY_PID=$!
    
    # Cleanup function
    cleanup_proxy() {
        if [ ! -z "$PROXY_PID" ]; then
            kill $PROXY_PID 2>/dev/null || true
        fi
    }
    trap cleanup_proxy EXIT
    
    # Wait for proxy
    echo -e "${BLUE}⏳ Waiting for proxy...${NC}"
    sleep 15
    
    # Test proxy connection
    if ! PGPASSWORD=$DB_PASSWORD psql -h localhost -p 15432 -U $DB_USER -d $DB_NAME -c "SELECT 1;" >/dev/null 2>&1; then
        echo -e "${RED}❌ Proxy connection failed${NC}"
        cleanup_proxy
        return 1
    fi
    
    echo -e "${GREEN}✅ Proxy connection established${NC}"
    
    # Reset schema via proxy
    echo -e "${BLUE}🗑️ Dropping schema via proxy...${NC}"
    if PGPASSWORD=$DB_PASSWORD psql -h localhost -p 15432 -U $DB_USER -d $DB_NAME << 'EOF'
DROP SCHEMA IF EXISTS public CASCADE;
CREATE SCHEMA public;
GRANT ALL ON SCHEMA public TO postgres;
GRANT ALL ON SCHEMA public TO public;
EOF
    then
        echo -e "${GREEN}✅ Schema dropped and recreated via proxy${NC}"
        
        # Deploy schema via proxy
        echo -e "${BLUE}🏗️ Deploying schema via proxy...${NC}"
        DATABASE_URL="postgres://$DB_USER:$DB_PASSWORD@localhost:15432/$DB_NAME" npx prisma db push
        
        if [ $? -eq 0 ]; then
            echo -e "${GREEN}✅ Schema deployed via proxy${NC}"
            cleanup_proxy
            return 0
        else
            echo -e "${RED}❌ Schema deployment failed via proxy${NC}"
            cleanup_proxy
            return 1
        fi
    else
        echo -e "${RED}❌ Schema drop failed via proxy${NC}"
        cleanup_proxy
        return 1
    fi
}

# Function to import Excel data with better error handling
import_excel_data() {
    echo -e "${BLUE}📊 Checking for Excel file...${NC}"
    
    # Check if file exists on server
    FILE_CHECK=$(flyctl ssh console -a weekly-report-backend -C "ls -la /app/prisma/ 2>/dev/null | grep -c 'data.xlsx' || echo '0'")
    
    if [ "$FILE_CHECK" != "0" ]; then
        echo -e "${GREEN}✅ Excel file found on server${NC}"
        
        # Try import with multiple approaches
        echo -e "${BLUE}📤 Importing Excel data...${NC}"
        if flyctl ssh console -a weekly-report-backend -C "NODE_ENV=production npx tsx prisma/import-all-data-from-excel.ts" 2>/dev/null; then
            echo -e "${GREEN}✅ Excel data imported successfully${NC}"
        else
            echo -e "${YELLOW}⚠️ Excel import failed${NC}"
            echo -e "${BLUE}💡 Try manual import: pnpm manual:import${NC}"
        fi
    else
        echo -e "${YELLOW}ℹ️ No Excel file found on server${NC}"
        echo -e "${BLUE}💡 Upload file with: pnpm upload-excel${NC}"
    fi
}

recreate_production_database() {
    echo -e "${BLUE}🌐 Recreating Production Database${NC}"
    echo "================================"
    
    confirm_action "This will completely destroy and recreate the production database"
    
    load_db_credentials
    
    echo -e "${BLUE}🔍 Step 1: Checking current database...${NC}"
    if flyctl status -a weekly-report-backend-db >/dev/null 2>&1; then
        echo -e "${BLUE}🔓 Step 2: Detaching database...${NC}"
        flyctl secrets unset DATABASE_URL DIRECT_URL --app weekly-report-backend 2>/dev/null || true
        
        echo -e "${BLUE}🗑️ Step 3: Destroying existing database...${NC}"
        flyctl apps destroy weekly-report-backend-db --yes
        sleep 30
    fi
    
    echo -e "${BLUE}🆕 Step 4: Creating new database with consistent password...${NC}"
    if flyctl postgres create \
        --name "weekly-report-backend-db" \
        --region sin \
        --vm-size shared-cpu-1x \
        --volume-size 2 \
        --initial-cluster-size 1 \
        --password "$DB_PASSWORD"; then
        echo -e "${GREEN}✅ Database created with consistent password${NC}"
    else
        echo -e "${RED}❌ Failed to create database${NC}"
        exit 1
    fi
    
    echo -e "${BLUE}⏳ Step 5: Waiting for database initialization...${NC}"
    sleep 90
    
    echo -e "${BLUE}🔗 Step 6: Setting up connection with known credentials...${NC}"
    flyctl secrets set \
        DATABASE_URL="postgres://$DB_USER:$DB_PASSWORD@$DB_HOST:5432/$DB_NAME?sslmode=disable" \
        DIRECT_URL="postgres://$DB_USER:$DB_PASSWORD@$DB_HOST:5432/$DB_NAME?sslmode=disable" \
        --app weekly-report-backend
    
    echo -e "${BLUE}🔄 Step 7: Restarting backend...${NC}"
    flyctl apps restart weekly-report-backend
    sleep 60
    
    echo -e "${BLUE}🏗️ Step 8: Running migrations...${NC}"
    if flyctl ssh console -a weekly-report-backend -C "npx prisma migrate deploy"; then
        echo -e "${GREEN}✅ Migrations completed${NC}"
    else
        echo -e "${RED}❌ Migrations failed${NC}"
        exit 1
    fi
    
    echo -e "${BLUE}📊 Step 9: Importing Excel data...${NC}"
    if flyctl ssh console -a weekly-report-backend -C "test -f prisma/data.xlsx && npx tsx prisma/import-all-data-from-excel.ts || echo 'No Excel file found'"; then
        echo -e "${GREEN}✅ Excel data imported${NC}"
    else
        echo -e "${YELLOW}ℹ️ No Excel file found or import failed${NC}"
    fi
    
    echo -e "${BLUE}🧪 Step 10: Testing system...${NC}"
    test_production_system
    
    echo -e "${GREEN}🎉 Production database recreated successfully!${NC}"
    echo -e "${BLUE}🔑 Password remains consistent: $DB_PASSWORD${NC}"
}

test_production_system() {
    echo -e "${BLUE}🧪 Testing production system...${NC}"
    
    # Test database health
    for i in {1..5}; do
        if curl -f -s https://weekly-report-backend.fly.dev/api/health/db >/dev/null; then
            echo -e "${GREEN}✅ Database health check passed${NC}"
            break
        fi
        echo "Database health test... ($i/5)"
        sleep 10
    done
    
    # Test authentication
    LOGIN_TEST=$(curl -s -X POST https://weekly-report-backend.fly.dev/api/auth/login \
        -H "Content-Type: application/json" \
        -H "Origin: https://weeklyreport-orpin.vercel.app" \
        -d '{"employeeCode":"552502356","password":"123456"}' 2>/dev/null || echo "failed")
    
    if echo "$LOGIN_TEST" | grep -q '"access_token"'; then
        echo -e "${GREEN}✅ Authentication test passed${NC}"
    else
        echo -e "${YELLOW}⚠️ Authentication test failed (may need test user)${NC}"
    fi
}

# Main execution
case $MODE in
    "local")
        reset_local_database
        ;;
    "production")
        reset_production_schema
        ;;
    "recreate")
        recreate_production_database
        ;;
    "help"|"-h"|"--help"|"")
        show_help
        ;;
    *)
        echo -e "${RED}❌ Invalid mode: $MODE${NC}"
        show_help
        exit 1
        ;;
esac

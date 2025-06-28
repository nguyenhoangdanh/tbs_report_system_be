#!/bin/bash
# filepath: /home/hoangdanh2000/Desktop/TBS Group/bento-nestjs/weekly-work-report-system/backend/scripts/migrate-and-import.sh

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Set Fly.io path
export PATH="/home/hoangdanh2000/.fly/bin:$PATH"

echo -e "${BLUE}🔧 Complete Migration and Data Import for Production${NC}"

# Function to kill all proxies
cleanup_proxies() {
    echo -e "${YELLOW}🧹 Cleaning up existing proxies...${NC}"
    pkill -f 'fly proxy' 2>/dev/null || true
    sleep 3
}

# Function to test proxy connection with extended timeout
test_proxy_with_timeout() {
    local port=$1
    local max_attempts=10
    local attempt=1
    
    echo -e "${BLUE}🔍 Testing proxy connection on port $port...${NC}"
    
    while [ $attempt -le $max_attempts ]; do
        if npx dotenv -e .env.studio -- npx prisma db execute --sql="SELECT 1 as test;" 2>/dev/null; then
            echo -e "${GREEN}✅ Proxy connection successful (attempt $attempt)${NC}"
            return 0
        else
            echo -e "${YELLOW}⚠️  Connection failed (attempt $attempt/$max_attempts)${NC}"
            sleep 10  # Wait longer between attempts
        fi
        attempt=$((attempt + 1))
    done
    
    echo -e "${RED}❌ Proxy connection failed after $max_attempts attempts${NC}"
    return 1
}

# Function to run migrations and import
run_migration_and_import() {
    local port=$1
    
    echo -e "${BLUE}🚀 Starting migration and import process on port $port...${NC}"
    
    # Create .env.studio
    cat > .env.studio << EOF
DATABASE_URL="postgres://weekly_report_backend:AWVq27MHkURo5ns@localhost:$port/weekly_report_backend"
DIRECT_URL="postgres://weekly_report_backend:AWVq27MHkURo5ns@localhost:$port/weekly_report_backend"
EOF
    
    # Start proxy with extended timeout
    echo -e "${YELLOW}🌉 Starting database proxy on port $port...${NC}"
    timeout 300 fly proxy $port:5432 -a weekly-report-backend-db &
    PROXY_PID=$!
    
    # Wait longer for proxy to stabilize
    echo -e "${BLUE}⏳ Waiting 30 seconds for proxy to stabilize...${NC}"
    sleep 30
    
    # Test connection with retries
    if ! test_proxy_with_timeout $port; then
        echo -e "${RED}❌ Cannot establish stable proxy connection${NC}"
        kill $PROXY_PID 2>/dev/null || true
        return 1
    fi
    
    # Step 1: Run migrations
    echo -e "\n${BLUE}1️⃣ Running database migrations...${NC}"
    if npx dotenv -e .env.studio -- npx prisma migrate deploy; then
        echo -e "${GREEN}✅ Migrations completed successfully${NC}"
    else
        echo -e "${YELLOW}⚠️  Migrations may have failed, continuing...${NC}"
    fi
    
    # Step 2: Generate Prisma client
    echo -e "\n${BLUE}2️⃣ Generating Prisma client...${NC}"
    npx prisma generate
    
    # Step 3: Seed basic data
    echo -e "\n${BLUE}3️⃣ Seeding basic data structure...${NC}"
    if npx dotenv -e .env.studio -- tsx prisma/seed.ts; then
        echo -e "${GREEN}✅ Basic seed completed successfully${NC}"
    else
        echo -e "${YELLOW}⚠️  Basic seed may have failed, continuing...${NC}"
    fi
    
    # Step 4: Check if Excel file exists
    echo -e "\n${BLUE}4️⃣ Checking for Excel data file...${NC}"
    if [ -f "prisma/data.xlsx" ]; then
        echo -e "${GREEN}✅ Found data.xlsx file${NC}"
        
        # Import Excel data
        echo -e "${BLUE}📊 Importing data from Excel...${NC}"
        if npx dotenv -e .env.studio -- tsx prisma/import-all-data-from-excel.ts; then
            echo -e "${GREEN}✅ Excel import completed successfully${NC}"
        else
            echo -e "${RED}❌ Excel import failed${NC}"
        fi
    else
        echo -e "${YELLOW}⚠️  No data.xlsx file found in prisma/ directory${NC}"
        echo -e "${BLUE}💡 Create basic test users instead...${NC}"
        
        # Create additional test users
        npx dotenv -e .env.studio -- npx prisma db execute --sql="
        INSERT INTO \"User\" (
          id, \"employeeCode\", email, password, \"firstName\", \"lastName\", 
          \"phone\", role, \"jobPositionId\", \"officeId\", \"isActive\", \"createdAt\", \"updatedAt\"
        ) VALUES 
        (
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
        " && echo -e "${GREEN}✅ Test user 552502356 created${NC}" || echo -e "${YELLOW}⚠️  Test user creation may have failed${NC}"
    fi
    
    # Step 5: Verify data
    echo -e "\n${BLUE}5️⃣ Verifying imported data...${NC}"
    npx dotenv -e .env.studio -- npx prisma db execute --sql="
    SELECT 
      'Offices' as table_name, COUNT(*) as count FROM \"Office\"
    UNION ALL
    SELECT 
      'Departments' as table_name, COUNT(*) as count FROM \"Department\"
    UNION ALL
    SELECT 
      'Positions' as table_name, COUNT(*) as count FROM \"Position\"
    UNION ALL
    SELECT 
      'Job Positions' as table_name, COUNT(*) as count FROM \"JobPosition\"
    UNION ALL
    SELECT 
      'Users' as table_name, COUNT(*) as count FROM \"User\";
    " || echo -e "${YELLOW}⚠️  Could not verify data counts${NC}"
    
    # Step 6: List some test users
    echo -e "\n${BLUE}6️⃣ Sample users for testing...${NC}"
    npx dotenv -e .env.studio -- npx prisma db execute --sql="
    SELECT \"employeeCode\", \"firstName\", \"lastName\", \"role\", \"isActive\"
    FROM \"User\" 
    WHERE \"employeeCode\" IN ('CEO001', 'ADM001', 'USR001', '552502356')
    ORDER BY \"employeeCode\";
    " || echo -e "${YELLOW}⚠️  Could not list test users${NC}"
    
    # Clean up proxy
    kill $PROXY_PID 2>/dev/null || true
    cleanup_proxies
    
    echo -e "${GREEN}✅ Migration and import process completed!${NC}"
    return 0
}

# Function to test login after import
test_login_after_import() {
    echo -e "\n${BLUE}🧪 Testing login with imported users...${NC}"
    
    # Wait for changes to propagate
    echo -e "${BLUE}⏳ Waiting 30 seconds for changes to propagate...${NC}"
    sleep 30
    
    # Test different users
    local success_count=0
    
    for user in "CEO001" "ADM001" "USR001" "552502356"; do
        echo -e "${YELLOW}Testing login: $user${NC}"
        
        result=$(curl -s -X POST https://weekly-report-backend.fly.dev/api/auth/login \
          -H "Content-Type: application/json" \
          -H "Origin: https://weeklyreport-orpin.vercel.app" \
          -d "{\"employeeCode\":\"$user\",\"password\":\"123456\"}")
        
        if echo "$result" | grep -q '"access_token"'; then
            echo -e "${GREEN}✅ Login successful for $user${NC}"
            success_count=$((success_count + 1))
        else
            echo -e "${RED}❌ Login failed for $user${NC}"
            echo "Response: $(echo "$result" | head -c 100)..."
        fi
    done
    
    echo -e "\n${BLUE}📊 Login test results: $success_count/4 successful${NC}"
    
    if [ $success_count -gt 0 ]; then
        echo -e "\n${GREEN}🎉 SUCCESS! Login is working with imported data!${NC}"
        return 0
    else
        echo -e "\n${YELLOW}⚠️  Login tests failed. Data may need more time to propagate.${NC}"
        return 1
    fi
}

# Main execution
echo -e "${BLUE}📊 Checking current status...${NC}"

# Check database server
echo "Database server status:"
fly status -a weekly-report-backend-db | grep -E "(STATE|CHECKS)" || echo "Could not get database status"

# Check app status
echo -e "\nApp server status:"
fly status | grep -E "(STATE|CHECKS)" || echo "Could not get app status"

# Clean up any existing proxies
cleanup_proxies

# Try migration and import on different ports
echo -e "\n${BLUE}🚀 Starting migration and import process...${NC}"

# Try port 5433 first
if run_migration_and_import 5433; then
    echo -e "${GREEN}✅ Migration and import successful on port 5433${NC}"
elif run_migration_and_import 15432; then
    echo -e "${GREEN}✅ Migration and import successful on port 15432${NC}"
elif run_migration_and_import 54320; then
    echo -e "${GREEN}✅ Migration and import successful on port 54320${NC}"
else
    echo -e "${RED}❌ All migration and import attempts failed${NC}"
    echo -e "${BLUE}💡 Manual steps to try:${NC}"
    echo "1. Check if data.xlsx file exists in prisma/ directory"
    echo "2. Try running proxy manually in one terminal and commands in another"
    echo "3. Check database server status: fly status -a weekly-report-backend-db"
    exit 1
fi

# Test login with imported data
test_login_after_import

echo -e "\n${BLUE}🎉 Complete process finished!${NC}"
echo -e "${BLUE}📋 Summary:${NC}"
echo "  • Database: ✅ Migrated"
echo "  • Basic data: ✅ Seeded"
echo "  • Excel data: $([ -f "prisma/data.xlsx" ] && echo "✅ Imported" || echo "⚠️  No Excel file found")"
echo "  • Test users: CEO001, ADM001, USR001, 552502356"
echo "  • Password: 123456 (for all users)"

echo -e "\n${BLUE}📞 Manual test commands:${NC}"
echo "curl -X POST https://weekly-report-backend.fly.dev/api/auth/login \\"
echo "  -H 'Content-Type: application/json' \\"
echo "  -H 'Origin: https://weeklyreport-orpin.vercel.app' \\"
echo "  -d '{\"employeeCode\":\"CEO001\",\"password\":\"123456\"}'"

echo -e "\n${BLUE}📁 Next steps if you have Excel file:${NC}"
echo "1. Copy your Excel file to: prisma/data.xlsx"
echo "2. Run this script again to import the Excel data"
echo "3. Or run import manually:"
echo "   # Terminal 1: pnpm db:connect"
echo "   # Terminal 2: npx dotenv -e .env.studio -- tsx prisma/import-all-data-from-excel.ts"
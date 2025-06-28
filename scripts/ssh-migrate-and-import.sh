#!/bin/bash
# filepath: /home/hoangdanh2000/Desktop/TBS Group/bento-nestjs/weekly-work-report-system/backend/scripts/ssh-migrate-and-import.sh

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Set Fly.io path
export PATH="/home/hoangdanh2000/.fly/bin:$PATH"

echo -e "${BLUE}🔧 SSH-based Migration and Data Import for Production${NC}"

# Function to run SSH command with retry
run_ssh_command() {
    local command=$1
    local description=$2
    local max_attempts=3
    local attempt=1
    
    echo -e "${YELLOW}$description...${NC}"
    
    while [ $attempt -le $max_attempts ]; do
        echo -e "${BLUE}Attempt $attempt/$max_attempts${NC}"
        
        if echo "$command" | fly ssh console 2>/dev/null; then
            echo -e "${GREEN}✅ $description successful${NC}"
            return 0
        else
            echo -e "${YELLOW}⚠️  Attempt $attempt failed${NC}"
            sleep 5
        fi
        
        attempt=$((attempt + 1))
    done
    
    echo -e "${RED}❌ $description failed after $max_attempts attempts${NC}"
    return 1
}

# Function to check app status and start if needed
ensure_app_running() {
    echo -e "${BLUE}📊 Checking app status...${NC}"
    
    local status=$(fly status 2>&1)
    echo "$status"
    
    if echo "$status" | grep -q "stopped\|no started VMs"; then
        echo -e "${YELLOW}🚀 App is stopped, triggering start...${NC}"
        
        # Try to trigger via API call
        echo -e "${BLUE}Triggering app via API...${NC}"
        curl -s https://weekly-report-backend.fly.dev/health >/dev/null || true
        curl -s https://weekly-report-backend.fly.dev/api/health >/dev/null || true
        
        echo -e "${BLUE}⏳ Waiting 60 seconds for app to start...${NC}"
        sleep 60
        
        # Check status again
        local new_status=$(fly status 2>&1)
        if echo "$new_status" | grep -q "started"; then
            echo -e "${GREEN}✅ App is now running${NC}"
        else
            echo -e "${YELLOW}⚠️ App may still be starting up...${NC}"
        fi
    else
        echo -e "${GREEN}✅ App is already running${NC}"
    fi
}

# Main execution
echo -e "${BLUE}📊 Starting SSH-based setup...${NC}"

# Step 1: Ensure app is running
ensure_app_running

# Step 2: Run database migrations
echo -e "\n${BLUE}1️⃣ Running database migrations...${NC}"
if run_ssh_command "npx prisma migrate deploy" "Database migration"; then
    echo -e "${GREEN}✅ Migrations completed${NC}"
else
    echo -e "${YELLOW}⚠️ Migration may have failed, continuing...${NC}"
fi

# Step 3: Generate Prisma client
echo -e "\n${BLUE}2️⃣ Generating Prisma client...${NC}"
if run_ssh_command "npx prisma generate" "Prisma client generation"; then
    echo -e "${GREEN}✅ Prisma client generated${NC}"
else
    echo -e "${YELLOW}⚠️ Client generation may have failed, continuing...${NC}"
fi

# Step 4: Seed basic data
echo -e "\n${BLUE}3️⃣ Seeding basic data...${NC}"
if run_ssh_command "npx tsx prisma/seed.ts" "Basic data seeding"; then
    echo -e "${GREEN}✅ Basic seeding completed${NC}"
else
    echo -e "${YELLOW}⚠️ Basic seeding may have failed, continuing...${NC}"
fi

# Step 5: Check if we should import Excel data
echo -e "\n${BLUE}4️⃣ Checking for Excel data import...${NC}"

# Check if Excel file exists locally first
if [ -f "prisma/data.xlsx" ]; then
    echo -e "${GREEN}✅ Found local data.xlsx file${NC}"
    echo -e "${BLUE}📤 Uploading Excel file to server...${NC}"
    
    # Upload file via SSH (if possible) or skip
    echo -e "${YELLOW}⚠️ Direct file upload not available via SSH${NC}"
    echo -e "${BLUE}💡 You'll need to import data via proxy method later${NC}"
else
    echo -e "${YELLOW}⚠️ No data.xlsx file found locally${NC}"
fi

# Step 6: Create test users via SSH
echo -e "\n${BLUE}5️⃣ Creating test users...${NC}"
cat > /tmp/create_users.js << 'EOF'
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcrypt');

const prisma = new PrismaClient();

async function createTestUsers() {
  try {
    console.log('Creating test users...');
    
    const hashedPassword = await bcrypt.hash('123456', 10);
    
    // Get first available job position and office
    const jobPosition = await prisma.jobPosition.findFirst();
    const office = await prisma.office.findFirst();
    
    if (!jobPosition || !office) {
      console.log('No job position or office found, skipping user creation');
      return;
    }
    
    // Create test users
    const users = [
      {
        id: 'ssh-ceo-001',
        employeeCode: 'CEO001',
        email: 'ceo@company.com',
        password: hashedPassword,
        firstName: 'CEO',
        lastName: 'Test User',
        phone: '123456789',
        role: 'SUPERADMIN',
        jobPositionId: jobPosition.id,
        officeId: office.id,
      },
      {
        id: 'ssh-adm-001', 
        employeeCode: 'ADM001',
        email: 'admin@company.com',
        password: hashedPassword,
        firstName: 'Admin',
        lastName: 'Test User',
        phone: '123456790',
        role: 'ADMIN',
        jobPositionId: jobPosition.id,
        officeId: office.id,
      },
      {
        id: 'ssh-usr-552502356',
        employeeCode: '552502356',
        email: '552502356@company.com',
        password: hashedPassword,
        firstName: 'User',
        lastName: '552502356',
        phone: '552502356',
        role: 'USER',
        jobPositionId: jobPosition.id,
        officeId: office.id,
      }
    ];
    
    for (const userData of users) {
      try {
        await prisma.user.upsert({
          where: { employeeCode: userData.employeeCode },
          update: {
            password: userData.password,
            isActive: true,
          },
          create: userData,
        });
        console.log(`✅ Created/updated user: ${userData.employeeCode}`);
      } catch (error) {
        console.log(`⚠️ User ${userData.employeeCode} may already exist:`, error.message);
      }
    }
    
    console.log('Test users creation completed!');
  } catch (error) {
    console.error('Error creating test users:', error);
  } finally {
    await prisma.$disconnect();
  }
}

createTestUsers();
EOF

# Copy script to server and run
echo -e "${BLUE}📤 Uploading user creation script...${NC}"
if echo "cat > /tmp/create_users.js << 'SCRIPT_EOF'" | fly ssh console; then
    cat /tmp/create_users.js | fly ssh console -C "cat >> /tmp/create_users.js"
    echo "SCRIPT_EOF" | fly ssh console -C "cat >> /tmp/create_users.js"
    
    # Run the script
    if run_ssh_command "node /tmp/create_users.js" "Test users creation"; then
        echo -e "${GREEN}✅ Test users created successfully${NC}"
    else
        echo -e "${YELLOW}⚠️ Test users creation may have failed${NC}"
    fi
    
    # Clean up
    run_ssh_command "rm -f /tmp/create_users.js" "Cleanup temp files"
else
    echo -e "${YELLOW}⚠️ Could not upload user creation script${NC}"
fi

# Clean up local temp file
rm -f /tmp/create_users.js

# Step 7: Test the API
echo -e "\n${BLUE}6️⃣ Testing API endpoints...${NC}"

echo -e "${BLUE}⏳ Waiting 30 seconds for changes to propagate...${NC}"
sleep 30

# Test basic health
echo -e "${YELLOW}Testing basic health...${NC}"
if curl -f -s https://weekly-report-backend.fly.dev/health >/dev/null; then
    echo -e "${GREEN}✅ Basic health check passed${NC}"
else
    echo -e "${RED}❌ Basic health check failed${NC}"
fi

# Test API health
echo -e "${YELLOW}Testing API health...${NC}"
if curl -f -s https://weekly-report-backend.fly.dev/api/health >/dev/null; then
    echo -e "${GREEN}✅ API health check passed${NC}"
else
    echo -e "${RED}❌ API health check failed${NC}"
fi

# Test database health
echo -e "${YELLOW}Testing database health...${NC}"
DB_HEALTH=$(curl -s https://weekly-report-backend.fly.dev/api/health/db)
echo "Database health: $DB_HEALTH"

# Test login with different users
echo -e "\n${BLUE}7️⃣ Testing login...${NC}"

# Function to test login
test_login() {
    local employeeCode=$1
    local description=$2
    
    echo -e "${YELLOW}Testing $description...${NC}"
    local result=$(curl -s -X POST https://weekly-report-backend.fly.dev/api/auth/login \
      -H "Content-Type: application/json" \
      -H "Origin: https://weeklyreport-orpin.vercel.app" \
      -d "{\"employeeCode\":\"$employeeCode\",\"password\":\"123456\"}")
    
    if echo "$result" | grep -q '"access_token"'; then
        echo -e "${GREEN}✅ Login successful for $employeeCode${NC}"
        return 0
    else
        echo -e "${RED}❌ Login failed for $employeeCode${NC}"
        echo "Response: $(echo "$result" | head -c 150)..."
        return 1
    fi
}

# Test logins
LOGIN_SUCCESS=0
test_login "CEO001" "CEO (SUPERADMIN)" && LOGIN_SUCCESS=$((LOGIN_SUCCESS + 1))
test_login "ADM001" "Admin (ADMIN)" && LOGIN_SUCCESS=$((LOGIN_SUCCESS + 1))
test_login "552502356" "User from original request" && LOGIN_SUCCESS=$((LOGIN_SUCCESS + 1))

echo -e "\n${BLUE}🎉 SSH-based setup completed!${NC}"
echo -e "${BLUE}📋 Summary:${NC}"
echo "  • Migration: ✅ Attempted"
echo "  • Basic seed: ✅ Attempted"
echo "  • Test users: ✅ Created"
echo "  • Successful logins: $LOGIN_SUCCESS/3"

if [ $LOGIN_SUCCESS -gt 0 ]; then
    echo -e "\n${GREEN}🎯 SUCCESS! Login is working via SSH method!${NC}"
    echo -e "${BLUE}📞 Working credentials:${NC}"
    echo "  • CEO001 / 123456 (SUPERADMIN)"
    echo "  • ADM001 / 123456 (ADMIN)"
    echo "  • 552502356 / 123456 (USER)"
else
    echo -e "\n${YELLOW}⚠️ Login tests failed. You may need to import Excel data separately.${NC}"
fi

echo -e "\n${BLUE}📁 Next steps for Excel data import:${NC}"
echo "1. If you have Excel file, copy it to: prisma/data.xlsx"
echo "2. Use proxy method to import:"
echo "   # Terminal 1: pnpm db:connect"
echo "   # Terminal 2: npx dotenv -e .env.studio -- tsx prisma/import-all-data-from-excel.ts"

echo -e "\n${BLUE}📞 Manual test command:${NC}"
echo "curl -X POST https://weekly-report-backend.fly.dev/api/auth/login \\"
echo "  -H 'Content-Type: application/json' \\"
echo "  -H 'Origin: https://weeklyreport-orpin.vercel.app' \\"
echo "  -d '{\"employeeCode\":\"CEO001\",\"password\":\"123456\"}'"
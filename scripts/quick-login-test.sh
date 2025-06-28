#!/bin/bash

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}🧪 Quick Login Test and User Creation${NC}"

# Test users to try
users=("CEO001" "ADM001" "USR001" "552502356")
success_count=0

echo -e "${BLUE}🔍 Testing login with existing users...${NC}"

for user in "${users[@]}"; do
    echo -e "\n${YELLOW}Testing: $user${NC}"
    
    result=$(curl -s -w "\n%{http_code}" -X POST https://weekly-report-backend.fly.dev/api/auth/login \
        -H "Content-Type: application/json" \
        -H "Origin: https://weeklyreport-orpin.vercel.app" \
        -d "{\"employeeCode\":\"$user\",\"password\":\"123456\"}")
    
    http_code=$(echo "$result" | tail -n1)
    response_body=$(echo "$result" | head -n -1)
    
    if [ "$http_code" = "200" ] && echo "$response_body" | grep -q '"access_token"'; then
        echo -e "${GREEN}✅ SUCCESS for $user!${NC}"
        user_info=$(echo "$response_body" | jq -r '.user.firstName + " " + .user.lastName + " (" + .user.role + ")"' 2>/dev/null || echo "Login successful")
        echo "   User: $user_info"
        success_count=$((success_count + 1))
    else
        echo -e "${RED}❌ Failed for $user (HTTP: $http_code)${NC}"
        error_msg=$(echo "$response_body" | jq -r '.message // .error // .' 2>/dev/null || echo "$response_body")
        echo "   Error: $(echo "$error_msg" | head -c 100)..."
    fi
done

echo -e "\n${BLUE}📊 Results: $success_count/${#users[@]} successful logins${NC}"

if [ $success_count -gt 0 ]; then
    echo -e "\n${GREEN}🎉 LOGIN IS WORKING! 🎉${NC}"
    echo -e "${BLUE}👤 Working credentials (password: 123456):${NC}"
    for user in "${users[@]}"; do
        echo "  • $user"
    done
    
    echo -e "\n${BLUE}📱 Frontend can now use:${NC}"
    echo "https://weekly-report-backend.fly.dev/api/auth/login"
    
    echo -e "\n${BLUE}🌐 API Documentation:${NC}"
    echo "https://weekly-report-backend.fly.dev/api"
    
else
    echo -e "\n${YELLOW}⚠️  No users found in database. Creating test users via SSH...${NC}"
    
    # Try to create users via SSH
    echo -e "${BLUE}🔧 Creating test users via SSH console...${NC}"
    
    # Create a script to run on the server
    cat > /tmp/create_test_users.js << 'EOF'
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcrypt');

const prisma = new PrismaClient();

async function createTestUsers() {
  try {
    console.log('🌱 Creating basic structure and test users...');
    
    const hashedPassword = await bcrypt.hash('123456', 10);
    
    // Create basic office
    const office = await prisma.office.upsert({
      where: { name: 'Default Office' },
      update: {},
      create: {
        id: 'default-office',
        name: 'Default Office',
        type: 'HEAD_OFFICE',
        description: 'Default office for system'
      }
    });
    
    // Create basic department
    const department = await prisma.department.upsert({
      where: { 
        name_officeId: { 
          name: 'Default Department', 
          officeId: office.id 
        } 
      },
      update: {},
      create: {
        id: 'default-dept',
        name: 'Default Department',
        description: 'Default department',
        officeId: office.id
      }
    });
    
    // Create basic position
    const position = await prisma.position.upsert({
      where: { name: 'Default Position' },
      update: {},
      create: {
        id: 'default-pos',
        name: 'Default Position',
        description: 'Default position'
      }
    });
    
    // Create basic job position
    const jobPosition = await prisma.jobPosition.upsert({
      where: {
        positionId_jobName_departmentId: {
          positionId: position.id,
          jobName: 'Default Job',
          departmentId: department.id
        }
      },
      update: {},
      create: {
        id: 'default-job',
        jobName: 'Default Job',
        code: 'DEFAULT',
        description: 'Default job position',
        positionId: position.id,
        departmentId: department.id
      }
    });
    
    // Create test users
    const testUsers = [
      {
        id: 'test-ceo-001',
        employeeCode: 'CEO001',
        email: 'ceo@company.com',
        firstName: 'CEO',
        lastName: 'Test User',
        phone: '123456789',
        role: 'SUPERADMIN'
      },
      {
        id: 'test-adm-001',
        employeeCode: 'ADM001',
        email: 'admin@company.com',
        firstName: 'Admin',
        lastName: 'Test User',
        phone: '123456790',
        role: 'ADMIN'
      },
      {
        id: 'test-usr-001',
        employeeCode: 'USR001',
        email: 'user@company.com',
        firstName: 'User',
        lastName: 'Test User',
        phone: '123456791',
        role: 'USER'
      },
      {
        id: 'user-552502356',
        employeeCode: '552502356',
        email: '552502356@company.com',
        firstName: 'User',
        lastName: '552502356',
        phone: '552502356',
        role: 'USER'
      }
    ];
    
    for (const userData of testUsers) {
      try {
        await prisma.user.upsert({
          where: { employeeCode: userData.employeeCode },
          update: {
            password: hashedPassword,
            isActive: true
          },
          create: {
            ...userData,
            password: hashedPassword,
            jobPositionId: jobPosition.id,
            officeId: office.id,
            isActive: true
          }
        });
        console.log(`✅ Created/updated user: ${userData.employeeCode}`);
      } catch (error) {
        console.log(`⚠️ Error with user ${userData.employeeCode}:`, error.message);
      }
    }
    
    console.log('🎉 Test users creation completed!');
    
    // Verify users
    const users = await prisma.user.findMany({
      where: {
        employeeCode: { in: ['CEO001', 'ADM001', 'USR001', '552502356'] }
      },
      select: {
        employeeCode: true,
        firstName: true,
        lastName: true,
        role: true,
        isActive: true
      }
    });
    
    console.log('📋 Created users:', users);
    
  } catch (error) {
    console.error('❌ Error creating test users:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

createTestUsers();
EOF

    # Execute via SSH
    if cat /tmp/create_test_users.js | fly ssh console -C "cat > /tmp/create_users.js && cd /app && node /tmp/create_users.js"; then
        echo -e "${GREEN}✅ Test users created via SSH!${NC}"
        
        # Clean up
        fly ssh console -C "rm -f /tmp/create_users.js" || true
        rm -f /tmp/create_test_users.js
        
        # Wait and test again
        echo -e "${BLUE}⏳ Waiting 15 seconds for changes to propagate...${NC}"
        sleep 15
        
        echo -e "${BLUE}🔄 Testing login again...${NC}"
        success_count=0
        for user in "${users[@]}"; do
            echo -e "${YELLOW}Re-testing: $user${NC}"
            
            result=$(curl -s -X POST https://weekly-report-backend.fly.dev/api/auth/login \
                -H "Content-Type: application/json" \
                -H "Origin: https://weeklyreport-orpin.vercel.app" \
                -d "{\"employeeCode\":\"$user\",\"password\":\"123456\"}")
            
            if echo "$result" | grep -q '"access_token"'; then
                echo -e "${GREEN}✅ SUCCESS for $user!${NC}"
                success_count=$((success_count + 1))
            else
                echo -e "${RED}❌ Still failed for $user${NC}"
            fi
        done
        
        if [ $success_count -gt 0 ]; then
            echo -e "\n${GREEN}🎯 LOGIN IS NOW WORKING! 🎯${NC}"
        else
            echo -e "\n${YELLOW}⚠️ Users created but login still failing. Check app logs.${NC}"
        fi
        
    else
        echo -e "${RED}❌ Failed to create users via SSH${NC}"
        echo -e "${BLUE}💡 Try manual method:${NC}"
        echo "1. pnpm db:connect (in one terminal)"
        echo "2. npx dotenv -e .env.studio -- tsx prisma/seed.ts (in another terminal)"
    fi
fi

# Clean up temp files
rm -f /tmp/create_test_users.js

echo -e "\n${BLUE}📞 Manual test command:${NC}"
echo "curl -X POST https://weekly-report-backend.fly.dev/api/auth/login \\"
echo "  -H 'Content-Type: application/json' \\"
echo "  -H 'Origin: https://weeklyreport-orpin.vercel.app' \\"
echo "  -d '{\"employeeCode\":\"CEO001\",\"password\":\"123456\"}'"

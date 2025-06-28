#!/bin/bash
# filepath: /home/hoangdanh2000/Desktop/TBS Group/bento-nestjs/weekly-work-report-system/backend/scripts/fix-user-passwords.sh

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}🔧 Fixing user passwords in database...${NC}"

# Check if .env.studio exists
if [ ! -f ".env.studio" ]; then
    echo -e "${RED}❌ .env.studio file not found${NC}"
    echo -e "${BLUE}💡 Run: pnpm db:connect first${NC}"
    exit 1
fi

# Check database connection
if ! npx dotenv -e .env.studio -- npx prisma db execute --sql="SELECT 1;" 2>/dev/null; then
    echo -e "${RED}❌ Database proxy not running${NC}"
    echo -e "${BLUE}💡 Start proxy in another terminal: pnpm db:connect${NC}"
    exit 1
fi

echo -e "${GREEN}✅ Database connection verified${NC}"

# Create password fix script
cat > /tmp/fix_passwords.sql << 'EOF'
-- Update all users to have password '123456' (hashed)
UPDATE "User" 
SET password = '$2b$10$lkHr/WXu2WDJzuiLhASTBOvFg6RrJt1cOkQ5Y9WzC5kKS7gE8x7/e'
WHERE "isActive" = true;

-- Ensure test users exist with correct data
INSERT INTO "User" (
  id, "employeeCode", email, password, "firstName", "lastName", 
  "phone", role, "jobPositionId", "officeId", "isActive", "createdAt", "updatedAt"
) VALUES 
(
  'test-ceo-001', 'CEO001', 'ceo@company.com', 
  '$2b$10$lkHr/WXu2WDJzuiLhASTBOvFg6RrJt1cOkQ5Y9WzC5kKS7gE8x7/e',
  'CEO', 'Test User', '123456789', 'SUPERADMIN',
  (SELECT id FROM "JobPosition" LIMIT 1),
  (SELECT id FROM "Office" LIMIT 1),
  true, NOW(), NOW()
),
(
  'test-adm-001', 'ADM001', 'admin@company.com', 
  '$2b$10$lkHr/WXu2WDJzuiLhASTBOvFg6RrJt1cOkQ5Y9WzC5kKS7gE8x7/e',
  'Admin', 'Test User', '123456790', 'ADMIN',
  (SELECT id FROM "JobPosition" LIMIT 1),
  (SELECT id FROM "Office" LIMIT 1),
  true, NOW(), NOW()
),
(
  'test-usr-001', 'USR001', 'user@company.com', 
  '$2b$10$lkHr/WXu2WDJzuiLhASTBOvFg6RrJt1cOkQ5Y9WzC5kKS7gE8x7/e',
  'User', 'Test User', '123456791', 'USER',
  (SELECT id FROM "JobPosition" LIMIT 1),
  (SELECT id FROM "Office" LIMIT 1),
  true, NOW(), NOW()
)
ON CONFLICT ("employeeCode") DO UPDATE SET
  password = EXCLUDED.password,
  "isActive" = true,
  "updatedAt" = NOW();
EOF

echo -e "${BLUE}🔄 Updating user passwords...${NC}"

# Execute the password fix
npx dotenv -e .env.studio -- npx prisma db execute --file=/tmp/fix_passwords.sql

echo -e "${GREEN}✅ Password update completed${NC}"

# Clean up
rm -f /tmp/fix_passwords.sql

# Verify the changes
echo -e "${BLUE}🔍 Verifying test users...${NC}"
npx dotenv -e .env.studio -- npx prisma db execute --sql="
SELECT \"employeeCode\", \"firstName\", \"lastName\", \"role\", \"isActive\"
FROM \"User\" 
WHERE \"employeeCode\" IN ('CEO001', 'ADM001', 'USR001')
ORDER BY \"employeeCode\";
"

echo -e "\n${GREEN}🎉 Password fix completed!${NC}"
echo -e "${BLUE}👤 Test users with password '123456':${NC}"
echo "  • CEO001 (SUPERADMIN)"
echo "  • ADM001 (ADMIN)"
echo "  • USR001 (USER)"
echo "  • All other users also have password '123456'"

echo -e "\n${BLUE}🧪 Test login now:${NC}"
echo "  ./scripts/test-login.sh"
#!/bin/bash
set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

export PATH="/home/hoangdanh2000/.fly/bin:$PATH"

echo -e "${BLUE}💀 FORCE DELETE ALL DATA${NC}"
echo "========================="

echo -e "${RED}⚠️ DANGER: This will delete ALL data without recovery${NC}"
read -p "Type 'FORCE DELETE' to continue: " -r
echo ""

if [[ $REPLY != "FORCE DELETE" ]]; then
    exit 0
fi

echo -e "${BLUE}🔄 Executing multiple deletion methods...${NC}"

# Method 1: Raw SQL deletion
echo -e "${BLUE}📡 Method 1: Raw SQL deletion...${NC}"
flyctl ssh console -a weekly-report-backend -C "
cat << 'SQL_EOF' | psql \$DATABASE_URL
-- Force delete all data
SET session_replication_role = replica;

-- Delete in correct order (reverse of dependencies)
DELETE FROM report_tasks;
DELETE FROM reports;
DELETE FROM users;
DELETE FROM job_positions;
DELETE FROM departments;
DELETE FROM offices;
DELETE FROM positions;

-- Reset sequences
SELECT setval(pg_get_serial_sequence(table_name, column_name), 1, false)
FROM (
    SELECT table_name, column_name
    FROM information_schema.columns
    WHERE column_default LIKE 'nextval%'
) t;

-- Reset session
SET session_replication_role = DEFAULT;

-- Verify deletion
SELECT 
    schemaname,
    tablename, 
    n_live_tup as row_count
FROM pg_stat_user_tables 
WHERE schemaname = 'public'
ORDER BY n_live_tup DESC;
SQL_EOF
" || echo "Method 1 failed"

# Method 2: Prisma delete all
echo -e "${BLUE}📡 Method 2: Prisma delete all...${NC}"
flyctl ssh console -a weekly-report-backend -C "
node -e \"
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function deleteAll() {
  try {
    console.log('🗑️ Deleting all data via Prisma...');
    
    // Delete in dependency order
    await prisma.reportTask.deleteMany();
    await prisma.report.deleteMany();
    await prisma.user.deleteMany();
    await prisma.jobPosition.deleteMany();
    await prisma.department.deleteMany();
    await prisma.office.deleteMany();
    await prisma.position.deleteMany();
    
    console.log('✅ All data deleted');
    
    // Verify
    const counts = {
      users: await prisma.user.count(),
      offices: await prisma.office.count(),
      departments: await prisma.department.count(),
      positions: await prisma.position.count(),
      jobPositions: await prisma.jobPosition.count(),
      reports: await prisma.report.count(),
      tasks: await prisma.reportTask.count()
    };
    
    console.log('📊 Remaining records:', counts);
  } catch (error) {
    console.error('❌ Prisma deletion failed:', error.message);
  } finally {
    await prisma.\$disconnect();
  }
}

deleteAll();
\"
" || echo "Method 2 failed"

# Method 3: Truncate with restart identity
echo -e "${BLUE}📡 Method 3: Truncate with restart...${NC}"
flyctl ssh console -a weekly-report-backend -C "
cat << 'TRUNCATE_EOF' | psql \$DATABASE_URL
-- Disable triggers and constraints
SET session_replication_role = replica;

-- Truncate all tables with restart identity
TRUNCATE TABLE report_tasks RESTART IDENTITY CASCADE;
TRUNCATE TABLE reports RESTART IDENTITY CASCADE;
TRUNCATE TABLE users RESTART IDENTITY CASCADE;
TRUNCATE TABLE job_positions RESTART IDENTITY CASCADE;
TRUNCATE TABLE departments RESTART IDENTITY CASCADE;
TRUNCATE TABLE offices RESTART IDENTITY CASCADE;
TRUNCATE TABLE positions RESTART IDENTITY CASCADE;

-- Re-enable
SET session_replication_role = DEFAULT;

-- Final verification
SELECT 'After truncate:' as status;
SELECT 
    tablename, 
    n_live_tup as rows 
FROM pg_stat_user_tables 
WHERE schemaname = 'public' AND n_live_tup > 0;
TRUNCATE_EOF
" || echo "Method 3 failed"

# Verify deletion
echo -e "${BLUE}🔍 Verifying deletion...${NC}"
sleep 10

# Check via API
echo -e "${BLUE}📊 Checking via health endpoint...${NC}"
curl -s https://weekly-report-backend.fly.dev/api/health/db | grep -o '"totalUsers":[0-9]*' || echo "API check failed"

echo -e "${GREEN}💀 Force deletion completed!${NC}"
echo -e "${BLUE}💡 Data should now be completely deleted${NC}"
echo -e "${BLUE}💡 Import fresh data: pnpm manual:import${NC}"

#!/bin/bash
set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

export PATH="/home/hoangdanh2000/.fly/bin:$PATH"

echo -e "${BLUE}🔍 Testing Import Environment Detection${NC}"
echo "====================================="

echo -e "${BLUE}🏠 Local environment test:${NC}"
echo "NODE_ENV=development dotenv -e .env.local -- node -e \"
console.log('Environment:', process.env.NODE_ENV);
console.log('Has DATABASE_URL:', !!process.env.DATABASE_URL);
console.log('DB Host:', process.env.DATABASE_URL ? new URL(process.env.DATABASE_URL).hostname : 'none');
\""

echo -e "\n${BLUE}🌐 Production environment test via SSH:${NC}"
flyctl ssh console -a weekly-report-backend -C "node -e \"
console.log('Environment:', process.env.NODE_ENV);
console.log('Has DATABASE_URL:', !!process.env.DATABASE_URL);
console.log('DB Host:', process.env.DATABASE_URL ? new URL(process.env.DATABASE_URL).hostname : 'none');
console.log('Files in /app/prisma:');
const fs = require('fs');
try {
  const files = fs.readdirSync('/app/prisma');
  files.forEach(f => console.log('  -', f));
} catch (e) {
  console.log('Error:', e.message);
}
\""

echo -e "\n${BLUE}📁 Checking Excel file on server:${NC}"
flyctl ssh console -a weekly-report-backend -C "ls -la /app/prisma/ | grep -E '(data\.xlsx|\.xlsx)' || echo 'No Excel files found'"

echo -e "\n${BLUE}🧪 Testing actual import script:${NC}"
read -p "Run actual import test? (y/N): " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo -e "${BLUE}🚀 Running import with debug output...${NC}"
    flyctl ssh console -a weekly-report-backend -C "NODE_ENV=production npx tsx prisma/import-all-data-from-excel.ts"
fi

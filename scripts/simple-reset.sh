#!/bin/bash
set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

export PATH="/home/hoangdanh2000/.fly/bin:$PATH"

echo -e "${BLUE}🗑️ Simple Production Database Reset${NC}"
echo "===================================="

echo -e "${RED}⚠️ WARNING: This will destroy ALL production data${NC}"
echo -e "${YELLOW}This action cannot be undone!${NC}"
echo ""
read -p "Type 'DELETE ALL DATA' to continue: " -r
echo ""

if [[ $REPLY != "DELETE ALL DATA" ]]; then
    echo -e "${BLUE}ℹ️ Operation cancelled${NC}"
    exit 0
fi

# Method 1: Try direct SQL reset via SSH
echo -e "${BLUE}🔄 Step 1: Direct SQL reset via backend SSH...${NC}"
if flyctl ssh console -a weekly-report-backend -C '
echo "🗑️ Dropping all tables..."
PGPASSWORD=$DATABASE_PASSWORD psql $DATABASE_URL << EOF
-- Drop all tables in cascade mode
DROP SCHEMA IF EXISTS public CASCADE;
CREATE SCHEMA public;
GRANT ALL ON SCHEMA public TO postgres;
GRANT ALL ON SCHEMA public TO public;
EOF
'; then
    echo -e "${GREEN}✅ Tables dropped successfully${NC}"
    
    # Deploy fresh schema
    echo -e "${BLUE}🏗️ Deploying fresh schema...${NC}"
    if flyctl ssh console -a weekly-report-backend -C "npx prisma db push"; then
        echo -e "${GREEN}✅ Schema deployed${NC}"
    else
        echo -e "${RED}❌ Schema deployment failed${NC}"
        exit 1
    fi
else
    echo -e "${YELLOW}⚠️ Method 1 failed, trying method 2...${NC}"
    
    # Method 2: Use Prisma migrate reset
    echo -e "${BLUE}🔄 Step 2: Prisma migrate reset...${NC}"
    if flyctl ssh console -a weekly-report-backend -C "npx prisma migrate reset --force --skip-seed"; then
        echo -e "${GREEN}✅ Database reset via Prisma${NC}"
    else
        echo -e "${YELLOW}⚠️ Method 2 failed, trying method 3...${NC}"
        
        # Method 3: Recreate database completely
        echo -e "${BLUE}🔄 Step 3: Complete database recreation...${NC}"
        echo -e "${BLUE}🗑️ Destroying existing database...${NC}"
        
        if flyctl apps destroy weekly-report-backend-db --yes 2>/dev/null; then
            echo -e "${GREEN}✅ Database destroyed${NC}"
        else
            echo -e "${YELLOW}ℹ️ Database may not exist or already destroyed${NC}"
        fi
        
        sleep 30
        
        echo -e "${BLUE}🆕 Creating new database...${NC}"
        if flyctl postgres create \
            --name "weekly-report-backend-db" \
            --region sin \
            --vm-size shared-cpu-1x \
            --volume-size 2 \
            --initial-cluster-size 1; then
            echo -e "${GREEN}✅ New database created${NC}"
            
            echo -e "${BLUE}⏳ Waiting for database initialization...${NC}"
            sleep 90
            
            echo -e "${BLUE}🔗 Attaching to backend...${NC}"
            flyctl postgres attach --app weekly-report-backend weekly-report-backend-db
            
            echo -e "${BLUE}🔄 Restarting backend...${NC}"
            flyctl apps restart weekly-report-backend
            sleep 60
            
            echo -e "${BLUE}🏗️ Running migrations...${NC}"
            flyctl ssh console -a weekly-report-backend -C "npx prisma migrate deploy"
        else
            echo -e "${RED}❌ Failed to create new database${NC}"
            exit 1
        fi
    fi
fi

# Import fresh data if Excel file exists
echo -e "${BLUE}📊 Importing fresh data...${NC}"
if flyctl ssh console -a weekly-report-backend -C "test -f prisma/data.xlsx && npx tsx prisma/import-all-data-from-excel.ts || echo 'No Excel file found'"; then
    echo -e "${GREEN}✅ Data imported${NC}"
else
    echo -e "${YELLOW}ℹ️ No data imported (Excel file not found)${NC}"
fi

# Test the reset
echo -e "${BLUE}🧪 Testing reset...${NC}"
sleep 30

for i in {1..5}; do
    if curl -f -s https://weekly-report-backend.fly.dev/api/health/db >/dev/null; then
        echo -e "${GREEN}✅ Database health check passed${NC}"
        break
    fi
    echo -e "${YELLOW}⏳ Waiting for database... ($i/5)${NC}"
    sleep 15
done

echo -e "${GREEN}🎉 Production database reset completed!${NC}"
echo -e "${BLUE}💡 Next steps:${NC}"
echo "  1. Upload Excel data: pnpm upload-excel"
echo "  2. Import data: pnpm manual:import"
echo "  3. Test login: pnpm test:login"

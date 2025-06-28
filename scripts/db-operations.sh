#!/bin/bash
# filepath: /home/hoangdanh2000/Desktop/TBS Group/bento-nestjs/weekly-work-report-system/backend/scripts/db-operations.sh

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}🛠️  Database Operations for Production Database${NC}"

# Check if .env.studio exists
if [ ! -f ".env.studio" ]; then
    echo -e "${RED}❌ .env.studio file not found${NC}"
    echo -e "${BLUE}💡 Run: ./scripts/db-connect.sh first to setup database connection${NC}"
    exit 1
fi

# Function to check database connection
check_connection() {
    if npx dotenv -e .env.studio -- npx prisma db execute --sql="SELECT 1;" 2>/dev/null; then
        return 0
    else
        return 1
    fi
}

# Function to show menu
show_menu() {
    echo ""
    echo -e "${BLUE}📋 Available Database Operations:${NC}"
    echo "  1) 🔄 Run Migrations"
    echo "  2) 📊 Check Migration Status" 
    echo "  3) 🌱 Seed Basic Data"
    echo "  4) 📥 Import Excel Data"
    echo "  5) 🗑️  Reset Database (DANGEROUS!)"
    echo "  6) 🎨 Open Prisma Studio"
    echo "  7) 🧪 Test Database Connection"
    echo "  8) 📈 Show Database Stats"
    echo "  9) 🚪 Exit"
    echo ""
}

# Function to run migrations
run_migrations() {
    echo -e "${BLUE}🔄 Running database migrations...${NC}"
    npx dotenv -e .env.studio -- npx prisma migrate deploy
    echo -e "${GREEN}✅ Migrations completed${NC}"
}

# Function to check migration status
check_migration_status() {
    echo -e "${BLUE}📊 Checking migration status...${NC}"
    npx dotenv -e .env.studio -- npx prisma migrate status
}

# Function to seed basic data
seed_basic_data() {
    echo -e "${BLUE}🌱 Seeding basic data...${NC}"
    npx dotenv -e .env.studio -- tsx prisma/seed.ts
    echo -e "${GREEN}✅ Basic data seeded${NC}"
}

# Function to import Excel data
import_excel_data() {
    if [ ! -f "prisma/data.xlsx" ]; then
        echo -e "${RED}❌ Excel file not found at prisma/data.xlsx${NC}"
        echo -e "${BLUE}📋 Expected Excel format:${NC}"
        echo "  Column A: MSNV (Employee Code)"
        echo "  Column B: HỌ VÀ TÊN (Full Name)"
        echo "  Column C: CD (Position)"
        echo "  Column D: VTCV (Job Position)"
        echo "  Column E: PHÒNG BAN (Department)"
        echo "  Column F: TRỰC THUỘC (Office)"
        echo "  Column G: PHONE (Phone Number)"
        return 1
    fi
    
    echo -e "${BLUE}📥 Importing Excel data...${NC}"
    npx dotenv -e .env.studio -- tsx prisma/import-all-data-from-excel.ts
    echo -e "${GREEN}✅ Excel data imported${NC}"
}

# Function to reset database
reset_database() {
    echo -e "${RED}⚠️  WARNING: This will DELETE ALL DATA in the production database!${NC}"
    echo -e "${RED}This action cannot be undone!${NC}"
    echo ""
    read -p "Type 'RESET' to confirm: " confirm
    
    if [ "$confirm" = "RESET" ]; then
        echo -e "${BLUE}🗑️  Resetting database...${NC}"
        npx dotenv -e .env.studio -- npx prisma migrate reset --force
        echo -e "${GREEN}✅ Database reset completed${NC}"
        
        echo -e "${BLUE}🌱 Seeding basic data...${NC}"
        npx dotenv -e .env.studio -- tsx prisma/seed.ts
        echo -e "${GREEN}✅ Basic data seeded${NC}"
    else
        echo -e "${YELLOW}❌ Reset cancelled${NC}"
    fi
}

# Function to open Prisma Studio
open_prisma_studio() {
    echo -e "${BLUE}🎨 Opening Prisma Studio...${NC}"
    ./scripts/prisma-studio.sh
}

# Function to test connection
test_connection() {
    echo -e "${BLUE}🧪 Testing database connection...${NC}"
    
    if check_connection; then
        echo -e "${GREEN}✅ Database connection successful${NC}"
        
        # Get database info
        echo -e "${BLUE}📊 Database Information:${NC}"
        npx dotenv -e .env.studio -- npx prisma db execute --sql="SELECT current_database() as database, current_user as user, version();" 2>/dev/null || echo "Could not fetch database info"
    else
        echo -e "${RED}❌ Database connection failed${NC}"
        echo -e "${BLUE}💡 Make sure the database proxy is running:${NC}"
        echo "     ./scripts/db-connect.sh"
    fi
}

# Function to show database stats
show_database_stats() {
    echo -e "${BLUE}📈 Database Statistics:${NC}"
    
    # Count tables and records
    echo -e "${YELLOW}Counting records...${NC}"
    
    cat > /tmp/count_query.sql << EOF
SELECT 
    'Users' as table_name, 
    COUNT(*) as record_count 
FROM "User"
UNION ALL
SELECT 
    'Offices' as table_name, 
    COUNT(*) as record_count 
FROM "Office"
UNION ALL
SELECT 
    'Departments' as table_name, 
    COUNT(*) as record_count 
FROM "Department"
UNION ALL
SELECT 
    'Positions' as table_name, 
    COUNT(*) as record_count 
FROM "Position"
UNION ALL
SELECT 
    'Job Positions' as table_name, 
    COUNT(*) as record_count 
FROM "JobPosition"
UNION ALL
SELECT 
    'Reports' as table_name, 
    COUNT(*) as record_count 
FROM "Report";
EOF
    
    npx dotenv -e .env.studio -- npx prisma db execute --file=/tmp/count_query.sql 2>/dev/null || echo "Could not fetch database stats"
    rm -f /tmp/count_query.sql
}

# Check database connection first
echo -e "${BLUE}🔍 Checking database connection...${NC}"
if ! check_connection; then
    echo -e "${RED}❌ Cannot connect to database on port 5433${NC}"
    echo -e "${BLUE}💡 Make sure the database proxy is running:${NC}"
    echo "     ./scripts/db-connect.sh"
    exit 1
fi

echo -e "${GREEN}✅ Database connection verified${NC}"

# Main menu loop
while true; do
    show_menu
    read -p "Choose an option (1-9): " choice
    
    case $choice in
        1)
            run_migrations
            ;;
        2)
            check_migration_status
            ;;
        3)
            seed_basic_data
            ;;
        4)
            import_excel_data
            ;;
        5)
            reset_database
            ;;
        6)
            open_prisma_studio
            ;;
        7)
            test_connection
            ;;
        8)
            show_database_stats
            ;;
        9)
            echo -e "${GREEN}👋 Goodbye!${NC}"
            exit 0
            ;;
        *)
            echo -e "${RED}❌ Invalid option. Please choose 1-9.${NC}"
            ;;
    esac
    
    echo ""
    read -p "Press Enter to continue..."
done
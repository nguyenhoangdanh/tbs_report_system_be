#!/bin/bash
set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

export PATH="/home/hoangdanh2000/.fly/bin:$PATH"

MODE=${1:-"production"}

# Load database credentials
load_db_credentials() {
    if [ -f ".env.production" ]; then
        export $(grep -E "^(DB_|DATABASE_URL|DIRECT_URL)" .env.production | xargs)
        echo -e "${GREEN}✅ Loaded credentials from .env.production${NC}"
    else
        echo -e "${RED}❌ .env.production not found${NC}"
        exit 1
    fi
}

echo -e "${BLUE}🗄️ Database Setup - Mode: ${MODE}${NC}"
echo "================================="

if [ "$MODE" = "local" ]; then
    echo -e "${BLUE}🏠 Setting up local development database...${NC}"
    
    # Start Docker containers
    echo -e "${BLUE}🐳 Starting Docker containers...${NC}"
    docker compose up -d
    sleep 15
    
    # Wait for PostgreSQL
    echo -e "${BLUE}⏳ Waiting for PostgreSQL...${NC}"
    for i in {1..30}; do
        if docker compose exec postgres pg_isready -U postgres -d weekly_report_dev >/dev/null 2>&1; then
            echo -e "${GREEN}✅ PostgreSQL ready${NC}"
            break
        fi
        sleep 2
    done
    
    # Run migrations
    echo -e "${BLUE}🔄 Running migrations...${NC}"
    dotenv -e .env.local -- npx prisma migrate dev --name init
    
    # Import Excel if available
    if [ -f "prisma/data.xlsx" ]; then
        echo -e "${BLUE}📊 Importing Excel data...${NC}"
        dotenv -e .env.local -- npx tsx prisma/import-all-data-from-excel.ts
    fi
    
    echo -e "${GREEN}🎉 Local database setup completed!${NC}"
    
elif [ "$MODE" = "production" ]; then
    echo -e "${BLUE}🌐 Setting up production database...${NC}"
    
    load_db_credentials
    
    # Check if database exists
    if ! flyctl status -a weekly-report-backend-db >/dev/null 2>&1; then
        echo -e "${BLUE}🆕 Creating database with consistent password...${NC}"
        echo "  • Region: Singapore (sin)"
        echo "  • Storage: 2GB"  
        echo "  • VM: shared-cpu-1x"
        echo "  • Cost: ~$4/month"
        echo "  • Password: $DB_PASSWORD"
        
        # Create database with known password
        if flyctl postgres create \
            --name "weekly-report-backend-db" \
            --region sin \
            --vm-size shared-cpu-1x \
            --volume-size 2 \
            --initial-cluster-size 1 \
            --password "$DB_PASSWORD"; then
            echo -e "${GREEN}✅ Database created successfully${NC}"
        else
            echo -e "${RED}❌ Failed to create database${NC}"
            exit 1
        fi
        
        # Wait for database initialization
        echo -e "${BLUE}⏳ Waiting for database initialization...${NC}"
        sleep 90
        
        # Set secrets with known credentials
        echo -e "${BLUE}🔗 Setting up connection...${NC}"
        flyctl secrets set \
            DATABASE_URL="postgres://$DB_USER:$DB_PASSWORD@$DB_HOST:5432/$DB_NAME?sslmode=disable" \
            DIRECT_URL="postgres://$DB_USER:$DB_PASSWORD@$DB_HOST:5432/$DB_NAME?sslmode=disable" \
            --app weekly-report-backend
        
        echo -e "${GREEN}✅ Database secrets configured${NC}"
        
        # Restart backend to pick up new database
        echo -e "${BLUE}🔄 Restarting backend...${NC}"
        flyctl apps restart weekly-report-backend
        sleep 60
        
    else
        echo -e "${GREEN}✅ Database already exists${NC}"
    fi
    
    # Test backend health
    echo -e "${BLUE}🏥 Testing backend health...${NC}"
    for i in {1..8}; do
        if curl -f -s https://weekly-report-backend.fly.dev/health >/dev/null; then
            echo -e "${GREEN}✅ Backend healthy${NC}"
            break
        fi
        if [ $i -eq 8 ]; then
            echo -e "${YELLOW}⚠️ Backend not responding, trying restart...${NC}"
            flyctl apps restart weekly-report-backend
            sleep 60
        fi
        echo -e "${YELLOW}⏳ Waiting for backend... ($i/8)${NC}"
        sleep 15
    done
    
    # Run migrations via SSH with proper syntax
    echo -e "${BLUE}🔄 Running migrations...${NC}"
    if flyctl ssh console -a weekly-report-backend -C "npx prisma migrate deploy"; then
        echo -e "${GREEN}✅ Migrations completed${NC}"
    else
        echo -e "${YELLOW}⚠️ Migrations failed, trying to push schema...${NC}"
        if flyctl ssh console -a weekly-report-backend -C "npx prisma db push"; then
            echo -e "${GREEN}✅ Schema pushed successfully${NC}"
        else
            echo -e "${RED}❌ Schema setup failed${NC}"
            exit 1
        fi
    fi
    
    # Import Excel if available with proper test syntax
    echo -e "${BLUE}📊 Importing Excel data...${NC}"
    if flyctl ssh console -a weekly-report-backend -C "test -f prisma/data.xlsx && npx tsx prisma/import-all-data-from-excel.ts || echo 'No Excel file found'"; then
        echo -e "${GREEN}✅ Data import completed${NC}"
    else
        echo -e "${YELLOW}ℹ️ Data import skipped${NC}"
    fi
    
    # Test system
    echo -e "${BLUE}🧪 Testing production system...${NC}"
    
    # Test database health
    if curl -f -s https://weekly-report-backend.fly.dev/api/health/db >/dev/null; then
        echo -e "${GREEN}✅ Database health check passed${NC}"
    else
        echo -e "${RED}❌ Database health check failed${NC}"
    fi
    
    echo -e "${GREEN}🎉 Production database setup completed!${NC}"
    echo -e "${BLUE}💰 Monthly cost: ~$6 ($2 backend + $4 database)${NC}"
    echo -e "${BLUE}🔑 Database password: $DB_PASSWORD${NC}"
    
else
    echo -e "${RED}❌ Invalid mode: $MODE${NC}"
    echo -e "${BLUE}💡 Usage: ./setup-database.sh [local|production]${NC}"
    exit 1
fi

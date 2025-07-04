#!/bin/bash
set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

export PATH="/home/hoangdanh2000/.fly/bin:$PATH"

echo -e "${BLUE}🔒 SSL Issues Diagnostic & Fix${NC}"
echo "=============================="

# Load credentials
if [ -f ".env.production" ]; then
    export $(grep -E "^(DB_|DATABASE_URL|DIRECT_URL)" .env.production | xargs)
    echo -e "${GREEN}✅ Loaded credentials${NC}"
else
    echo -e "${RED}❌ .env.production not found${NC}"
    exit 1
fi

echo -e "${BLUE}🔍 Step 1: Diagnosing SSL issue...${NC}"

# Check database status
echo -e "${BLUE}📊 Database status:${NC}"
flyctl status -a weekly-report-backend-db

# Check backend status
echo -e "${BLUE}📊 Backend status:${NC}"
flyctl status -a weekly-report-backend

# Test different SSL modes
echo -e "${BLUE}🧪 Step 2: Testing SSL configurations...${NC}"

# Test 1: SSL disabled
echo -e "${BLUE}🔧 Test 1: SSL disabled...${NC}"
flyctl secrets set \
    DATABASE_URL="postgres://$DB_USER:$DB_PASSWORD@$DB_HOST:5432/$DB_NAME?sslmode=disable&connect_timeout=30" \
    DIRECT_URL="postgres://$DB_USER:$DB_PASSWORD@$DB_HOST:5432/$DB_NAME?sslmode=disable&connect_timeout=30" \
    --app weekly-report-backend

flyctl apps restart weekly-report-backend
sleep 45

# Test connection
if curl -f -s https://weekly-report-backend.fly.dev/api/health/db >/dev/null; then
    echo -e "${GREEN}✅ SSL disabled works!${NC}"
    SSL_WORKS="disable"
else
    echo -e "${YELLOW}⚠️ SSL disabled failed${NC}"
    
    # Test 2: SSL prefer
    echo -e "${BLUE}🔧 Test 2: SSL prefer...${NC}"
    flyctl secrets set \
        DATABASE_URL="postgres://$DB_USER:$DB_PASSWORD@$DB_HOST:5432/$DB_NAME?sslmode=prefer&connect_timeout=30" \
        DIRECT_URL="postgres://$DB_USER:$DB_PASSWORD@$DB_HOST:5432/$DB_NAME?sslmode=prefer&connect_timeout=30" \
        --app weekly-report-backend
    
    flyctl apps restart weekly-report-backend
    sleep 45
    
    if curl -f -s https://weekly-report-backend.fly.dev/api/health/db >/dev/null; then
        echo -e "${GREEN}✅ SSL prefer works!${NC}"
        SSL_WORKS="prefer"
    else
        echo -e "${YELLOW}⚠️ SSL prefer failed${NC}"
        
        # Test 3: SSL require
        echo -e "${BLUE}🔧 Test 3: SSL require...${NC}"
        flyctl secrets set \
            DATABASE_URL="postgres://$DB_USER:$DB_PASSWORD@$DB_HOST:5432/$DB_NAME?sslmode=require&connect_timeout=30" \
            DIRECT_URL="postgres://$DB_USER:$DB_PASSWORD@$DB_HOST:5432/$DB_NAME?sslmode=require&connect_timeout=30" \
            --app weekly-report-backend
        
        flyctl apps restart weekly-report-backend
        sleep 45
        
        if curl -f -s https://weekly-report-backend.fly.dev/api/health/db >/dev/null; then
            echo -e "${GREEN}✅ SSL require works!${NC}"
            SSL_WORKS="require"
        else
            echo -e "${RED}❌ All SSL modes failed${NC}"
            SSL_WORKS="none"
        fi
    fi
fi

echo -e "${BLUE}📋 Step 3: SSL Results${NC}"
echo "Working SSL mode: $SSL_WORKS"

if [ "$SSL_WORKS" != "none" ]; then
    # Update .env.production with working SSL mode
    echo -e "${BLUE}📝 Updating .env.production with working SSL mode...${NC}"
    
    sed -i "s|sslmode=[^&]*|sslmode=$SSL_WORKS|g" .env.production
    
    echo -e "${GREEN}✅ .env.production updated${NC}"
    echo -e "${BLUE}💡 Now retry: pnpm db:reset production${NC}"
else
    echo -e "${RED}❌ Database connection issues detected${NC}"
    echo -e "${BLUE}💡 Recommendations:${NC}"
    echo "  1. Check database is running: flyctl status -a weekly-report-backend-db"
    echo "  2. Check database logs: flyctl logs -a weekly-report-backend-db"
    echo "  3. Try recreating database: pnpm db:reset recreate"
    echo "  4. Check network connectivity"
fi

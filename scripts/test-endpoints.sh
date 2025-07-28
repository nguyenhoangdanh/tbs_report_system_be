#!/bin/bash

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m'

# Get domain
DOMAIN=$(railway domain 2>/dev/null | grep -o 'https://[^ ]*' | head -n1)

if [ -z "$DOMAIN" ]; then
    echo "❌ Could not get Railway domain"
    exit 1
fi

echo -e "${BLUE}🧪 Testing Railway Backend Endpoints${NC}"
echo "===================================="
echo -e "${BLUE}🌐 Domain:${NC} $DOMAIN"
echo ""

# Test health endpoint
echo -n "🏥 Health endpoint: "
if curl -f -s "$DOMAIN/health" >/dev/null 2>&1; then
    echo -e "${GREEN}✅ OK${NC}"
else
    echo -e "${RED}❌ Failed${NC}"
fi

# Test API health
echo -n "📡 API health: "
if curl -f -s "$DOMAIN/api/health" >/dev/null 2>&1; then
    echo -e "${GREEN}✅ OK${NC}"
else
    echo -e "${RED}❌ Failed${NC}"
fi

# Test database health
echo -n "📊 Database health: "
if curl -f -s "$DOMAIN/api/health/db" >/dev/null 2>&1; then
    echo -e "${GREEN}✅ OK${NC}"
else
    echo -e "${RED}❌ Failed${NC}"
fi

echo ""
echo -e "${BLUE}📋 Frontend Configuration:${NC}"
echo "NEXT_PUBLIC_API_URL=$DOMAIN"
echo "VITE_API_URL=$DOMAIN"

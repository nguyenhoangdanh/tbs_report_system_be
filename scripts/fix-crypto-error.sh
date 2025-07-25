#!/bin/bash
set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

export PATH="/home/hoangdanh2000/.fly/bin:$PATH"

echo -e "${BLUE}🔧 Fixing crypto error in production...${NC}"

# 1. Stop the machine
echo -e "${BLUE}🛑 Stopping machine to fix crypto issue...${NC}"
flyctl machine stop 7815122b497068 -a weekly-report-backend --force || echo "Machine already stopped"

# 2. Set NODE_OPTIONS for crypto support
echo -e "${BLUE}🔐 Setting Node.js crypto options...${NC}"
flyctl secrets set NODE_OPTIONS="--experimental-global-webcrypto" -a weekly-report-backend

# 3. Rebuild with crypto fix
echo -e "${BLUE}🔨 Rebuilding with crypto polyfill...${NC}"
npm run build

# 4. Deploy with crypto fix
echo -e "${BLUE}📦 Deploying with crypto support...${NC}"
flyctl deploy --strategy immediate

# 5. Wait longer for crypto initialization
echo -e "${BLUE}⏳ Waiting 2 minutes for crypto initialization...${NC}"
sleep 120

# 6. Test specifically for crypto errors
echo -e "${BLUE}🧪 Testing for crypto issues...${NC}"
for i in {1..10}; do
    if curl -f -s --max-time 20 https://weekly-report-backend.fly.dev/health >/dev/null 2>&1; then
        echo -e "${GREEN}✅ App is healthy - crypto issue resolved! (attempt $i)${NC}"
        break
    fi
    
    # Check logs for crypto errors
    if flyctl logs --no-tail -a weekly-report-backend | tail -5 | grep -q "crypto is not defined"; then
        echo -e "${RED}❌ Crypto error still present (attempt $i)${NC}"
        if [ $i -eq 5 ]; then
            echo -e "${YELLOW}🔄 Trying manual restart...${NC}"
            flyctl apps restart weekly-report-backend
            sleep 60
        fi
    else
        echo -e "${YELLOW}⏳ Waiting for startup... ($i/10)${NC}"
    fi
    
    if [ $i -eq 10 ]; then
        echo -e "${RED}❌ Still failing. Showing recent logs:${NC}"
        flyctl logs --no-tail -a weekly-report-backend | tail -30
        exit 1
    fi
    
    sleep 15
done

# 7. Final verification
echo -e "${BLUE}📊 Final status:${NC}"
flyctl status -a weekly-report-backend

echo -e "${GREEN}🎉 Crypto error fixed successfully!${NC}"

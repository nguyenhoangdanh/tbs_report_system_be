#!/bin/bash
set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

export PATH="/home/hoangdanh2000/.fly/bin:$PATH"

echo -e "${BLUE}🔧 Fixing Performance CPU deployment...${NC}"

# 1. Stop machine if running
echo -e "${BLUE}🛑 Stopping machine safely...${NC}"
flyctl machine stop 7815122b497068 -a weekly-report-backend --force || echo "Machine already stopped"

# 2. Wait a bit
sleep 10

# 3. Check secrets (common issue)
echo -e "${BLUE}🔐 Checking secrets...${NC}"
flyctl secrets list -a weekly-report-backend

# 4. Ensure DATABASE_URL exists
echo -e "${BLUE}🗄️ Ensuring database connection...${NC}"
if ! flyctl secrets list -a weekly-report-backend | grep -q DATABASE_URL; then
    echo -e "${YELLOW}⚠️  DATABASE_URL missing, attaching postgres...${NC}"
    flyctl postgres attach --app weekly-report-backend weekly-report-db || echo "Database already attached"
fi

# 5. Start machine manually with longer timeout
echo -e "${BLUE}🚀 Starting machine manually (Performance CPU needs time)...${NC}"
flyctl machine start 7815122b497068 -a weekly-report-backend

# 6. Wait longer for Performance CPU
echo -e "${BLUE}⏳ Waiting 90 seconds for Performance CPU startup...${NC}"
for i in {1..18}; do
    echo -n "."
    sleep 5
done
echo ""

# 7. Check if app is responding
echo -e "${BLUE}🏥 Checking health (with retries)...${NC}"
for i in {1..10}; do
    if curl -f -s https://weekly-report-backend.fly.dev/health >/dev/null 2>&1; then
        echo -e "${GREEN}✅ App is healthy! (attempt $i)${NC}"
        break
    fi
    if [ $i -eq 10 ]; then
        echo -e "${RED}❌ App not responding after 10 attempts${NC}"
        echo -e "${BLUE}📋 Recent logs:${NC}"
        flyctl logs --no-tail -a weekly-report-backend | tail -20
        
        echo -e "${YELLOW}💡 Trying to restart with fresh deployment...${NC}"
        flyctl deploy --strategy immediate --force
        sleep 60
        
        if curl -f -s https://weekly-report-backend.fly.dev/health >/dev/null 2>&1; then
            echo -e "${GREEN}✅ Fresh deployment worked!${NC}"
        else
            echo -e "${RED}❌ Still not working. Manual investigation needed.${NC}"
            exit 1
        fi
        break
    fi
    echo -e "${YELLOW}⏳ Waiting... ($i/10)${NC}"
    sleep 10
done

# 8. Final checks
echo -e "${BLUE}📊 Final status:${NC}"
flyctl status -a weekly-report-backend

echo -e "${BLUE}🔗 Testing endpoints:${NC}"
curl -f https://weekly-report-backend.fly.dev/health && echo -e "${GREEN}✅ /health OK${NC}" || echo -e "${RED}❌ /health failed${NC}"
curl -f https://weekly-report-backend.fly.dev/api/health && echo -e "${GREEN}✅ /api/health OK${NC}" || echo -e "${RED}❌ /api/health failed${NC}"

echo -e "${GREEN}🎉 Performance CPU deployment fixed!${NC}"
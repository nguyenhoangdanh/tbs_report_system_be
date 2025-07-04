#!/bin/bash
set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

export PATH="/home/hoangdanh2000/.fly/bin:$PATH"

OPERATION=${1:-"start"}
LOCAL_PORT=${2:-5434}

# Load database credentials
load_db_credentials() {
    if [ -f ".env.production" ]; then
        export $(grep -E "^(DB_|DATABASE_URL)" .env.production | xargs)
    else
        echo -e "${RED}❌ .env.production not found${NC}"
        exit 1
    fi
}

echo -e "${BLUE}🌉 Database Proxy Manager (SSL-enabled)${NC}"
echo "====================================="

start_proxy() {
    load_db_credentials
    
    echo -e "${BLUE}🔄 Starting SSL-compatible database proxy...${NC}"
    echo -e "${BLUE}📍 Production DB (SSL) → localhost:$LOCAL_PORT (non-SSL)${NC}"
    
    # Check if port is already in use
    if lsof -Pi :$LOCAL_PORT -sTCP:LISTEN -t >/dev/null 2>&1; then
        echo -e "${YELLOW}⚠️ Port $LOCAL_PORT is already in use${NC}"
        PROCESS=$(lsof -Pi :$LOCAL_PORT -sTCP:LISTEN | tail -n +2)
        echo -e "${BLUE}🔍 Process using port $LOCAL_PORT:${NC}"
        echo "$PROCESS"
        
        read -p "Kill existing process? (y/N): " -n 1 -r
        echo
        if [[ $REPLY =~ ^[Yy]$ ]]; then
            PID=$(lsof -Pi :$LOCAL_PORT -sTCP:LISTEN -t)
            kill -9 $PID
            echo -e "${GREEN}✅ Process killed${NC}"
        else
            exit 1
        fi
    fi
    
    echo -e "${BLUE}🚀 Starting proxy on port $LOCAL_PORT...${NC}"
    echo -e "${YELLOW}⚠️ Keep this terminal open while using the proxy${NC}"
    echo ""
    echo -e "${BLUE}🔗 Local connection details (for DB extensions):${NC}"
    echo "  Host: localhost"
    echo "  Port: $LOCAL_PORT"
    echo "  Database: $DB_NAME"
    echo "  Username: $DB_USER"
    echo "  Password: $DB_PASSWORD"
    echo "  SSL Mode: DISABLED (proxy handles SSL)"
    echo ""
    echo -e "${BLUE}📊 Connection strings for different tools:${NC}"
    echo ""
    echo -e "${CYAN}VS Code PostgreSQL Extension:${NC}"
    echo "  Host: localhost"
    echo "  Port: $LOCAL_PORT"
    echo "  Database: $DB_NAME"
    echo "  Username: $DB_USER"
    echo "  Password: $DB_PASSWORD"
    echo "  SSL: false/disabled"
    echo ""
    echo -e "${CYAN}Database URL (for tools that support it):${NC}"
    echo "  postgresql://$DB_USER:$DB_PASSWORD@localhost:$LOCAL_PORT/$DB_NAME?sslmode=disable"
    echo ""
    echo -e "${CYAN}pgAdmin Connection:${NC}"
    echo "  Host: localhost"
    echo "  Port: $LOCAL_PORT"
    echo "  Maintenance database: $DB_NAME"
    echo "  Username: $DB_USER"
    echo "  Password: $DB_PASSWORD"
    echo "  SSL mode: Disable"
    echo ""
    echo -e "${BLUE}🛑 Press Ctrl+C to stop proxy${NC}"
    echo "=================================="
    
    # Start proxy (Fly.io proxy automatically handles SSL termination)
    flyctl proxy $LOCAL_PORT:5432 -a weekly-report-backend-db
}

stop_proxy() {
    echo -e "${BLUE}🛑 Stopping database proxy...${NC}"
    
    if lsof -Pi :$LOCAL_PORT -sTCP:LISTEN -t >/dev/null 2>&1; then
        PID=$(lsof -Pi :$LOCAL_PORT -sTCP:LISTEN -t)
        kill -9 $PID
        echo -e "${GREEN}✅ Proxy stopped${NC}"
    else
        echo -e "${YELLOW}⚠️ No proxy running on port $LOCAL_PORT${NC}"
    fi
}

check_proxy() {
    echo -e "${BLUE}🔍 Checking proxy status...${NC}"
    
    if lsof -Pi :$LOCAL_PORT -sTCP:LISTEN -t >/dev/null 2>&1; then
        echo -e "${GREEN}✅ Proxy is running on port $LOCAL_PORT${NC}"
        
        load_db_credentials
        
        # Test connection with SSL disabled (since proxy handles SSL)
        if command -v psql &> /dev/null; then
            echo -e "${BLUE}🧪 Testing proxy connection (SSL disabled)...${NC}"
            if PGPASSWORD=$DB_PASSWORD psql -h localhost -p $LOCAL_PORT -U $DB_USER -d $DB_NAME -c "SELECT 1;" >/dev/null 2>&1; then
                echo -e "${GREEN}✅ Database connection working through proxy${NC}"
                
                # Get some database info
                echo -e "${BLUE}📊 Database info:${NC}"
                PGPASSWORD=$DB_PASSWORD psql -h localhost -p $LOCAL_PORT -U $DB_USER -d $DB_NAME -c "SELECT version();" | head -3
                echo ""
                PGPASSWORD=$DB_PASSWORD psql -h localhost -p $LOCAL_PORT -U $DB_USER -d $DB_NAME -c "SELECT current_database(), current_user, now();"
            else
                echo -e "${RED}❌ Database connection failed through proxy${NC}"
            fi
        else
            echo -e "${YELLOW}ℹ️ psql not installed, cannot test connection${NC}"
        fi
        
        echo ""
        echo -e "${BLUE}🔗 Use this connection string in your tools:${NC}"
        echo "postgresql://$DB_USER:$DB_PASSWORD@localhost:$LOCAL_PORT/$DB_NAME?sslmode=disable"
    else
        echo -e "${RED}❌ No proxy running${NC}"
    fi
}

show_help() {
    echo -e "${BLUE}📋 Database Proxy Commands:${NC}"
    echo "  start [port]  - Start SSL-compatible proxy (default port: 5434)"
    echo "  stop [port]   - Stop proxy"
    echo "  check [port]  - Check proxy status and test connection"
    echo "  help          - Show this help"
    echo ""
    echo -e "${BLUE}💡 Examples:${NC}"
    echo "  $0 start        # Start on port 5434"
    echo "  $0 start 5435   # Start on port 5435"
    echo "  $0 stop         # Stop proxy on port 5434"
    echo "  $0 check        # Check status and test connection"
    echo ""
    echo -e "${BLUE}🔧 VS Code Setup:${NC}"
    echo "1. Install PostgreSQL extension"
    echo "2. Start proxy: pnpm db:proxy"
    echo "3. Add connection:"
    echo "   - Host: localhost"
    echo "   - Port: 5434"
    echo "   - Database: weekly_report_backend"
    echo "   - Username: postgres"
    echo "   - Password: TBSGroup2024SecurePass"
    echo "   - SSL: DISABLED"
}

case $OPERATION in
    "start")
        start_proxy
        ;;
    "stop")
        stop_proxy
        ;;
    "check"|"status")
        check_proxy
        ;;
    "help"|"-h"|"--help")
        show_help
        ;;
    *)
        echo -e "${RED}❌ Unknown operation: $OPERATION${NC}"
        show_help
        exit 1
        ;;
esac

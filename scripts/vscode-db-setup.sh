#!/bin/bash
set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

echo -e "${BLUE}🔧 VS Code Database Extension Setup${NC}"
echo "=================================="

echo -e "${BLUE}📋 Step-by-step VS Code setup:${NC}"
echo ""

echo -e "${CYAN}Step 1: Install PostgreSQL Extension${NC}"
echo "  1. Open VS Code"
echo "  2. Go to Extensions (Ctrl+Shift+X)"
echo "  3. Search for 'PostgreSQL' by Chris Kolkman"
echo "  4. Install the extension"
echo ""

echo -e "${CYAN}Step 2: Start Database Proxy${NC}"
echo "  Run this command in another terminal:"
echo "  ${YELLOW}pnpm db:proxy${NC}"
echo ""

echo -e "${CYAN}Step 3: Add Database Connection in VS Code${NC}"
echo "  1. Open Command Palette (Ctrl+Shift+P)"
echo "  2. Type: 'PostgreSQL: Add Connection'"
echo "  3. Enter connection details:"
echo ""
echo -e "${BLUE}Connection Details:${NC}"
echo "  Hostname: ${GREEN}localhost${NC}"
echo "  Port: ${GREEN}5434${NC}"
echo "  Database: ${GREEN}weekly_report_backend${NC}"
echo "  Username: ${GREEN}postgres${NC}"
echo "  Password: ${GREEN}TBSGroup2024SecurePass${NC}"
echo "  SSL Mode: ${GREEN}Disable${NC} (IMPORTANT!)"
echo ""

echo -e "${CYAN}Step 4: Test Connection${NC}"
echo "  1. In VS Code, open PostgreSQL explorer"
echo "  2. Click on your connection"
echo "  3. You should see database tables"
echo ""

echo -e "${BLUE}🔗 Alternative: Direct Connection String${NC}"
echo "If your tool supports connection strings, use:"
echo "${YELLOW}postgresql://postgres:TBSGroup2024SecurePass@localhost:5434/weekly_report_backend?sslmode=disable${NC}"
echo ""

echo -e "${BLUE}🛠️ Troubleshooting:${NC}"
echo "• If connection fails: Check if proxy is running (pnpm db:proxy-check)"
echo "• If SSL errors: Make sure SSL is set to 'Disable' or 'false'"
echo "• If timeout: Try increasing connection timeout in your tool"
echo ""

echo -e "${BLUE}📚 Useful Commands:${NC}"
echo "• Start proxy: ${GREEN}pnpm db:proxy${NC}"
echo "• Check proxy: ${GREEN}pnpm db:proxy-check${NC}"
echo "• Stop proxy: ${GREEN}pnpm db:proxy-stop${NC}"
echo "• This help: ${GREEN}./scripts/vscode-db-setup.sh${NC}"
echo ""

# Check if proxy is running
if lsof -Pi :5434 -sTCP:LISTEN -t >/dev/null 2>&1; then
    echo -e "${GREEN}✅ Database proxy is running on port 5434${NC}"
    echo -e "${BLUE}💡 You can now connect from VS Code using the details above${NC}"
else
    echo -e "${YELLOW}⚠️ Database proxy is not running${NC}"
    echo -e "${BLUE}💡 Start it with: pnpm db:proxy${NC}"
fi

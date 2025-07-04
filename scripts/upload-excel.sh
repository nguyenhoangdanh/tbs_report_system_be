#!/bin/bash
set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

export PATH="/home/hoangdanh2000/.fly/bin:$PATH"

echo -e "${BLUE}📊 Upload Excel Data to Production${NC}"
echo "================================="

# Check if Excel file exists locally
if [ ! -f "prisma/data.xlsx" ]; then
    echo -e "${RED}❌ prisma/data.xlsx not found locally${NC}"
    echo -e "${BLUE}💡 Please place your Excel file at: prisma/data.xlsx${NC}"
    exit 1
fi

echo -e "${GREEN}✅ Found Excel file locally${NC}"
echo -e "${BLUE}📋 File info:${NC}"
ls -la prisma/data.xlsx

# Upload via SSH
echo -e "${BLUE}📤 Uploading Excel file to production...${NC}"

# Method 1: Use flyctl ssh sftp
echo -e "${BLUE}🔄 Uploading via SSH...${NC}"
if flyctl ssh sftp shell -a weekly-report-backend << 'EOF'
put prisma/data.xlsx /app/prisma/data.xlsx
quit
EOF
then
    echo -e "${GREEN}✅ Excel file uploaded successfully${NC}"
else
    echo -e "${YELLOW}⚠️ SFTP upload failed, trying alternative method...${NC}"
    
    # Method 2: Copy content via console
    echo -e "${BLUE}🔄 Trying base64 upload method...${NC}"
    
    # Encode file to base64
    BASE64_CONTENT=$(base64 -w 0 prisma/data.xlsx)
    
    # Upload via SSH console
    flyctl ssh console -a weekly-report-backend -C "echo '$BASE64_CONTENT' | base64 -d > /app/prisma/data.xlsx"
    
    if [ $? -eq 0 ]; then
        echo -e "${GREEN}✅ Excel file uploaded via base64${NC}"
    else
        echo -e "${RED}❌ All upload methods failed${NC}"
        exit 1
    fi
fi

# Verify upload
echo -e "${BLUE}🔍 Verifying upload...${NC}"
REMOTE_FILE_INFO=$(flyctl ssh console -a weekly-report-backend -C "ls -la /app/prisma/data.xlsx" 2>/dev/null || echo "NOT_FOUND")

if [[ "$REMOTE_FILE_INFO" != *"NOT_FOUND"* ]]; then
    echo -e "${GREEN}✅ File verified on server:${NC}"
    echo "$REMOTE_FILE_INFO"
else
    echo -e "${RED}❌ File verification failed${NC}"
    exit 1
fi

# Import data
echo -e "${BLUE}📊 Importing Excel data...${NC}"
if flyctl ssh console -a weekly-report-backend -C "npx tsx prisma/import-all-data-from-excel.ts"; then
    echo -e "${GREEN}✅ Excel data imported successfully${NC}"
    
    # Test authentication
    echo -e "${BLUE}🔐 Testing authentication with imported users...${NC}"
    sleep 10
    
    LOGIN_TEST=$(curl -s -X POST https://weekly-report-backend.fly.dev/api/auth/login \
        -H "Content-Type: application/json" \
        -H "Origin: https://weeklyreport-orpin.vercel.app" \
        -d '{"employeeCode":"552502356","password":"123456"}' 2>/dev/null || echo "failed")
    
    if echo "$LOGIN_TEST" | grep -q '"access_token"'; then
        echo -e "${GREEN}🎉 SUCCESS! Authentication working with imported users!${NC}"
    else
        echo -e "${YELLOW}⚠️ Authentication test failed after import${NC}"
    fi
    
else
    echo -e "${RED}❌ Excel import failed${NC}"
    echo -e "${BLUE}💡 Check file format and try again${NC}"
    exit 1
fi

echo -e "${GREEN}🎉 Excel upload and import completed!${NC}"

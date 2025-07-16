#!/bin/bash

# Production Database Verification Script
set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m'

log() { echo -e "${BLUE}[$(date +'%H:%M:%S')]${NC} $1"; }
success() { echo -e "${GREEN}✅ $1${NC}"; }

export PATH="/home/hoangdanh2000/.fly/bin:$PATH"

log "🔍 Verifying production database..."

flyctl ssh console -a weekly-report-backend -C '
echo "=== Database Tables ==="
psql $DATABASE_URL -c "\dt"

echo ""
echo "=== Table Row Counts ==="
psql $DATABASE_URL -c "
SELECT 
    table_name,
    (
        SELECT count(*) 
        FROM information_schema.tables t2 
        WHERE t2.table_name = t.table_name 
        AND t2.table_schema = '\''public'\''
    ) as exists,
    CASE 
        WHEN table_name = '\''users'\'' THEN (SELECT count(*) FROM users)
        WHEN table_name = '\''offices'\'' THEN (SELECT count(*) FROM offices)
        WHEN table_name = '\''departments'\'' THEN (SELECT count(*) FROM departments)
        WHEN table_name = '\''positions'\'' THEN (SELECT count(*) FROM positions)
        WHEN table_name = '\''job_positions'\'' THEN (SELECT count(*) FROM job_positions)
        WHEN table_name = '\''reports'\'' THEN (SELECT count(*) FROM reports)
        WHEN table_name = '\''report_tasks'\'' THEN (SELECT count(*) FROM report_tasks)
        ELSE 0
    END as row_count
FROM information_schema.tables t
WHERE table_schema = '\''public'\''
AND table_type = '\''BASE TABLE'\''
ORDER BY table_name;
"

echo ""
echo "=== Migration Status ==="
npx prisma migrate status || echo "Migration status check failed"

echo ""
echo "=== Sample Data Check ==="
echo "Users sample:"
psql $DATABASE_URL -c "SELECT employeeCode, firstName, lastName, email FROM users LIMIT 3;" || echo "No users data"

echo ""
echo "Offices sample:"
psql $DATABASE_URL -c "SELECT name, type FROM offices LIMIT 3;" || echo "No offices data"
'

success "🎉 Database verification completed!"

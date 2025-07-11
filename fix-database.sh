#!/bin/bash

echo "🔧 Fixing database schema and data..."

# 1. Stop the server if running
echo "🛑 Stopping server..."
pkill -f "npm.*start" || true

# 2. Reset database and apply new schema
echo "🗄️ Resetting database..."
npx prisma db push --force-reset

# 3. Generate Prisma client
echo "📦 Generating Prisma client..."
npx prisma generate

# 4. Run import script
echo "📊 Importing data from Excel..."
npx ts-node prisma/import-all-data-from-excel.ts

# 5. Verify data
echo "🔍 Verifying imported data..."
npx prisma db execute --stdin <<EOF
SELECT 
    'users' as table_name, count(*) as count 
FROM users
UNION ALL
SELECT 
    'offices' as table_name, count(*) as count 
FROM offices
UNION ALL
SELECT 
    'departments' as table_name, count(*) as count 
FROM departments
UNION ALL
SELECT 
    'positions' as table_name, count(*) as count 
FROM positions
UNION ALL
SELECT 
    'job_positions' as table_name, count(*) as count 
FROM job_positions;
EOF

echo "✅ Database fix completed!"

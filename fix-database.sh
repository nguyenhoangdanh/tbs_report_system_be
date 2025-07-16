#!/bin/bash

echo "🔧 Fixing LOCAL database schema and data..."

# Ensure we're using local environment
export NODE_ENV=development

# 1. Stop the server if running
echo "🛑 Stopping server..."
pkill -f "npm.*start" || true

# 2. Start local database
echo "🐳 Starting local database..."
docker compose up postgres -d

# 3. Wait for database
echo "⏳ Waiting for database to be ready..."
sleep 10

# 4. Reset database and apply new schema (LOCAL)
echo "🗄️ Resetting LOCAL database..."
dotenv -e .env.local -- npx prisma db push --force-reset

# 5. Generate Prisma client
echo "📦 Generating Prisma client..."
npx prisma generate

# 6. Run import script (LOCAL)
echo "📊 Importing data from Excel (LOCAL)..."
dotenv -e .env.local -- npx tsx prisma/import-all-data-from-excel.ts

# 7. Verify data (LOCAL)
echo "🔍 Verifying imported data..."
dotenv -e .env.local -- npx prisma db execute --stdin <<EOF
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

echo "✅ LOCAL database fix completed!"
echo "💡 For production, use: npm run production:reset"

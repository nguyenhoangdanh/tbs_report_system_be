
#!/bin/bash
# scripts/entrypoint.sh
# Application entrypoint script

set -e

echo "Starting Weekly Report Backend..."

# Wait for database to be ready
echo "Waiting for database connection..."
until node -e "
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
prisma.\$connect()
  .then(() => { console.log('Database connected'); process.exit(0); })
  .catch(() => process.exit(1));
" 2>/dev/null; do
    echo "Database is not ready yet, waiting..."
    sleep 5
done

echo "Database is ready!"

# Run Prisma migrations
echo "Running database migrations..."
npx prisma migrate deploy || {
    echo "Migration failed, trying to push schema..."
    npx prisma db push --accept-data-loss
}

# Generate Prisma client (if not already generated)
echo "Generating Prisma client..."
npx prisma generate

# Start the application
echo "Starting NestJS application..."
exec node dist/src/main.js
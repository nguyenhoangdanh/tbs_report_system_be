# Database Operations Guide

## Environment Setup

### Local Development
```bash
# Start local database
pnpm docker:up

# Setup local database
pnpm db:local:setup

# Start development server
pnpm start:dev
```

### Production Database Access
```bash
# Connect to production database (keep terminal open)
pnpm db:prod:connect

# In another terminal:
# Open Prisma Studio
pnpm db:studio

# Run migrations
pnpm db:prod:migrate

# Seed data
pnpm db:prod:seed

# Import Excel data (place file at prisma/data.xlsx)
pnpm db:prod:import
```

## Common Operations

### Local Database
- **Setup**: `pnpm db:local:setup` - Migrate + Seed
- **Reset**: `pnpm db:local:reset` - Reset all data
- **Full Reset**: `pnpm db:local:full` - Reset + Setup + Import
- **Studio**: `pnpm db:local:studio` - Open Prisma Studio

### Production Database
- **Setup**: `pnpm db:prod:setup` - Full production setup
- **Connect**: `pnpm db:prod:connect` - Connect to production DB
- **Studio**: `pnpm db:studio` - Open Studio (after connecting)

### Docker Commands
- **Start**: `pnpm docker:up` - Start containers
- **Stop**: `pnpm docker:down` - Stop containers
- **Reset**: `pnpm docker:reset` - Reset containers and data

## Deployment

### Deploy to Fly.io
```bash
# Deploy application
pnpm fly:deploy

# Setup production database
pnpm db:prod:setup

# Check health
pnpm health:db
```

## Database Client Extensions

### Connect to Production Database
1. Start proxy: `pnpm db:prod:connect`
2. Use connection details:
   - Host: `localhost`
   - Port: `5433`
   - Database: `weekly_report_backend`
   - Username: `weekly_report_backend`
   - Password: `AWVq27MHkURo5ns`
   - SSL: Required

### Test Users
After setup, these users are available:
- **CEO001** / 123456 (SUPERADMIN)
- **ADM001** / 123456 (ADMIN)
- **USR001** / 123456 (USER)

## Troubleshooting

### Database Connection Issues
1. Check if database is running: `pnpm fly:status`
2. Restart database: `pnpm fly:restart`
3. Check logs: `pnpm fly:logs:live`

### Local Development Issues
1. Reset Docker: `pnpm docker:reset`
2. Check container status: `docker ps`
3. View logs: `docker logs weekly_report_postgres`

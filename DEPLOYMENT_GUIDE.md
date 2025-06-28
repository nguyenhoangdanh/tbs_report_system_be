# 🚀 Weekly Report Backend - Deployment Guide

## 📋 Quick Start

### 1. Initial Setup (One-time only)
```bash
# Make scripts executable
chmod +x scripts/*.sh

# Setup Fly.io and dependencies
./scripts/setup.sh
```

### 2. Deploy Application
```bash
# Deploy to Fly.io with health checks
./scripts/deploy.sh
```

### 3. Setup Database
```bash
# Setup database and import data
./scripts/setup-database.sh
```

### 4. Import Additional Data (Optional)
```bash
# Import data from Excel file (prisma/data.xlsx)
./scripts/setup-data.sh
```

---

## 🎯 Daily Operations

### Deploy Updates
```bash
./scripts/deploy.sh
```

### Monitor Application
```bash
./scripts/monitor.sh
```

### Check Health
```bash
pnpm health      # Basic health
pnpm health:api  # API health  
pnpm health:db   # Database health
```

### View Logs
```bash
pnpm logs        # Recent logs
pnpm logs:live   # Live logs
```

### Restart Application
```bash
pnpm fly:restart
```

---

## 🗄️ Database Operations

### Setup Database with Proxy
```bash
# Terminal 1: Start proxy
pnpm fly:db-proxy

# Terminal 2: Run operations
npx dotenv -e .env.studio -- npx prisma migrate deploy
npx dotenv -e .env.studio -- tsx prisma/seed.ts
```

### Remote Database Operations
```bash
pnpm fly:migrate  # Run migrations
pnpm fly:seed     # Seed basic data
```

---

## 🔧 Configuration

### Environment Files

**`.env.production`** (Production settings)
```bash
NODE_ENV=production
PORT=8080
DATABASE_URL="postgres://weekly_report_backend:AWVq27MHkURo5ns@weekly-report-backend-db.flycast:5432/weekly_report_backend"
JWT_SECRET="your-secret-here"
FRONTEND_URL=https://weeklyreport-orpin.vercel.app
COOKIE_DOMAIN=weekly-report-backend.fly.dev
```

**`.env.studio`** (Local database access)
```bash
DATABASE_URL="postgres://weekly_report_backend:AWVq27MHkURo5ns@localhost:15432/weekly_report_backend"
DIRECT_URL="postgres://weekly_report_backend:AWVq27MHkURo5ns@localhost:15432/weekly_report_backend"
```

### CORS Configuration
The app is configured to accept requests from:
- `http://localhost:3000` (Local development)
- `https://weeklyreport-orpin.vercel.app` (Production frontend)
- `https://weeklyreportsystem-mu.vercel.app` (Alternative frontend)

### Cookie Configuration
- **Development**: `httpOnly`, `sameSite: 'lax'`, `secure: false`
- **Production**: `httpOnly`, `sameSite: 'none'`, `secure: true`, domain-specific

---

## 🏥 Health Endpoints

| Endpoint | Purpose |
|----------|---------|
| `/health` | Basic app health |
| `/api/health` | API health with system info |
| `/api/health/db` | Database connectivity |

---

## 👤 Default Users

After seeding, these users are available:

| Role | Employee Code | Password |
|------|---------------|----------|
| SUPERADMIN | CEO001 | 123456 |
| ADMIN | ADM001 | 123456 |
| USER | USR001 | 123456 |

---

## 🐛 Troubleshooting

### App Not Starting
```bash
# Check status
pnpm fly:status

# View logs
pnpm logs

# Restart app
pnpm fly:restart

# Deploy fresh
./scripts/deploy.sh
```

### Database Issues
```bash
# Check database health
pnpm health:db

# Setup database via proxy
./scripts/setup-database.sh

# View database logs via SSH
pnpm ssh
cd /app && npx prisma migrate status
```

### CORS Issues
1. Verify frontend URL in allowed origins
2. Check cookie domain configuration
3. Ensure HTTPS in production

### Cookie Issues
1. Check domain configuration
2. Verify sameSite settings
3. Ensure secure flag in production

---

## 📊 Monitoring

### 24/7 Monitoring Setup
The app is configured for 24/7 operation with:
- `auto_stop_machines = false`
- `min_machines_running = 1`
- Multiple health checks every 15-60 seconds
- Automatic restart policy

### Health Check Schedule
- Basic health: Every 15 seconds
- API health: Every 30 seconds  
- Database health: Every 60 seconds

### Monitoring Commands
```bash
# Run monitoring dashboard
./scripts/monitor.sh

# Continuous monitoring
watch -n 30 'curl -s https://weekly-report-backend.fly.dev/health | jq .'
```

---

## 🔗 Useful Links

- **Production API**: https://weekly-report-backend.fly.dev/api
- **Health Check**: https://weekly-report-backend.fly.dev/health
- **Fly.io Dashboard**: https://fly.io/dashboard
- **Database**: weekly-report-backend-db (internal)

---

## 📝 Excel Data Format

For data import (`prisma/data.xlsx`):

| Column | Header | Example |
|--------|--------|---------|
| A | MSNV | EMP001 |
| B | HỌ VÀ TÊN | Nguyễn Văn A |
| C | CD | Nhân viên |
| D | VTCV | Developer |
| E | PHÒNG BAN | IT |
| F | TRỰC THUỘC | Hà Nội |
| G | PHONE | 123456789 |

---

## 🚨 Emergency Procedures

### App Down
1. `./scripts/monitor.sh` - Check status
2. `pnpm fly:restart` - Restart app
3. `./scripts/deploy.sh` - Redeploy if needed

### Database Down
1. `pnpm health:db` - Check database
2. `./scripts/setup-database.sh` - Reinitialize
3. Contact Fly.io support if database server is down

### CORS/Cookie Issues
1. Check frontend URL configuration
2. Verify production environment variables
3. Redeploy with `./scripts/deploy.sh`

---

**💡 Pro Tip**: Always use the scripts (`./scripts/*.sh`) for consistent operations. They include proper error handling and health checks.

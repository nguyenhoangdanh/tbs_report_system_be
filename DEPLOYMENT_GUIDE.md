# 📋 Hướng Dẫn Setup và Deploy Backend NestJS

## 🎯 Tổng Quan

Tài liệu này hướng dẫn toàn bộ quy trình setup database, deploy backend lên Fly.io và đảm bảo hệ thống hoạt động ổn định.

## 🛠️ BƯỚC 0: Setup Prerequisites (BẮT BUỘC)

⚠️ **Quan trọng**: Trước khi bắt đầu, hãy đảm bảo cài đặt đầy đủ prerequisites.

```bash
# Chạy script kiểm tra prerequisites
chmod +x scripts/test-prerequisites.sh
./scripts/test-prerequisites.sh
```

**Nếu script báo lỗi**, xem hướng dẫn chi tiết tại: `SETUP_PREREQUISITES.md`

### Quick Prerequisites Setup:

```bash
# 1. Cài đặt Fly CLI
curl -L https://fly.io/install.sh | sh
echo 'export PATH="$HOME/.fly/bin:$PATH"' >> ~/.bashrc
source ~/.bashrc

# 2. Login Fly.io
fly auth login

# 3. Install dependencies
pnpm install

# 4. Set script permissions
chmod +x scripts/*.sh

# 5. Verify everything
./scripts/test-prerequisites.sh
```

## 📁 Cấu Trúc Project

```
backend/
├── src/
│   ├── common/
│   │   └── prisma.service.ts   # Prisma service với retry logic
│   ├── config/                 # Environment configuration
│   ├── health/                 # Health check endpoints
│   ├── auth/                   # Authentication module
│   ├── users/                  # User management
│   ├── reports/                # Weekly reports
│   └── main.ts                 # Application entry point
├── prisma/
│   ├── schema.prisma          # Database schema
│   ├── seed.ts                # Database seeding
│   └── migrations/            # Database migrations
├── scripts/
│   ├── deploy.sh              # Deployment script
│   ├── db-setup.sh            # Database setup script
│   └── db-connect.sh          # Database connection script
├── .env.production            # Production environment variables
├── fly.toml                   # Fly.io configuration
└── Dockerfile                 # Docker configuration
```

## 🚀 Quy Trình Deploy Hoàn Chỉnh

### 1. Kiểm Tra Prerequisites

```bash
# Kiểm tra tất cả prerequisites
./scripts/test-prerequisites.sh

# Hoặc kiểm tra từng cái:
fly version                    # Should show version, not "command not found"
fly auth whoami               # Should show your email
fly apps list                # Should list your apps
```

### 2. Kiểm Tra và Khởi Động Database

```bash
# Kiểm tra trạng thái database
pnpm fly:status:db

# Nếu database stopped, khởi động lại
pnpm fly:restart:db
```

### 3. Deploy Backend

```bash
# Option 1: Deploy đơn giản
pnpm fly:deploy

# Option 2: Deploy + Setup database tự động (KHUYẾN NGHỊ)
pnpm quick:deploy
```

### 4. Setup Database

```bash
# Setup đầy đủ (migrate + seed + import data)
pnpm db:prod:full

# Hoặc từng bước:
pnpm db:prod:migrate    # Chỉ migration
pnpm db:prod:seed       # Chỉ seed data cơ bản
pnpm db:prod:import     # Chỉ import Excel data
```

### 5. Kiểm Tra Health

```bash
# Kiểm tra tất cả endpoints
pnpm quick:health

# Hoặc từng endpoint riêng lẻ:
pnpm health          # Basic health
pnpm health:api      # API health  
pnpm health:db       # Database health
pnpm health:detailed # Detailed health info
```

### 6. Test Functionality

```bash
# Test login
pnpm test:login

# Xem logs realtime
pnpm fly:logs:live
```

## 🛠️ Troubleshooting Commands

### Database Issues

```bash
# Restart database
pnpm fly:restart:db

# Connect trực tiếp để debug
pnpm db:prod:connect

# Reset database hoàn toàn (CẢNH BÁO: Mất hết data)
pnpm db:prod:reset
```

### Backend Issues

```bash
# Restart backend
pnpm fly:restart

# Xem logs để debug
pnpm fly:logs
pnpm fly:logs:live

# Check status
pnpm fly:status
```

### Connection Issues

```bash
# Test từng bước
curl https://weekly-report-backend.fly.dev/health
curl https://weekly-report-backend.fly.dev/api/health
curl https://weekly-report-backend.fly.dev/api/health/db
```

## 🔧 Các Script Chính

### Deploy Scripts

| Script | Mô tả |
|--------|-------|
| `pnpm fly:deploy` | Deploy backend lên Fly.io |
| `pnpm quick:deploy` | Deploy + setup database tự động |

### Database Scripts

| Script | Mô tả |
|--------|-------|
| `pnpm db:prod:full` | Setup đầy đủ (migrate + seed + import) |
| `pnpm db:prod:migrate` | Chỉ chạy migrations |
| `pnpm db:prod:seed` | Chỉ seed data cơ bản |
| `pnpm db:prod:import` | Chỉ import Excel data |
| `pnpm db:prod:reset` | Reset database (XÓA HẾT DATA) |
| `pnpm db:prod:connect` | Kết nối trực tiếp database |

### Health Check Scripts

| Script | Mô tả |
|--------|-------|
| `pnpm health` | Basic health check |
| `pnpm health:api` | API health check |
| `pnpm health:db` | Database health check |
| `pnpm health:detailed` | Detailed health info |
| `pnpm quick:health` | Kiểm tra tất cả endpoints |

### Monitoring Scripts

| Script | Mô tả |
|--------|-------|
| `pnpm fly:logs` | Xem logs |
| `pnpm fly:logs:live` | Xem logs realtime |
| `pnpm fly:status` | Status backend |
| `pnpm fly:status:db` | Status database |

## 🏥 Health Check Endpoints

### Endpoints có sẵn:

1. **Basic Health**: `GET /health`
   ```json
   {
     "status": "ok",
     "timestamp": "2024-01-01T00:00:00.000Z",
     "uptime": 123.456,
     "environment": "production",
     "version": "1.0.0"
   }
   ```

2. **API Health**: `GET /api/health`
   ```json
   {
     "status": "ok",
     "timestamp": "2024-01-01T00:00:00.000Z"
   }
   ```

3. **Database Health**: `GET /api/health/db`
   ```json
   {
     "status": "ok",
     "database": {
       "status": "healthy",
       "isConnected": true,
       "retryCount": 0,
       "environment": "production"
     },
     "timestamp": "2024-01-01T00:00:00.000Z"
   }
   ```

4. **Detailed Health**: `GET /api/health/detailed`
   ```json
   {
     "status": "ok",
     "timestamp": "2024-01-01T00:00:00.000Z",
     "uptime": 123.456,
     "environment": "production",
     "version": "1.0.0",
     "database": {
       "connection": { /* connection details */ },
       "stats": { /* database statistics */ },
       "migrations": { /* migration status */ }
     },
     "memory": {
       "used": "45 MB",
       "total": "512 MB"
     }
   }
   ```

## 🔐 Test Accounts

Sau khi setup database, các tài khoản test sau sẽ có sẵn:

| Employee Code | Password | Role |
|---------------|----------|------|
| CEO001 | 123456 | SUPERADMIN |
| ADM001 | 123456 | ADMIN |
| USR001 | 123456 | USER |
| 552502356 | 123456 | USER |

## 🌍 Environment Variables

### Production (.env.production)

```bash
# Database
DATABASE_URL="postgres://weekly_report_backend:AWVq27MHkURo5ns@weekly-report-backend-db.flycast:5432/weekly_report_backend"
DIRECT_URL="postgres://weekly_report_backend:AWVq27MHkURo5ns@weekly-report-backend-db.flycast:5432/weekly_report_backend"

# JWT
JWT_SECRET="aJX3NYxZepmbIbxjnRdLcus+VZVIHE0YtXsXjcpNyTA="
JWT_EXPIRES_IN=1d
JWT_REMEMBER_ME_EXPIRES_IN=7d

# App
NODE_ENV=production
PORT=8080

# CORS
FRONTEND_URL=https://weeklyreport-orpin.vercel.app
COOKIE_DOMAIN=weekly-report-backend.fly.dev
```

## 🔄 Connection Stability Features

### PrismaService Features:

1. **Connection Retry**: Tự động retry kết nối với exponential backoff + jitter
2. **Health Checks**: Kiểm tra connection định kỳ với timeout
3. **Graceful Degradation**: Trong production, app vẫn start nếu DB tạm thời không available
4. **Error Logging**: Log chi tiết lỗi connection với troubleshooting hints
5. **Background Connection**: Kết nối database trong background để không block startup

### Connection Features:

- **Timeout Handling**: 15s cho connection, 10s cho queries
- **Connection Pooling**: Prisma tự động handle connection pooling
- **Exponential Backoff**: Delay tăng dần với random jitter
- **Production Mode**: Graceful start ngay cả khi DB chưa sẵn sàng

## 📊 Monitoring & Maintenance

### Daily Checks:

```bash
# Kiểm tra health tổng quát
pnpm quick:health

# Kiểm tra logs có lỗi gì không
pnpm fly:logs | grep -i error

# Test login
pnpm test:login
```

### Weekly Maintenance:

```bash
# Restart services để clear memory
pnpm fly:restart
pnpm fly:restart:db

# Kiểm tra database stats
curl https://weekly-report-backend.fly.dev/api/health/detailed
```

## ⚠️ Important Notes

### Database Management:

1. **KHÔNG BAO GIỜ** chạy `pnpm db:prod:reset` trên production trừ khi thật sự cần thiết
2. Database trên Fly.io có auto-backup, nhưng nên manual backup trước khi làm thay đổi lớn
3. Connection string sử dụng `.flycast` domain cho internal networking

### Security:

1. JWT secrets được generate random và store trong environment
2. Database credentials không được commit vào git
3. CORS được cấu hình strict cho production

### Performance:

1. Database connection pooling được optimize cho production
2. Health checks được schedule để không spam logs
3. Graceful shutdown để đảm bảo không mất data
4. Auto-stop machines = false để luôn available

## 🚨 Emergency Procedures

### Database Down:

```bash
# 1. Kiểm tra status
pnpm fly:status:db

# 2. Restart database
pnpm fly:restart:db

# 3. Đợi 45 giây rồi test
sleep 45 && pnpm health:db

# 4. Nếu vẫn fail, check logs
pnpm fly:logs -a weekly-report-backend-db
```

### Backend Down:

```bash
# 1. Kiểm tra status
pnpm fly:status

# 2. Restart backend
pnpm fly:restart

# 3. Monitor logs
pnpm fly:logs:live

# 4. Test health
pnpm quick:health
```

### Complete System Recovery:

```bash
# 1. Restart everything
pnpm fly:restart:db
sleep 45
pnpm fly:restart
sleep 30

# 2. Full deploy if needed
pnpm quick:deploy

# 3. Verify everything works
pnpm quick:health
pnpm test:login
```

## 🛡️ Fly.io Configuration Highlights

### Backend (fly.toml):
- **auto_stop_machines**: false - Luôn chạy
- **min_machines_running**: 1 - Tối thiểu 1 machine
- **Health checks**: 3 levels (basic, api, database)
- **Memory**: 512MB, CPU: 1 shared core

### Database:
- **PostgreSQL 15** with optimized settings
- **Auto-backup** enabled
- **Internal networking** với .flycast domain

## 📞 Support & Debugging

### Nếu gặp vấn đề:

1. **Check logs**: `pnpm fly:logs:live`
2. **Test từng component**: `pnpm quick:health`
3. **Check Fly.io status**: https://status.fly.io/
4. **Restart services**: `pnpm fly:restart` và `pnpm fly:restart:db`

### Common Issues:

| Vấn đề | Giải pháp |
|--------|-----------|
| Database connection timeout | `pnpm fly:restart:db` |
| Backend 500 errors | `pnpm fly:restart` |
| Login không hoạt động | Check CORS settings |
| Health check failed | Wait 2-3 minutes after restart |

---

*Tài liệu này được cập nhật định kỳ. Phiên bản hiện tại hỗ trợ NestJS với Prisma, PostgreSQL trên Fly.io.*

# 🔧 Troubleshooting Guide

## 🚨 Common Issues & Solutions

### 1. Database Connection Issues

#### ❌ Problem: "Database connection failed"
```
❌ Connection failed (1/5): getaddrinfo ENOTFOUND weekly-report-backend-db.flycast
```

**Solutions:**
```bash
# Check if database is running
pnpm fly:status:db

# If stopped, restart it
pnpm fly:restart:db

# Wait for startup
sleep 45

# Test connection
pnpm health:db
```

#### ❌ Problem: "Connection timeout after 15s"
```
❌ Connection failed: Connection timeout after 15s
```

**Solutions:**
```bash
# Restart database with longer wait
pnpm fly:restart:db
sleep 60  # Wait longer

# Check database logs
pnpm fly:logs -a weekly-report-backend-db

# If persistent, check Fly.io status
# https://status.fly.io/
```

### 2. Backend Issues

#### ❌ Problem: "Failed to create app instance"
```
❌ Failed to create app (attempt 1/5): Cannot resolve dependency...
```

**Solutions:**
```bash
# Restart backend
pnpm fly:restart

# If still failing, redeploy
pnpm fly:deploy

# Check logs for specific errors
pnpm fly:logs:live
```

#### ❌ Problem: "Health check failed"
```
Health check on port 8080 failed
```

**Solutions:**
```bash
# Check app status
pnpm fly:status

# Restart backend
pnpm fly:restart

# Wait for startup
sleep 30

# Test health endpoints
pnpm quick:health
```

### 3. Authentication Issues

#### ❌ Problem: "401 Unauthorized"
```json
{
  "statusCode": 401,
  "message": "Invalid credentials"
}
```

**Solutions:**
```bash
# Verify test account exists
pnpm db:prod:connect
# In another terminal: pnpm db:studio
# Check Users table for CEO001

# Reset test users
pnpm db:prod:seed

# Test login again
pnpm test:login
```

#### ❌ Problem: "CORS error"
```
Access to fetch at 'https://weekly-report-backend.fly.dev/api/auth/login' 
from origin 'https://weeklyreport-orpin.vercel.app' has been blocked by CORS policy
```

**Solutions:**
1. Check `.env.production` has correct `FRONTEND_URL`
2. Verify CORS settings in `EnvironmentConfig`
3. Restart backend: `pnpm fly:restart`

### 4. Deployment Issues

#### ❌ Problem: "Build failed"
```
Error: build failed
```

**Solutions:**
```bash
# Check Dockerfile syntax
cat Dockerfile

# Validate fly.toml
fly config validate

# Clean and rebuild
rm -rf dist node_modules
pnpm install
pnpm build

# Try deploy again
pnpm fly:deploy
```

#### ❌ Problem: "Database migration failed"
```
Migration failed: relation "User" does not exist
```

**Solutions:**
```bash
# Connect to database
pnpm db:prod:connect

# Reset and recreate schema
pnpm db:prod:reset  # ⚠️ DELETES ALL DATA!

# Or just run migrations
pnpm db:prod:migrate
```

### 5. Performance Issues

#### ❌ Problem: "Slow response times"

**Solutions:**
```bash
# Check memory usage
curl https://weekly-report-backend.fly.dev/api/health/detailed

# Restart to clear memory
pnpm fly:restart

# Monitor logs
pnpm fly:logs:live
```

#### ❌ Problem: "Connection pool exhausted"

**Solutions:**
```bash
# Restart database
pnpm fly:restart:db

# Check concurrent connections in logs
pnpm fly:logs | grep -i "connection"

# Monitor database performance
curl https://weekly-report-backend.fly.dev/api/health/db
```

## 🔍 Diagnostic Commands

### Quick Diagnostics
```bash
# Full system check
echo "=== Backend Status ==="
pnpm fly:status

echo "=== Database Status ==="
pnpm fly:status:db

echo "=== Health Checks ==="
pnpm quick:health

echo "=== Login Test ==="
pnpm test:login
```

### Log Analysis
```bash
# Recent errors
pnpm fly:logs | grep -i error | tail -20

# Database connection logs
pnpm fly:logs | grep -i "database\|connection" | tail -10

# Health check failures
pnpm fly:logs | grep -i "health" | tail -10
```

### Database Diagnostics
```bash
# Connect and check tables
pnpm db:prod:connect

# In another terminal, check database stats
curl -s https://weekly-report-backend.fly.dev/api/health/detailed | jq '.database'
```

## 📊 Monitoring Scripts

### /home/hoangdanh2000/Desktop/TBS Group/bento-nestjs/weekly-work-report-system/backend/scripts/monitor.sh

```bash
#!/bin/bash
# Monitor script for production

echo "🔍 Weekly Report Backend Monitor"
echo "================================"

# Check backend status
echo "📱 Backend Status:"
curl -s https://weekly-report-backend.fly.dev/health | jq '.'

echo -e "\n📊 Database Health:"
curl -s https://weekly-report-backend.fly.dev/api/health/db | jq '.'

echo -e "\n🧪 Login Test:"
LOGIN_RESPONSE=$(curl -s -X POST https://weekly-report-backend.fly.dev/api/auth/login \
  -H "Content-Type: application/json" \
  -H "Origin: https://weeklyreport-orpin.vercel.app" \
  -d '{"employeeCode":"CEO001","password":"123456"}')

if echo "$LOGIN_RESPONSE" | grep -q "access_token"; then
  echo "✅ Login successful"
else
  echo "❌ Login failed"
  echo "$LOGIN_RESPONSE"
fi

echo -e "\n📈 System Resources:"
curl -s https://weekly-report-backend.fly.dev/api/health/detailed | jq '.memory'
```

## 🚨 Emergency Recovery Procedures

### Complete System Recovery
```bash
#!/bin/bash
echo "🚨 EMERGENCY RECOVERY PROCEDURE"
echo "This will restart everything and may cause downtime"
read -p "Continue? (y/N): " confirm

if [ "$confirm" = "y" ]; then
  echo "1. Restarting database..."
  pnpm fly:restart:db
  sleep 60
  
  echo "2. Restarting backend..."
  pnpm fly:restart
  sleep 30
  
  echo "3. Setting up database..."
  pnpm db:prod:full
  
  echo "4. Testing system..."
  sleep 30
  pnpm quick:health
  pnpm test:login
  
  echo "✅ Recovery complete!"
else
  echo "❌ Recovery cancelled"
fi
```

### Database Recovery
```bash
#!/bin/bash
echo "🗄️ DATABASE RECOVERY PROCEDURE"
echo "⚠️ WARNING: This may delete data!"
read -p "Continue? (y/N): " confirm

if [ "$confirm" = "y" ]; then
  echo "1. Backing up current state..."
  # Add backup logic here if needed
  
  echo "2. Resetting database..."
  pnpm db:prod:reset
  
  echo "3. Re-seeding data..."
  pnpm db:prod:seed
  
  echo "4. Testing database..."
  pnpm health:db
  
  echo "✅ Database recovery complete!"
fi
```

## 📞 Support Escalation

### When to escalate:

1. **Database down > 10 minutes**
2. **Backend returning 500 errors consistently**
3. **Authentication completely broken**
4. **Fly.io platform issues**

### Escalation checklist:

- [ ] Tried basic restart commands
- [ ] Checked Fly.io status page
- [ ] Reviewed recent logs
- [ ] Attempted emergency recovery
- [ ] Documented error messages
- [ ] Noted time and duration of issue

---

💡 **Remember**: Most issues can be resolved with a simple restart. Always try `pnpm fly:restart` and `pnpm fly:restart:db` first!
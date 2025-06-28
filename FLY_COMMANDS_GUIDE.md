# 🚀 Fly.io Commands Guide for Weekly Report System

## 📋 Mục lục

1. [Cài đặt và cấu hình ban đầu](#cài-đặt-và-cấu-hình-ban-đầu)
2. [Quản lý ứng dụng](#quản-lý-ứng-dụng)
3. [Quản lý database](#quản-lý-database)
4. [Import và seed data](#import-và-seed-data)
5. [Debugging và monitoring](#debugging-và-monitoring)
6. [Best practices](#best-practices)

---

## 🔧 Cài đặt và cấu hình ban đầu

### Setup Fly.io CLI
```bash
# Setup Fly CLI (chỉ chạy 1 lần)
pnpm run fly:setup

# Login vào Fly.io
pnpm run fly:login

# Launch ứng dụng mới (chỉ chạy 1 lần khi tạo project)
pnpm run fly:launch
```

**Khi nào sử dụng:**
- Lần đầu tiên setup project trên Fly.io
- Khi setup trên máy mới

---

## 🚀 Quản lý ứng dụng

### Deploy và quản lý app

```bash
# Deploy ứng dụng
pnpm run deploy

# Deploy với migration tự động
pnpm run fly:deploy-with-migrate

# Kiểm tra trạng thái app
pnpm run fly:status

# Restart app
pnpm run fly:start

# Xem logs realtime
pnpm run logs

# SSH vào container
pnpm run ssh
```

**Khi nào sử dụng:**
- `deploy`: Khi có thay đổi code
- `fly:deploy-with-migrate`: Khi có thay đổi database schema
- `fly:status`: Khi muốn kiểm tra app có đang chạy không
- `fly:start`: Khi app bị stop hoặc crash
- `logs`: Khi debug lỗi
- `ssh`: Khi cần truy cập trực tiếp vào container

---

## 🗄️ Quản lý database

### Database operations

```bash
# Chạy migration
pnpm run fly:migrate

# Kiểm tra trạng thái migration
pnpm run fly:db-status

# Reset database (XÓA TẤT CẢ DATA!)
pnpm run fly:db-reset

# Xem environment variables
pnpm run fly:secrets
```

**Khi nào sử dụng:**
- `fly:migrate`: Sau khi có migration mới
- `fly:db-status`: Kiểm tra migration nào đã chạy
- `fly:db-reset`: ⚠️ **NGUY HIỂM** - Chỉ dùng khi muốn reset toàn bộ data
- `fly:secrets`: Kiểm tra config có đúng không

---

## 📊 Import và seed data

### Phương pháp 1: Sử dụng proxy (Khuyên dùng)

```bash
# Bước 1: Khởi động proxy (Terminal 1)
pnpm run fly:setup-fresh

# Bước 2: Reset và seed basic data (Terminal 2)
pnpm run fly:reset-and-seed

# Hoặc import all data từ Excel
npx dotenv -e .env.studio -- tsx prisma/import-all-data-from-excel.ts
```

### Phương pháp 2: Scripts tự động (Có thể không ổn định)

```bash
# Reset database và seed basic data
pnpm run fly:seed-basic

# Import toàn bộ data từ Excel
pnpm run fly:import-all-auto

# Reset database local qua proxy
pnpm run fly:db-reset-local
```

### Phương pháp 3: Remote (Cần app đang chạy)

```bash
# Seed basic data trên server
pnpm run fly:seed-remote

# Import data từ Excel trên server
pnpm run fly:import-all-remote
```

**Khi nào sử dụng:**
- **Phương pháp 1**: Luôn dùng, ổn định nhất
- **Phương pháp 2**: Khi muốn tự động hóa, nhưng có thể fail
- **Phương pháp 3**: Khi app đang chạy và muốn import nhanh

---

## 🔍 Debugging và monitoring

### Kiểm tra và debug

```bash
# Xem logs chi tiết
pnpm run logs

# Kiểm tra database qua API
curl https://weekly-report-backend.fly.dev/api/health/db

# Kiểm tra app status
curl https://weekly-report-backend.fly.dev/api/health

# Mở Prisma Studio với production database
# Terminal 1:
pnpm run fly:setup-fresh
# Terminal 2:
DATABASE_URL="postgres://weekly_report_backend:AWVq27MHkURo5ns@localhost:15432/weekly_report_backend" pnpm db:studio
```

**Khi nào sử dụng:**
- Khi API trả về lỗi 500
- Khi muốn xem data trong database
- Khi debug connection issues

---

## 📁 File cấu hình quan trọng

### `.env.studio` (Cần tạo)
```properties
DATABASE_URL="postgres://weekly_report_backend:AWVq27MHkURo5ns@localhost:15432/weekly_report_backend"
DIRECT_URL="postgres://weekly_report_backend:AWVq27MHkURo5ns@localhost:15432/weekly_report_backend"
```

### `data.xlsx` (Cần có trong thư mục prisma/)
- Cột A: MSNV
- Cột B: HỌ VÀ TÊN  
- Cột C: CD (Chức danh)
- Cột D: VTCV (Vị trí công việc)
- Cột E: PHÒNG BAN
- Cột F: TRỰC THUỘC
- Cột G: PHONE

---

## ⚡ Best Practices

### 1. Workflow thông thường

```bash
# 1. Kiểm tra app status
pnpm run fly:status

# 2. Nếu app stopped, trigger bằng API call
curl https://weekly-report-backend.fly.dev/api/health

# 3. Deploy code changes
pnpm run deploy

# 4. Kiểm tra logs
pnpm run logs

# 5. Test API
curl https://weekly-report-backend.fly.dev/api/health/db
```

### 2. Khi setup database lần đầu

```bash
# 1. Deploy app trước
pnpm run deploy

# 2. Setup database với proxy
# Terminal 1:
pnpm run fly:setup-fresh

# Terminal 2:
pnpm run fly:reset-and-seed
npx dotenv -e .env.studio -- tsx prisma/import-all-data-from-excel.ts
```

### 3. Khi có lỗi

```bash
# 1. Xem logs trước
pnpm run logs

# 2. Kiểm tra app status
pnpm run fly:status

# 3. Nếu app stopped, restart
pnpm run fly:start

# 4. Nếu database lỗi, check migration
pnpm run fly:db-status
```

---

## 🚨 Lưu ý quan trọng

### ⚠️ Commands nguy hiểm
- `fly:db-reset` - Xóa toàn bộ data
- `fly:db-reset-local` - Xóa toàn bộ data qua proxy

### 🔧 Troubleshooting thường gặp

**1. "No started VMs" - App không khởi động**
```bash
# Cách 1: Trigger app bằng API call
curl https://weekly-report-backend.fly.dev/api/health
sleep 30
pnpm run fly:status

# Cách 2: Deploy lại
pnpm run deploy

# Cách 3: Sử dụng proxy thay vì SSH
# Terminal 1:
pnpm run fly:setup-fresh
# Terminal 2:
pnpm run fly:reset-and-seed
```

**2. "Can't reach database"**
```bash
# Kiểm tra proxy có chạy không
pnpm run fly:setup-fresh
```

**3. "Address already in use"**
```bash
# Kill proxy cũ
pkill -f 'fly proxy'
```

**4. "Migration failed" hoặc SSH không work**
```bash
# Dùng proxy thay vì SSH
# Terminal 1:
pnpm run fly:setup-fresh
# Terminal 2:
npx dotenv -e .env.studio -- npx prisma migrate deploy
```

---

## 📞 Test API Endpoints

```bash
# Health check
curl https://weekly-report-backend.fly.dev/api/health

# Database status
curl https://weekly-report-backend.fly.dev/api/health/db

# Login test
curl -X POST https://weekly-report-backend.fly.dev/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"employeeCode":"CEO001","password":"123456"}'
```

---

## 🎯 Default Users (Sau khi seed)

```
SUPERADMIN: CEO001 / ceo@company.com / 123456
ADMIN: ADM001 / admin@company.com / 123456  
USER: USR001 / user@company.com / 123456
```

---

**💡 Tip**: Luôn sử dụng phương pháp proxy (Terminal 1 + Terminal 2) vì nó ổn định nhất và dễ debug khi có lỗi.

## 🚀 Workflow khuyên dùng khi app không start

**Khi gặp "No started VMs":**

```bash
# 1. Sử dụng proxy để làm việc với database
# Terminal 1:
pnpm run fly:setup-fresh

# Terminal 2: Reset và seed data
pnpm run fly:reset-and-seed

# 3. Import Excel data
npx dotenv -e .env.studio -- tsx prisma/import-all-data-from-excel.ts

# 4. Trigger app bằng API call
curl https://weekly-report-backend.fly.dev/api/health

# 5. Test API
curl https://weekly-report-backend.fly.dev/api/health/db
```

**Ưu điểm của phương pháp proxy:**
- ✅ Không cần app phải chạy
- ✅ Chỉ cần database server hoạt động
- ✅ Ổn định và dễ debug
- ✅ Có thể làm việc offline với production database

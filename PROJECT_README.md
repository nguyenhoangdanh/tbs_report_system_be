# Weekly Work Report System - Backend

Hệ thống quản lý báo cáo công việc hàng tuần cho công ty sản xuất được xây dựng với NestJS và PostgreSQL.

## 🚀 Tính năng chính

### Xác thực và phân quyền
- **3 cấp độ quyền**: SUPERADMIN, ADMIN, USER
- **JWT Authentication** với access token
- **Role-based access control** cho từng API endpoint

### Quản lý báo cáo hàng tuần
- ✅ Mỗi user chỉ được tạo 1 báo cáo/tuần
- ✅ 11 task cố định cho mỗi báo cáo
- ✅ Đánh dấu hoàn thành theo từng ngày trong tuần
- ✅ Tự động khóa báo cáo sau 10h sáng Thứ 7
- ✅ Có thể xóa và tạo lại báo cáo (trước khi bị khóa)

### Phân quyền xem báo cáo
- **USER**: Chỉ xem báo cáo của mình
- **ADMIN**: Xem báo cáo toàn bộ nhân viên trong cùng office
- **SUPERADMIN**: Xem toàn bộ + thống kê

### Cấu trúc tổ chức
- **1 HEAD_OFFICE** + **3 FACTORY_OFFICE**
- **Departments** thuộc từng Office
- **Positions** chung cho toàn công ty

## 🛠️ Công nghệ sử dụng

- **NestJS** - Node.js framework
- **PostgreSQL** - Database
- **Prisma ORM** - Database toolkit
- **JWT** - Authentication
- **bcrypt** - Password hashing
- **class-validator** - DTO validation
- **@nestjs/schedule** - Cron jobs

## 📦 Cài đặt

### 1. Clone và cài đặt dependencies

```bash
cd backend
pnpm install
```

### 2. Cấu hình môi trường

Cập nhật file `.env`:

```env
# Database - Thay bằng connection string của bạn
DATABASE_URL="postgresql://username:password@localhost:5432/weekly_report_db"

# JWT Configuration
JWT_SECRET="your-super-secret-jwt-key-change-this-in-production-2024"
JWT_EXPIRES_IN="7d"

# Application Configuration
NODE_ENV="development"
PORT=3000

# CORS Configuration
CORS_ORIGIN="http://localhost:3001"
```

### 3. Khởi tạo database

```bash
# Tạo migration và generate client
pnpm run db:migrate

# Seed dữ liệu mẫu
pnpm run db:seed
```

### 4. Chạy ứng dụng

```bash
# Development mode
pnpm run start:dev

# Production mode
pnpm run build
pnpm run start:prod
```

## 📊 Dữ liệu mẫu sau khi seed

### Tài khoản mẫu (password: `123456`)

| Email | Role | Mô tả |
|-------|------|-------|
| `admin@company.com` | SUPERADMIN | Tổng giám đốc |
| `factory1@company.com` | ADMIN | Giám đốc nhà máy 1 |
| `factory2@company.com` | ADMIN | Giám đốc nhà máy 2 |
| `factory3@company.com` | ADMIN | Giám đốc nhà máy 3 |
| `user1@company.com` | USER | Nhân viên thường |

### Cấu trúc tổ chức mẫu

**Offices:**
- Văn phòng điều hành tổng (HEAD_OFFICE)
- Nhà máy 1, 2, 3 (FACTORY_OFFICE)

**Departments:**
- Ban Giám đốc, Phòng Nhân sự, Phòng Kế toán (Head Office)
- Phòng Sản xuất, Phòng Kỹ thuật, Phòng Kiểm tra chất lượng (Factories)

## 🔗 API Endpoints

### Authentication
```
POST /api/auth/register     # Đăng ký tài khoản
POST /api/auth/login        # Đăng nhập
PUT  /api/auth/change-password  # Đổi mật khẩu
```

### User Management
```
GET /api/users/me           # Thông tin cá nhân
PUT /api/users/me           # Cập nhật thông tin
GET /api/users/office       # Danh sách user trong office (ADMIN+)
GET /api/users/all          # Tất cả users (SUPERADMIN)
```

### Reports
```
POST   /api/reports         # Tạo báo cáo tuần
GET    /api/reports/me      # Báo cáo của tôi
GET    /api/reports/me/:week/:year  # Báo cáo tuần cụ thể
PATCH  /api/reports/:id     # Cập nhật báo cáo
DELETE /api/reports/:id     # Xóa báo cáo

GET /api/reports/office     # Báo cáo office (ADMIN+)
GET /api/reports/all        # Tất cả báo cáo (SUPERADMIN)
GET /api/reports/statistics # Thống kê (SUPERADMIN)
```

### Organization
```
GET /api/offices            # Danh sách văn phòng
GET /api/departments        # Danh sách phòng ban
GET /api/positions          # Danh sách chức vụ
```

## ⏰ Scheduled Tasks

### Tự động khóa báo cáo
- **Thời gian**: Mỗi Thứ 7 lúc 10:00 AM
- **Múi giờ**: Asia/Ho_Chi_Minh
- **Chức năng**: Khóa tất cả báo cáo của tuần hiện tại

## 🔧 Scripts hữu ích

```bash
# Database
pnpm run db:migrate     # Tạo migration mới
pnpm run db:generate    # Generate Prisma client
pnpm run db:seed        # Seed dữ liệu mẫu
pnpm run db:studio      # Mở Prisma Studio
pnpm run db:reset       # Reset database

# Development
pnpm run start:dev      # Chạy development mode
pnpm run build          # Build production
pnpm run lint           # Kiểm tra code style
```

---

**💡 Lưu ý**: Đây là backend API, cần frontend để có giao diện người dùng hoàn chỉnh.

## 🎯 Hướng dẫn test API

Sau khi chạy `pnpm run start:dev`, API sẽ có sẵn tại `http://localhost:3000/api`

### 1. Đăng nhập
```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "admin@company.com", "password": "123456"}'
```

### 2. Tạo báo cáo (sử dụng token từ bước 1)
```bash
curl -X POST http://localhost:3000/api/reports \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "weekNumber": 25,
    "year": 2025,
    "tasks": [
      {"taskName": "Task 1", "monday": true, "tuesday": true},
      {"taskName": "Task 2", "monday": false, "tuesday": true},
      // ... 9 tasks khác
    ]
  }'
```

# Installation Guide

## Quick Install Script (Windows)

Create and run this batch file to automate the installation:

```batch
@echo off
echo Installing Weekly Report System Backend...
echo.

echo Step 1: Checking Node.js...
node --version >nul 2>&1
if errorlevel 1 (
    echo Node.js not found. Please install Node.js from https://nodejs.org/
    echo Download LTS version and run the installer.
    pause
    exit /b 1
)

echo Step 2: Installing pnpm...
npm install -g pnpm

echo Step 3: Installing project dependencies...
pnpm install

echo Step 4: Checking Docker...
docker --version >nul 2>&1
if errorlevel 1 (
    echo Docker not found. Starting Docker Desktop installation...
    echo Please download Docker Desktop from:
    echo https://www.docker.com/products/docker-desktop/
    pause
    exit /b 1
)

echo Step 5: Starting Docker containers...
pnpm docker:up

echo Step 6: Waiting for database to start...
timeout /t 30 /nobreak

echo Step 7: Setting up database...
pnpm db:local:setup

echo Step 8: Testing installation...
pnpm health:api

echo.
echo Installation completed!
echo You can now start development with: pnpm start:dev
echo API Documentation: http://localhost:8080/api
echo.
pause
```

## Manual Installation Steps

### 1. Download and Install Docker Desktop

#### Windows Installation
1. Go to https://www.docker.com/products/docker-desktop/
2. Download "Docker Desktop for Windows"
3. Run installer as Administrator
4. Choose "Use WSL 2 instead of Hyper-V" 
5. Complete installation and restart computer
6. Start Docker Desktop from Start menu
7. Wait for Docker to fully start

#### Verify Docker Installation
```bash
# Open PowerShell or Command Prompt
docker --version
docker compose version
docker run hello-world
```

### 2. Install Node.js and pnpm

#### Install Node.js
1. Go to https://nodejs.org/
2. Download LTS version (Long Term Support)
3. Run installer with default settings
4. Restart terminal/command prompt

#### Install pnpm
```bash
# Install pnpm package manager
npm install -g pnpm

# Verify installation
pnpm --version
```

### 3. Setup Project

#### Clone or Navigate to Project
```bash
# If you have the project files
cd "D:\TBS Group\SOFTWARE\tbs_report_system_be"

# Install all dependencies
pnpm install
```

#### Start Database
```bash
# Make sure Docker Desktop is running
docker ps

# Start PostgreSQL and Redis containers
pnpm docker:up

# Check containers are running
pnpm docker:status
```

#### Setup Database Schema
```bash
# Run database migrations and seed data
pnpm db:local:setup

# Alternatively, run commands separately:
# pnpm db:generate        # Generate Prisma client
# pnpm db:local:migrate   # Run migrations
# pnpm db:local:seed      # Seed initial data
```

#### Start Development Server
```bash
# Start the backend API server
pnpm start:dev

# Or do full setup in one command
pnpm dev:full
```

### 4. Verify Installation

#### Check Services
```bash
# Test basic health
curl http://localhost:8080/health

# Test API health
curl http://localhost:8080/api/health

# Test database health
curl http://localhost:8080/api/health/db
```

#### Open in Browser
- **API Health**: http://localhost:8080/health
- **API Documentation**: http://localhost:8080/api
- **Database Browser**: Run `pnpm db:local:studio`

## Alternative Installation (Without Docker)

If you prefer not to use Docker:

### 1. Install PostgreSQL Directly

#### Windows PostgreSQL Installation
1. Download from https://www.postgresql.org/download/windows/
2. Install with default settings
3. Remember the password for 'postgres' user
4. Use port 5432 (default)

#### Create Database
```sql
-- Using pgAdmin or psql command line
CREATE DATABASE weekly_report_dev;
```

### 2. Configure Environment
```bash
# Create .env.local file with direct database connection
echo 'NODE_ENV=development
PORT=8080
DATABASE_URL="postgresql://postgres:your_password@localhost:5432/weekly_report_dev?schema=public"
DIRECT_URL="postgresql://postgres:your_password@localhost:5432/weekly_report_dev?schema=public"
JWT_SECRET="dev-secret-key-change-in-production"
JWT_EXPIRES_IN="7d"
FRONTEND_URL="http://localhost:3000"
CORS_ORIGINS="http://localhost:3000,http://127.0.0.1:3000"
COOKIE_DOMAIN="localhost"
COOKIE_SECURE=false' > .env.local
```

### 3. Setup and Run
```bash
# Install dependencies
pnpm install

# Setup database
pnpm db:local:setup

# Start development server
pnpm start:dev
```

## Troubleshooting

### Docker Issues
- **Docker not starting**: Restart Docker Desktop, check WSL2 is enabled
- **Port conflicts**: Change port in docker-compose.yml or stop conflicting services
- **Container fails**: Check logs with `pnpm docker:logs`

### Database Issues
- **Connection failed**: Ensure containers are running with `pnpm docker:status`
- **Migration errors**: Reset with `pnpm db:local:reset`
- **Permission errors**: Run as Administrator on Windows

### Node.js Issues
- **Command not found**: Restart terminal, check PATH environment variable
- **Permission errors**: Run terminal as Administrator or configure npm prefix

## Quick Commands Reference

```bash
# Installation
pnpm install                    # Install dependencies

# Docker
pnpm docker:up                 # Start containers
pnpm docker:down               # Stop containers
pnpm docker:status             # Check status
pnpm docker:logs               # View logs

# Database
pnpm db:local:setup            # Setup database
pnpm db:local:reset            # Reset database
pnpm db:local:studio           # Database browser

# Development
pnpm start:dev                 # Start dev server
pnpm dev:full                  # Full setup + start
pnpm dev:reset                 # Reset everything

# Health checks
pnpm health                    # Basic health
pnpm health:api                # API health
pnpm health:db                 # Database health
```

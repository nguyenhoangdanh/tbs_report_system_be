# Quick Start Guide

## Prerequisites Installation

### Step 1: Install Docker Desktop (Windows)

#### Download and Install Docker Desktop
1. **Download Docker Desktop**
   - Go to https://www.docker.com/products/docker-desktop/
   - Click "Download for Windows"
   - Download the installer (Docker Desktop Installer.exe)

2. **Install Docker Desktop**
   ```bash
   # Run the installer as Administrator
   # Follow the installation wizard
   # Choose "Use WSL 2 instead of Hyper-V" when prompted
   # Complete installation and restart computer
   ```

3. **Start Docker Desktop**
   - Search for "Docker Desktop" in Start menu
   - Launch Docker Desktop application
   - Wait for Docker to start (whale icon in system tray should be stable)
   - Accept license agreement if prompted

4. **Verify Docker Installation**
   ```bash
   # Open Command Prompt or PowerShell
   docker --version
   # Should show: Docker version 24.x.x
   
   docker compose version
   # Should show: Docker Compose version v2.x.x
   
   # Test Docker is working
   docker run hello-world
   # Should download and run a test container
   ```

### Step 2: Install Node.js and pnpm

#### Install Node.js
1. **Download Node.js**
   - Go to https://nodejs.org/
   - Download LTS version (recommended)
   - Run the installer and follow the wizard

2. **Verify Node.js Installation**
   ```bash
   node --version
   # Should show: v18.x.x or v20.x.x
   
   npm --version
   # Should show: 9.x.x or 10.x.x
   ```

3. **Install pnpm**
   ```bash
   # Install pnpm globally
   npm install -g pnpm
   
   # Verify pnpm installation
   pnpm --version
   # Should show: 8.x.x or 9.x.x
   ```

### Step 3: Alternative - No Docker Setup (Optional)

If you prefer not to use Docker, you can install PostgreSQL directly:

#### Install PostgreSQL on Windows
1. **Download PostgreSQL**
   - Go to https://www.postgresql.org/download/windows/
   - Download PostgreSQL installer
   - Install with default settings
   - Remember the password you set for 'postgres' user

2. **Create Development Database**
   ```sql
   -- Connect to PostgreSQL using pgAdmin or psql
   CREATE DATABASE weekly_report_dev;
   CREATE USER postgres WITH PASSWORD 'password';
   GRANT ALL PRIVILEGES ON DATABASE weekly_report_dev TO postgres;
   ```

3. **Update Environment File**
   ```bash
   # Create .env.local with direct PostgreSQL connection
   DATABASE_URL="postgresql://postgres:password@localhost:5432/weekly_report_dev?schema=public"
   ```

## Local Development Setup

### Option A: With Docker (Recommended)

#### 1. Setup Project
```bash
# Navigate to project directory
cd "D:\TBS Group\SOFTWARE\tbs_report_system_be"

# Install dependencies
pnpm install

# Make sure Docker Desktop is running
# Check Docker status
docker ps
# Should show running containers or empty list (not error)

# Start local database containers
pnpm docker:up

# Wait for containers to start (about 30-60 seconds)
# Check if containers are running
pnpm docker:status
```

#### 2. Setup Database
```bash
# Generate Prisma client
pnpm db:generate

# Run database migrations
pnpm db:local:migrate

# Seed initial data
pnpm db:local:seed

# Or do everything in one command
pnpm db:local:setup
```

#### 3. Start Development Server
```bash
# Start the development server
pnpm start:dev

# Or do full setup + start server
pnpm dev:full
```

### Option B: Without Docker (Direct PostgreSQL)

#### 1. Setup Project with Direct Database
```bash
# Navigate to project directory
cd "D:\TBS Group\SOFTWARE\tbs_report_system_be"

# Install dependencies
pnpm install

# Create .env.local file
echo 'NODE_ENV=development
PORT=8080
DATABASE_URL="postgresql://postgres:password@localhost:5432/weekly_report_dev?schema=public"
DIRECT_URL="postgresql://postgres:password@localhost:5432/weekly_report_dev?schema=public"
JWT_SECRET="dev-secret-key-change-in-production"
JWT_EXPIRES_IN="7d"
FRONTEND_URL="http://localhost:3000"
CORS_ORIGINS="http://localhost:3000,http://127.0.0.1:3000"
COOKIE_DOMAIN="localhost"
COOKIE_SECURE=false' > .env.local

# Setup database
pnpm db:local:setup

# Start development server
pnpm start:dev
```

## Troubleshooting Installation Issues

### Docker Issues
1. **"Docker not found" error**
   ```bash
   # Make sure Docker Desktop is installed and running
   # Check if Docker Desktop app is in system tray
   # Restart Docker Desktop if needed
   ```

2. **"docker compose not recognized"**
   ```bash
   # Try with hyphen (older version)
   docker-compose --version
   
   # If that works, update package.json scripts to use docker-compose
   # Or update Docker Desktop to latest version
   ```

3. **WSL2 Error on Windows**
   ```bash
   # Install WSL2 if prompted
   # Download WSL2 update: https://aka.ms/wsl2kernel
   # Enable WSL2 in Docker Desktop settings
   ```

4. **Port conflicts**
   ```bash
   # Check if port 5433 is already in use
   netstat -ano | findstr :5433
   
   # Stop any PostgreSQL services using that port
   # Or change port in docker-compose.yml
   ```

### Node.js Issues
1. **"node not found" error**
   ```bash
   # Restart terminal after Node.js installation
   # Or add Node.js to PATH manually
   ```

2. **Permission errors (Windows)**
   ```bash
   # Run terminal as Administrator
   # Or change npm global directory
   npm config set prefix "C:\Users\%USERNAME%\AppData\Roaming\npm"
   ```

### Database Issues
1. **Connection timeout**
   ```bash
   # Wait longer for containers to start
   # Check container logs
   pnpm docker:logs
   
   # Restart containers
   pnpm docker:restart
   ```

2. **Migration errors**
   ```bash
   # Reset database and try again
   pnpm db:local:reset
   pnpm db:local:setup
   ```

## Verification Steps

### 1. Check All Services
```bash
# Check Docker containers (if using Docker)
pnpm docker:status
# Should show postgres and redis containers running

# Check application health
curl http://localhost:8080/health
# Should return: {"status":"ok",...}

# Check API health
curl http://localhost:8080/api/health
# Should return API status

# Check database health
curl http://localhost:8080/api/health/db
# Should return database connection status
```

### 2. Test in Browser
- **Basic Health**: http://localhost:8080/health
- **API Documentation**: http://localhost:8080/api
- **Database Health**: http://localhost:8080/api/health/db

### 3. Test Database Connection
```bash
# Open Prisma Studio to browse database
pnpm db:local:studio
# Should open browser with database interface

# Or test with database query
pnpm db:local:migrate
# Should show "Database is up to date"
```

## Common Development Commands

### Daily Development
```bash
# Start everything
pnpm dev:full

# Or step by step
pnpm docker:up          # Start database
pnpm start:dev          # Start development server

# Reset everything when needed
pnpm dev:reset          # Reset database and restart
```

### Database Operations
```bash
# Local database
pnpm db:local:setup     # Migrate + seed
pnpm db:local:reset     # Reset all data
pnpm db:local:studio    # Open database browser
pnpm db:local:import    # Import Excel data

# Docker operations
pnpm docker:up          # Start containers
pnpm docker:down        # Stop containers
pnpm docker:restart     # Restart containers
pnpm docker:status      # Check status
pnpm docker:logs        # View logs
```

## Production Deployment

### 1. Deploy to Fly.io
```bash
# Deploy application and setup database
pnpm quick:deploy

# Or step by step:
pnpm fly:deploy
pnpm fly:setup
```

### 2. Health Checks
```bash
# Check all health endpoints
pnpm quick:health

# Individual health checks
pnpm health          # Basic health
pnpm health:api      # API health
pnpm health:db       # Database health
pnpm health:detailed # Detailed health report
```

### 3. Test Login
```bash
# Quick login test
pnpm quick:test

# Or detailed test
pnpm test:login
```

## Test Users

After setup, these users are available:
- **CEO001** / 123456 (SUPERADMIN)
- **ADM001** / 123456 (ADMIN)
- **USR001** / 123456 (USER)
- **552502356** / 123456 (USER)

## Next Steps

1. **Verify everything is working**
   - Check all health endpoints return "ok"
   - Browse API documentation at http://localhost:8080/api
   - Test login with provided test users

2. **Start development**
   - API runs on http://localhost:8080
   - Database accessible via Prisma Studio
   - Hot reload enabled for development

3. **Learn the system**
   - Check out the API documentation
   - Explore database schema in Prisma Studio
   - Test authentication endpoints

## Support

If you encounter issues:
1. Check the troubleshooting section above
2. Verify all prerequisites are installed correctly
3. Check Docker Desktop is running (if using Docker)
4. Review the error messages carefully
5. Try the manual setup commands step by step

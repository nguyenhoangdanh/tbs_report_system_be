-- Initialize database for weekly report system

-- Create development database if not exists
SELECT 'CREATE DATABASE weekly_report_dev'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'weekly_report_dev')\gexec

-- Create test database for testing
SELECT 'CREATE DATABASE weekly_report_test'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'weekly_report_test')\gexec

-- Grant all privileges to postgres user
GRANT ALL PRIVILEGES ON DATABASE weekly_report_dev TO postgres;
GRANT ALL PRIVILEGES ON DATABASE weekly_report_test TO postgres;

-- Create extensions if needed (uncomment if you need them)
-- \c weekly_report_dev;
-- CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
-- CREATE EXTENSION IF NOT EXISTS "pg_trgm";

\echo 'Database initialization completed!'

#!/bin/bash
# scripts/monitor.sh
# System monitoring and health check script

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
COMPOSE_FILE="docker-compose.yml"
LOG_FILE="/tmp/monitor.log"

# Function to print colored output
print_status() {
    local status=$1
    local message=$2
    case $status in
        "OK") echo -e "${GREEN}✅ $message${NC}" ;;
        "WARN") echo -e "${YELLOW}⚠️  $message${NC}" ;;
        "ERROR") echo -e "${RED}❌ $message${NC}" ;;
        "INFO") echo -e "${BLUE}ℹ️  $message${NC}" ;;
    esac
}

# Function to check container health
check_container_health() {
    local container_name=$1
    local status=$(docker inspect --format='{{.State.Health.Status}}' "$container_name" 2>/dev/null || echo "unknown")
    local running=$(docker inspect --format='{{.State.Running}}' "$container_name" 2>/dev/null || echo "false")
    
    if [ "$running" = "true" ] && [ "$status" = "healthy" ]; then
        print_status "OK" "$container_name is running and healthy"
        return 0
    elif [ "$running" = "true" ] && [ "$status" = "unhealthy" ]; then
        print_status "ERROR" "$container_name is running but unhealthy"
        return 1
    elif [ "$running" = "true" ]; then
        print_status "WARN" "$container_name is running (no health check)"
        return 0
    else
        print_status "ERROR" "$container_name is not running"
        return 1
    fi
}

# Function to check PostgreSQL replication
check_replication() {
    print_status "INFO" "Checking PostgreSQL replication status..."
    
    # Check master
    local master_status=$(docker exec weekly_report_postgres_master psql -U postgres -d weekly_report_backend -t -c "SELECT count(*) FROM pg_stat_replication;" 2>/dev/null | tr -d ' ' || echo "0")
    
    if [ "$master_status" -gt "0" ]; then
        print_status "OK" "Master has $master_status active replicas"
    else
        print_status "WARN" "Master has no active replicas"
    fi
    
    # Check replication lag
    docker exec weekly_report_postgres_master psql -U postgres -d weekly_report_backend -c "
        SELECT 
            client_addr,
            application_name,
            state,
            pg_size_pretty(pg_wal_lsn_diff(pg_current_wal_lsn(), replay_lsn)) as lag
        FROM pg_stat_replication;
    " 2>/dev/null || print_status "ERROR" "Failed to check replication status"
}

# Function to check HAProxy stats
check_haproxy() {
    print_status "INFO" "Checking HAProxy status..."
    
    local stats=$(curl -s http://localhost:8404/stats 2>/dev/null || echo "")
    if [ -n "$stats" ]; then
        print_status "OK" "HAProxy stats available at http://localhost:8404/stats"
        
        # Check backend status
        local backend_status=$(curl -s "http://localhost:8404/stats;csv" | grep -E "(postgres-master|postgres-standby)" | cut -d',' -f18)
        echo "$backend_status" | while read status; do
            if [ "$status" = "UP" ]; then
                print_status "OK" "Backend server is UP"
            else
                print_status "ERROR" "Backend server status: $status"
            fi
        done
    else
        print_status "ERROR" "HAProxy stats not available"
    fi
}

# Function to check application endpoints
check_application() {
    print_status "INFO" "Checking application endpoints..."
    
    # Health endpoint
    if curl -f -s http://localhost:8080/health >/dev/null 2>&1; then
        print_status "OK" "Application health endpoint responding"
    else
        print_status "ERROR" "Application health endpoint not responding"
    fi
    
    # API health endpoint
    if curl -f -s http://localhost:8080/api/health >/dev/null 2>&1; then
        print_status "OK" "API health endpoint responding"
    else
        print_status "ERROR" "API health endpoint not responding"
    fi
    
    # Database health endpoint
    if curl -f -s http://localhost:8080/api/health/db >/dev/null 2>&1; then
        print_status "OK" "Database health endpoint responding"
    else
        print_status "ERROR" "Database health endpoint not responding"
    fi
}

# Function to check disk usage
check_disk_usage() {
    print_status "INFO" "Checking disk usage..."
    
    # Check Docker volumes
    docker system df
    
    # Check backup directory
    if [ -d "./backups" ]; then
        local backup_size=$(du -sh ./backups | cut -f1)
        print_status "INFO" "Backup directory size: $backup_size"
    fi
    
    # Check if disk usage is over 80%
    local disk_usage=$(df / | awk 'NR==2 {print $5}' | sed 's/%//')
    if [ "$disk_usage" -gt 80 ]; then
        print_status "WARN" "Disk usage is ${disk_usage}% - consider cleanup"
    else
        print_status "OK" "Disk usage is ${disk_usage}%"
    fi
}

# Function to check recent logs for errors
check_logs() {
    print_status "INFO" "Checking recent logs for errors..."
    
    # Check backend logs
    local error_count=$(docker logs weekly_report_backend --since="1h" 2>&1 | grep -i error | wc -l)
    if [ "$error_count" -gt 0 ]; then
        print_status "WARN" "Found $error_count errors in backend logs (last hour)"
    else
        print_status "OK" "No errors in backend logs (last hour)"
    fi
    
    # Check database logs
    local db_error_count=$(docker logs weekly_report_postgres_master --since="1h" 2>&1 | grep -i error | wc -l)
    if [ "$db_error_count" -gt 0 ]; then
        print_status "WARN" "Found $db_error_count errors in database logs (last hour)"
    else
        print_status "OK" "No errors in database logs (last hour)"
    fi
}

# Main monitoring function
main() {
    echo "================================================"
    echo "🔍 Weekly Report System Health Check"
    echo "⏰ $(date)"
    echo "================================================"
    echo
    
    # Check all containers
    print_status "INFO" "Checking container health..."
    check_container_health "weekly_report_postgres_master"
    check_container_health "weekly_report_postgres_standby_1"
    check_container_health "weekly_report_postgres_standby_2"
    check_container_health "weekly_report_haproxy"
    check_container_health "weekly_report_backend"
    check_container_health "weekly_report_redis"
    
    echo
    
    # Check PostgreSQL replication
    check_replication
    
    echo
    
    # Check HAProxy
    check_haproxy
    
    echo
    
    # Check application
    check_application
    
    echo
    
    # Check system resources
    check_disk_usage
    
    echo
    
    # Check logs
    check_logs
    
    echo
    echo "================================================"
    echo "🏁 Health check completed at $(date)"
    echo "================================================"
}

# Run monitoring
if [ "${1:-}" = "watch" ]; then
    # Watch mode - run every 30 seconds
    while true; do
        clear
        main
        sleep 30
    done
else
    # Single run
    main
fi

set -e

# Configuration
COMPOSE_FILE="docker-compose.yml"
ENV_FILE=".env"
BACKUP_BEFORE_DEPLOY=true

print_status() {
    local status=$1
    local message=$2
    case $status in
        "OK") echo -e "\033[0;32m✅ $message\033[0m" ;;
        "WARN") echo -e "\033[1;33m⚠️  $message\033[0m" ;;
        "ERROR") echo -e "\033[0;31m❌ $message\033[0m" ;;
        "INFO") echo -e "\033[0;34mℹ️  $message\033[0m" ;;
    esac
}

# Pre-deployment checks
pre_deploy_checks() {
    print_status "INFO" "Running pre-deployment checks..."
    
    # Check if Docker is running
    if ! docker info >/dev/null 2>&1; then
        print_status "ERROR" "Docker is not running"
        exit 1
    fi
    
    # Check if compose file exists
    if [ ! -f "$COMPOSE_FILE" ]; then
        print_status "ERROR" "Docker compose file not found: $COMPOSE_FILE"
        exit 1
    fi
    
    # Check if env file exists
    if [ ! -f "$ENV_FILE" ]; then
        print_status "WARN" "Environment file not found: $ENV_FILE"
    fi
    
    # Check available disk space
    local available_space=$(df / | awk 'NR==2 {print $4}')
    if [ "$available_space" -lt 1048576 ]; then  # Less than 1GB
        print_status "WARN" "Low disk space available: $(df -h / | awk 'NR==2 {print $4}')"
    fi
    
    print_status "OK" "Pre-deployment checks passed"
}

# Backup before deployment
backup_before_deploy() {
    if [ "$BACKUP_BEFORE_DEPLOY" = true ]; then
        print_status "INFO" "Creating backup before deployment..."
        
        # Check if database is running
        if docker ps | grep -q weekly_report_postgres_master; then
            docker exec weekly_report_postgres_master pg_dump \
                -U postgres -d weekly_report_backend \
                --format=custom --compress=9 \
                --file="/backups/pre_deploy_backup_$(date +%Y%m%d_%H%M%S).custom"
            
            print_status "OK" "Pre-deployment backup created"
        else
            print_status "WARN" "Database not running - skipping backup"
        fi
    fi
}

# Deploy function
deploy() {
    print_status "INFO" "Starting deployment..."
    
    # Build and start services
    print_status "INFO" "Building and starting services..."
    docker-compose -f "$COMPOSE_FILE" up -d --build
    
    # Wait for services to be healthy
    print_status "INFO" "Waiting for services to be healthy..."
    
    local max_wait=300  # 5 minutes
    local wait_time=0
    
    while [ $wait_time -lt $max_wait ]; do
        if docker-compose -f "$COMPOSE_FILE" ps | grep -q "unhealthy"; then
            print_status "INFO" "Waiting for services to be healthy... (${wait_time}s)"
            sleep 10
            wait_time=$((wait_time + 10))
        else
            break
        fi
    done
    
    if [ $wait_time -ge $max_wait ]; then
        print_status "WARN" "Some services may not be healthy after $max_wait seconds"
    else
        print_status "OK" "All services are healthy"
    fi
}

# Post-deployment checks
post_deploy_checks() {
    print_status "INFO" "Running post-deployment checks..."
    
    # Check application health
    sleep 30  # Wait for application to fully start
    
    if curl -f -s http://localhost:8080/health >/dev/null 2>&1; then
        print_status "OK" "Application is responding"
    else
        print_status "ERROR" "Application is not responding"
        return 1
    fi
    
    # Check database connectivity
    if docker exec weekly_report_backend node -e "
        const { PrismaClient } = require('@prisma/client');
        const prisma = new PrismaClient();
        prisma.\$connect()
            .then(() => { console.log('Database connected'); process.exit(0); })
            .catch(() => process.exit(1));
    " >/dev/null 2>&1; then
        print_status "OK" "Database connectivity verified"
    else
        print_status "ERROR" "Database connectivity failed"
        return 1
    fi
    
    # Check replication status
    local replica_count=$(docker exec weekly_report_postgres_master psql -U postgres -d weekly_report_backend -t -c "SELECT count(*) FROM pg_stat_replication;" 2>/dev/null | tr -d ' ' || echo "0")
    
    if [ "$replica_count" -gt "0" ]; then
        print_status "OK" "Database replication is working ($replica_count replicas)"
    else
        print_status "WARN" "Database replication may not be working"
    fi
    
    print_status "OK" "Post-deployment checks completed"
}

# Main deployment function
main() {
    echo "================================================"
    echo "🚀 Weekly Report System Deployment"
    echo "⏰ $(date)"
    echo "================================================"
    echo
    
    pre_deploy_checks
    echo
    
    backup_before_deploy
    echo
    
    deploy
    echo
    
    post_deploy_checks
    echo
    
    echo "================================================"
    echo "🎉 Deployment completed successfully!"
    echo "⏰ $(date)"
    echo "================================================"
    echo
    echo "🌐 Application: http://localhost:8080"
    echo "📊 HAProxy Stats: http://localhost:8404/stats"
    echo "📈 Grafana: http://localhost:3001 (if monitoring enabled)"
    echo
}

# Handle script arguments
case "${1:-}" in
    "check")
        pre_deploy_checks
        ;;
    "backup")
        backup_before_deploy
        ;;
    *)
        main
        ;;
esac
#!/bin/bash
# scripts/failover.sh
# Manual failover script for PostgreSQL

set -e

# Configuration
TRIGGER_FILE_1="/tmp/postgresql.trigger.5433"
TRIGGER_FILE_2="/tmp/postgresql.trigger.5434"

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

usage() {
    echo "Usage: $0 <standby_number>"
    echo "       $0 1    # Promote standby-1 to master"
    echo "       $0 2    # Promote standby-2 to master"
    echo "       $0 status    # Show current replication status"
    exit 1
}

show_status() {
    print_status "INFO" "Current replication status:"
    
    # Check master status
    echo "=== Master Status ==="
    docker exec weekly_report_postgres_master psql -U postgres -d weekly_report_backend -c "
        SELECT 
            pg_is_in_recovery() as is_standby,
            pg_current_wal_lsn() as current_lsn;
    " 2>/dev/null || print_status "ERROR" "Cannot connect to master"
    
    # Check replication connections
    docker exec weekly_report_postgres_master psql -U postgres -d weekly_report_backend -c "
        SELECT 
            client_addr,
            application_name,
            state,
            pg_size_pretty(pg_wal_lsn_diff(pg_current_wal_lsn(), replay_lsn)) as lag
        FROM pg_stat_replication;
    " 2>/dev/null || print_status "ERROR" "Cannot get replication status"
    
    # Check standby status
    echo "=== Standby-1 Status ==="
    docker exec weekly_report_postgres_standby_1 psql -U postgres -c "
        SELECT 
            pg_is_in_recovery() as is_standby,
            pg_last_wal_receive_lsn() as last_received_lsn,
            pg_last_wal_replay_lsn() as last_replayed_lsn;
    " 2>/dev/null || print_status "WARN" "Cannot connect to standby-1"
    
    echo "=== Standby-2 Status ==="
    docker exec weekly_report_postgres_standby_2 psql -U postgres -c "
        SELECT 
            pg_is_in_recovery() as is_standby,
            pg_last_wal_receive_lsn() as last_received_lsn,
            pg_last_wal_replay_lsn() as last_replayed_lsn;
    " 2>/dev/null || print_status "WARN" "Cannot connect to standby-2"
}

promote_standby() {
    local standby_number=$1
    local container_name="weekly_report_postgres_standby_$standby_number"
    local trigger_file=""
    
    case $standby_number in
        1) trigger_file=$TRIGGER_FILE_1 ;;
        2) trigger_file=$TRIGGER_FILE_2 ;;
        *) echo "Invalid standby number"; usage ;;
    esac
    
    print_status "WARN" "Promoting $container_name to master..."
    print_status "WARN" "This will make $container_name the new write master!"
    
    read -p "Are you sure? (y/N): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo "Failover cancelled"
        exit 0
    fi
    
    # Stop application to prevent writes
    print_status "INFO" "Stopping application..."
    docker stop weekly_report_backend || true
    
    # Create trigger file to promote standby
    print_status "INFO" "Creating trigger file to promote standby..."
    docker exec "$container_name" touch "$trigger_file"
    
    # Wait for promotion
    print_status "INFO" "Waiting for promotion to complete..."
    sleep 5
    
    # Check if promotion was successful
    local is_master=$(docker exec "$container_name" psql -U postgres -t -c "SELECT NOT pg_is_in_recovery();" | tr -d ' ')
    
    if [ "$is_master" = "t" ]; then
        print_status "OK" "$container_name is now the master!"
        
        # Update HAProxy configuration to point to new master
        print_status "INFO" "Update HAProxy configuration manually to point to new master"
        print_status "INFO" "New master: $container_name:5432"
        
        # Restart application
        print_status "INFO" "Starting application..."
        docker start weekly_report_backend
        
        print_status "OK" "Failover completed successfully!"
    else
        print_status "ERROR" "Failover failed - $container_name is still in recovery mode"
        
        # Restart application anyway
        docker start weekly_report_backend
        exit 1
    fi
}

# Main script
case "${1:-}" in
    "1"|"2")
        promote_standby "$1"
        ;;
    "status")
        show_status
        ;;
    *)
        usage
        ;;
esac

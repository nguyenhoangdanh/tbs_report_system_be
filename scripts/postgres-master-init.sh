---

#!/bin/bash
# scripts/postgres-master-init.sh
# Initialize PostgreSQL Master

set -e

echo "Initializing PostgreSQL Master..."

# Create replication user
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
    -- Create replication user
    CREATE USER replicator WITH REPLICATION ENCRYPTED PASSWORD '$POSTGRES_REPLICATION_PASSWORD';
    
    -- Grant necessary permissions
    GRANT CONNECT ON DATABASE $POSTGRES_DB TO replicator;
    
    -- Create backup directory
    \! mkdir -p /backups/archive
    
    -- Show replication status
    SELECT * FROM pg_stat_replication;
EOSQL

echo "PostgreSQL Master initialized successfully"

---

#!/bin/bash
# scripts/postgres-standby-init.sh
# Initialize PostgreSQL Standby

set -e

echo "Initializing PostgreSQL Standby..."

# Wait for master to be ready
echo "Waiting for master to be ready..."
until pg_isready -h postgres-master -p 5432 -U postgres; do
    echo "Master is not ready yet, waiting..."
    sleep 2
done

echo "Master is ready, standby initialization will be handled by Docker command"

---
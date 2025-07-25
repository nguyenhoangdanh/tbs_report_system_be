global
    log stdout local0
    chroot /var/lib/haproxy
    stats socket /run/haproxy/admin.sock mode 660 level admin
    stats timeout 30s
    user haproxy
    group haproxy
    daemon

defaults
    mode tcp
    log global
    option tcplog
    option dontlognull
    option tcp-check
    retries 3
    timeout queue 5s
    timeout connect 5s
    timeout client 60s
    timeout server 60s
    timeout check 2s

# Statistics interface
listen stats
    bind *:8404
    mode http
    stats enable
    stats uri /
    stats refresh 10s
    stats admin if TRUE

# Frontend for write operations (Master only)
frontend postgres_write
    bind *:5432
    mode tcp
    default_backend postgres_master_backend

# Frontend for read operations (Load balanced across all)
frontend postgres_read
    bind *:5433
    mode tcp
    default_backend postgres_read_backend

# Backend for write operations (Master only)
backend postgres_master_backend
    mode tcp
    balance first
    option tcp-check
    tcp-check send-binary 00000020 # packet length
    tcp-check send-binary 00030000 # protocol version
    tcp-check send-binary 75736572 # "user"
    tcp-check send-binary 00
    tcp-check send-binary 706f7374677265732 # "postgres"
    tcp-check send-binary 00
    tcp-check send-binary 646174616261736500 # "database"
    tcp-check send-binary 77656b6c795f7265706f72745f6261636b656e6400 # database name
    tcp-check send-binary 00
    tcp-check expect binary 52 # Auth request
    
    server postgres-master postgres-master:5432 check inter 5s fastinter 2s downinter 5s rise 2 fall 3

# Backend for read operations (All servers with fallback)
backend postgres_read_backend
    mode tcp
    balance roundrobin
    option tcp-check
    tcp-check send-binary 00000020
    tcp-check send-binary 00030000
    tcp-check send-binary 75736572
    tcp-check send-binary 00
    tcp-check send-binary 706f7374677265732
    tcp-check send-binary 00
    tcp-check send-binary 646174616261736500
    tcp-check send-binary 77656b6c795f7265706f72745f6261636b656e6400
    tcp-check send-binary 00
    tcp-check expect binary 52
    
    # Master server (can handle reads)
    server postgres-master postgres-master:5432 check inter 5s fastinter 2s downinter 5s rise 2 fall 3 weight 100
    
    # Standby servers (read-only)
    server postgres-standby-1 postgres-standby-1:5432 check inter 5s fastinter 2s downinter 5s rise 2 fall 3 weight 100
    server postgres-standby-2 postgres-standby-2:5432 check inter 5s fastinter 2s downinter 5s rise 2 fall 3 weight 100

# Health check backend for monitoring
backend postgres_health_backend
    mode tcp
    server postgres-master postgres-master:5432 check
    server postgres-standby-1 postgres-standby-1:5432 check
    server postgres-standby-2 postgres-standby-2:5432 check
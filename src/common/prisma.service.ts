import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

/**
 * Enhanced Prisma Service with Read/Write Splitting for High Availability
 */
@Injectable()
export class PrismaService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);
  
  // Write operations (Master)
  private writeClient: PrismaClient;
  
  // Read operations (Load balanced across replicas)
  private readClient: PrismaClient;
  
  // Connection management
  private connectionRetries = 0;
  private maxRetries = 5;
  private retryDelay = 2000;
  private isWriteConnected = false;
  private isReadConnected = false;
  private isConnecting = false;

  constructor() {
    // Initialize write client (Master)
    this.writeClient = new PrismaClient({
      datasources: {
        db: {
          url: process.env.DATABASE_URL, // Points to HAProxy write port (5430)
        },
      },
      log: process.env.NODE_ENV === 'development' 
        ? ['query', 'info', 'warn', 'error'] 
        : ['error', 'warn'],
      errorFormat: 'pretty',
    });

    // Initialize read client (Replicas)
    this.readClient = new PrismaClient({
      datasources: {
        db: {
          url: process.env.DATABASE_READ_URL || process.env.DATABASE_URL, // Points to HAProxy read port (5431)
        },
      },
      log: process.env.NODE_ENV === 'development' 
        ? ['info', 'warn', 'error'] 
        : ['error', 'warn'],
      errorFormat: 'pretty',
    });
  }

  /**
   * Initialize connections on module init
   */
  async onModuleInit() {
    if (this.isConnecting) {
      return;
    }

    this.isConnecting = true;
    
    try {
      await this.connectWithRetry();
    } finally {
      this.isConnecting = false;
    }
  }

  /**
   * Connect with retry logic for both write and read clients
   */
  private async connectWithRetry(): Promise<void> {
    while (this.connectionRetries < this.maxRetries && (!this.isWriteConnected || !this.isReadConnected)) {
      try {
        this.logger.log(
          `🔄 Connecting to database cluster (attempt ${this.connectionRetries + 1}/${this.maxRetries})...`,
        );

        // Connect write client (Master)
        if (!this.isWriteConnected) {
          await Promise.race([
            this.writeClient.$connect(),
            new Promise((_, reject) =>
              setTimeout(() => reject(new Error('Write connection timeout after 20s')), 20000),
            ),
          ]);

          // Test write connection
          await Promise.race([
            this.writeClient.$queryRaw`SELECT 1 as write_health_check, NOW() as current_time, pg_is_in_recovery() as is_replica`,
            new Promise((_, reject) =>
              setTimeout(() => reject(new Error('Write health check timeout after 10s')), 10000),
            ),
          ]);

          this.isWriteConnected = true;
          this.logger.log('✅ Connected to write database (Master)');
        }

        // Connect read client (Replicas)
        if (!this.isReadConnected) {
          await Promise.race([
            this.readClient.$connect(),
            new Promise((_, reject) =>
              setTimeout(() => reject(new Error('Read connection timeout after 20s')), 20000),
            ),
          ]);

          // Test read connection
          await Promise.race([
            this.readClient.$queryRaw`SELECT 1 as read_health_check, NOW() as current_time`,
            new Promise((_, reject) =>
              setTimeout(() => reject(new Error('Read health check timeout after 10s')), 10000),
            ),
          ]);

          this.isReadConnected = true;
          this.logger.log('✅ Connected to read database (Replicas)');
        }

        this.connectionRetries = 0;

        // Log connection info
        try {
          const writeInfo = await this.getWriteDatabaseInfo();
          const readInfo = await this.getReadDatabaseInfo();
          
          this.logger.log(`📊 Write DB: ${writeInfo.database} | Read DB: ${readInfo.database}`);
          this.logger.log(`🔧 Write is replica: ${writeInfo.isReplica} | Read is replica: ${readInfo.isReplica}`);
        } catch (error) {
          this.logger.warn('Could not fetch database info:', error.message);
        }

        return;
      } catch (error) {
        this.connectionRetries++;
        this.logger.error(
          `❌ Connection failed (${this.connectionRetries}/${this.maxRetries}): ${error.message}`,
        );

        this.logConnectionError(error);

        // Reset connections on failure
        if (this.isWriteConnected) {
          try {
            await this.writeClient.$disconnect();
          } catch (e) {
            // Ignore disconnect errors
          }
          this.isWriteConnected = false;
        }

        if (this.isReadConnected) {
          try {
            await this.readClient.$disconnect();
          } catch (e) {
            // Ignore disconnect errors
          }
          this.isReadConnected = false;
        }

        if (this.connectionRetries >= this.maxRetries) {
          const errorMsg = `Database cluster connection failed after ${this.maxRetries} attempts: ${error.message}`;
          this.logger.error(`🚨 ${errorMsg}`);
          
          if (process.env.NODE_ENV === 'production') {
            this.logger.warn('⚠️ Continuing in production mode - database operations may fail');
            return;
          } else {
            throw new Error(errorMsg);
          }
        }

        // Exponential backoff with jitter
        const delay = Math.min(
          this.retryDelay * Math.pow(1.8, this.connectionRetries - 1) + Math.random() * 1000,
          15000
        );
        
        this.logger.log(`⏳ Retrying in ${Math.round(delay)}ms...`);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  /**
   * Enhanced error logging for connection issues
   */
  private logConnectionError(error: any) {
    const message = error.message.toLowerCase();

    if (message.includes('enotfound')) {
      this.logger.error('🌐 DNS resolution failed for database endpoint');
      this.logger.error('💡 Check: Database endpoint URL and HAProxy configuration');
    } else if (message.includes('econnrefused') || message.includes('connection refused')) {
      this.logger.error('🚪 Connection refused by database');
      this.logger.error('💡 Check: Database cluster is running and HAProxy is healthy');
    } else if (message.includes('timeout')) {
      this.logger.error('⏰ Connection timeout to database');
      this.logger.error('💡 Check: Network connectivity and database performance');
    } else if (message.includes('authentication') || message.includes('password')) {
      this.logger.error('🔐 Authentication failed with database');
      this.logger.error('💡 Check: Database credentials are correct');
    } else {
      this.logger.error(`🔍 Database connection error: ${error.message}`);
      this.logger.error('💡 Check: Database cluster status and HAProxy logs');
    }
  }

  /**
   * Get write client for write operations (INSERT, UPDATE, DELETE)
   */
  get write(): PrismaClient {
    if (!this.isWriteConnected) {
      this.logger.warn('⚠️ Write database not connected, attempting reconnection...');
      // In production, we might want to queue operations or use fallback
    }
    return this.writeClient;
  }

  /**
   * Get read client for read operations (SELECT)
   */
  get read(): PrismaClient {
    if (!this.isReadConnected) {
      this.logger.warn('⚠️ Read database not connected, falling back to write database...');
      return this.writeClient; // Fallback to write client for reads
    }
    return this.readClient;
  }

  /**
   * Execute read operation with automatic retry and fallback
   */
  async executeRead<T>(operation: (client: PrismaClient) => Promise<T>): Promise<T> {
    try {
      // Try read client first
      if (this.isReadConnected) {
        return await operation(this.readClient);
      }
    } catch (error) {
      this.logger.warn('📖 Read operation failed on replica, falling back to master:', error.message);
    }

    // Fallback to write client
    if (this.isWriteConnected) {
      return await operation(this.writeClient);
    }

    throw new Error('No database connections available');
  }

  /**
   * Execute write operation with automatic retry
   */
  async executeWrite<T>(operation: (client: PrismaClient) => Promise<T>): Promise<T> {
    if (!this.isWriteConnected) {
      await this.ensureWriteConnection();
    }

    try {
      return await operation(this.writeClient);
    } catch (error) {
      this.logger.error('✍️ Write operation failed:', error.message);
      
      // Try to reconnect and retry once
      this.isWriteConnected = false;
      await this.ensureWriteConnection();
      
      return await operation(this.writeClient);
    }
  }

  /**
   * Execute transaction (always on write client/master)
   */
  async executeTransaction<T>(
    operation: (client: PrismaClient) => Promise<T>
  ): Promise<T> {
    return this.executeWrite(operation);
  }

  /**
   * Ensure write connection is active
   */
  async ensureWriteConnection(): Promise<void> {
    if (this.isWriteConnected) {
      try {
        await Promise.race([
          this.writeClient.$queryRaw`SELECT 1`,
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Write health check timeout')), 5000),
          ),
        ]);
        return;
      } catch (error) {
        this.logger.warn('🔄 Write connection lost, reconnecting...');
        this.isWriteConnected = false;
      }
    }

    try {
      await this.writeClient.$disconnect();
    } catch (e) {
      // Ignore disconnect errors
    }

    await this.connectWithRetry();
  }

  /**
   * Ensure read connection is active
   */
  async ensureReadConnection(): Promise<void> {
    if (this.isReadConnected) {
      try {
        await Promise.race([
          this.readClient.$queryRaw`SELECT 1`,
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Read health check timeout')), 5000),
          ),
        ]);
        return;
      } catch (error) {
        this.logger.warn('🔄 Read connection lost, reconnecting...');
        this.isReadConnected = false;
      }
    }

    try {
      await this.readClient.$disconnect();
    } catch (e) {
      // Ignore disconnect errors
    }

    await this.connectWithRetry();
  }

  /**
   * Check if database connections are healthy
   */
  async isHealthy(): Promise<{
    writeHealthy: boolean;
    readHealthy: boolean;
    overall: boolean;
  }> {
    let writeHealthy = false;
    let readHealthy = false;

    try {
      await Promise.race([
        this.writeClient.$queryRaw`SELECT 1 as write_health`,
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Write health check timeout')), 5000),
        ),
      ]);
      writeHealthy = true;
    } catch (error) {
      this.logger.error('💔 Write database health check failed:', error.message);
    }

    try {
      await Promise.race([
        this.readClient.$queryRaw`SELECT 1 as read_health`,
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Read health check timeout')), 5000),
        ),
      ]);
      readHealthy = true;
    } catch (error) {
      this.logger.error('💔 Read database health check failed:', error.message);
    }

    return {
      writeHealthy,
      readHealthy,
      overall: writeHealthy && readHealthy,
    };
  }

  /**
   * Get write database information
   */
  async getWriteDatabaseInfo(): Promise<{
    database: string;
    username: string;
    version: string;
    serverTime: Date;
    isReplica: boolean;
  }> {
    const result = (await this.writeClient.$queryRaw`
      SELECT 
        current_database() as database,
        current_user as username,
        version() as version,
        now() as server_time,
        pg_is_in_recovery() as is_replica
    `) as any[];

    return result[0];
  }

  /**
   * Get read database information
   */
  async getReadDatabaseInfo(): Promise<{
    database: string;
    username: string;
    version: string;
    serverTime: Date;
    isReplica: boolean;
  }> {
    const result = (await this.readClient.$queryRaw`
      SELECT 
        current_database() as database,
        current_user as username,
        version() as version,
        now() as server_time,
        pg_is_in_recovery() as is_replica
    `) as any[];

    return result[0];
  }

  /**
   * Get replication status (from master)
   */
  async getReplicationStatus(): Promise<any[]> {
    try {
      const result = (await this.writeClient.$queryRaw`
        SELECT 
          client_addr,
          application_name,
          state,
          pg_size_pretty(pg_wal_lsn_diff(pg_current_wal_lsn(), replay_lsn)) as lag,
          replay_lsn,
          pg_current_wal_lsn() as current_lsn
        FROM pg_stat_replication;
      `) as any[];

      return result;
    } catch (error) {
      this.logger.error('Failed to get replication status:', error.message);
      return [];
    }
  }

  /**
   * Test connection with latency measurement
   */
  async testConnections(): Promise<{
    write: { success: boolean; latency?: number; error?: string; details?: any };
    read: { success: boolean; latency?: number; error?: string; details?: any };
  }> {
    const testWrite = async () => {
      const startTime = Date.now();
      try {
        const result = await Promise.race([
          this.writeClient.$queryRaw`
            SELECT 
              1 as test_query,
              current_timestamp as query_time,
              current_database() as database,
              current_user as username,
              pg_is_in_recovery() as is_replica
          `,
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Write test timeout')), 10000),
          ),
        ]);

        const latency = Date.now() - startTime;
        return { success: true, latency, details: result[0] };
      } catch (error) {
        return { success: false, error: error.message };
      }
    };

    const testRead = async () => {
      const startTime = Date.now();
      try {
        const result = await Promise.race([
          this.readClient.$queryRaw`
            SELECT 
              1 as test_query,
              current_timestamp as query_time,
              current_database() as database,
              current_user as username,
              pg_is_in_recovery() as is_replica
          `,
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Read test timeout')), 10000),
          ),
        ]);

        const latency = Date.now() - startTime;
        return { success: true, latency, details: result[0] };
      } catch (error) {
        return { success: false, error: error.message };
      }
    };

    const [write, read] = await Promise.all([testWrite(), testRead()]);

    return { write, read };
  }

  /**
   * Get comprehensive connection status
   */
  async getConnectionStatus(): Promise<{
    write: {
      isConnected: boolean;
      lastError?: string;
      databaseInfo?: any;
    };
    read: {
      isConnected: boolean;
      lastError?: string;
      databaseInfo?: any;
    };
    replication?: any[];
    retryCount: number;
    environment: string;
  }> {
    let writeInfo: any = {};
    let readInfo: any = {};
    let replicationStatus: any[] = [];

    try {
      writeInfo = await this.getWriteDatabaseInfo();
    } catch (error) {
      writeInfo = { lastError: error.message };
    }

    try {
      readInfo = await this.getReadDatabaseInfo();
    } catch (error) {
      readInfo = { lastError: error.message };
    }

    try {
      replicationStatus = await this.getReplicationStatus();
    } catch (error) {
      // Ignore replication status errors
    }

    return {
      write: {
        isConnected: this.isWriteConnected,
        databaseInfo: writeInfo,
        lastError: writeInfo.lastError,
      },
      read: {
        isConnected: this.isReadConnected,
        databaseInfo: readInfo,
        lastError: readInfo.lastError,
      },
      replication: replicationStatus,
      retryCount: this.connectionRetries,
      environment: process.env.NODE_ENV || 'development',
    };
  }

  /**
   * Get database statistics from read replica (to reduce load on master)
   */
  async getDatabaseStats(): Promise<{
    totalTables: number;
    totalRecords: { [tableName: string]: number };
    databaseSize: string;
  }> {
    try {
      // Use read client to reduce load on master
      const client = this.isReadConnected ? this.readClient : this.writeClient;

      // Get table statistics
      const tableStats = (await client.$queryRaw`
        SELECT 
          schemaname,
          tablename,
          n_live_tup as live_rows
        FROM pg_stat_user_tables 
        ORDER BY n_live_tup DESC;
      `) as any[];

      // Get database size
      const sizeResult = (await client.$queryRaw`
        SELECT pg_size_pretty(pg_database_size(current_database())) as size;
      `) as any[];

      const totalRecords: { [tableName: string]: number } = {};

      for (const table of tableStats) {
        totalRecords[table.tablename] = parseInt(table.live_rows) || 0;
      }

      return {
        totalTables: tableStats.length,
        totalRecords,
        databaseSize: sizeResult[0]?.size || 'Unknown',
      };
    } catch (error) {
      this.logger.error('Failed to get database stats:', error.message);
      return {
        totalTables: 0,
        totalRecords: {},
        databaseSize: 'Unknown',
      };
    }
  }

  /**
   * Force failover to specific replica (emergency use)
   */
  async forceFailover(replicaHost: string): Promise<boolean> {
    this.logger.warn(`🚨 Forcing failover to replica: ${replicaHost}`);
    
    try {
      // Disconnect from current write client
      await this.writeClient.$disconnect();
      this.isWriteConnected = false;

      // Create new write client pointing to replica
      this.writeClient = new PrismaClient({
        datasources: {
          db: {
            url: process.env.DATABASE_URL!.replace(/\/\/[^@]+@[^/]+\//, `//${replicaHost}/`),
          },
        },
        log: ['error', 'warn'],
        errorFormat: 'pretty',
      });

      // Test new connection
      await this.writeClient.$connect();
      await this.writeClient.$queryRaw`SELECT 1`;
      
      this.isWriteConnected = true;
      this.logger.log(`✅ Failover to ${replicaHost} successful`);
      
      return true;
    } catch (error) {
      this.logger.error(`❌ Failover to ${replicaHost} failed:`, error.message);
      return false;
    }
  }

  /**
   * Disconnect from databases when module is destroyed
   */
  async onModuleDestroy() {
    this.logger.log('🔄 Gracefully disconnecting from database cluster...');
    
    try {
      await Promise.all([
        this.writeClient.$disconnect(),
        this.readClient.$disconnect(),
      ]);
      
      this.isWriteConnected = false;
      this.isReadConnected = false;
      
      this.logger.log('✅ Disconnected from database cluster');
    } catch (error) {
      this.logger.error('❌ Error during database disconnect:', error.message);
    }
  }
}
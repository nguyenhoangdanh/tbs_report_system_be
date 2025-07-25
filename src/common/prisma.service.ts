import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

/**
 * Service providing access to the Prisma ORM client optimized for Neon PostgreSQL
 */
@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(PrismaService.name);
  private connectionRetries = 0;
  private maxRetries = 5;
  private retryDelay = 2000;
  private isConnected = false;
  private isConnecting = false;

  constructor() {
    super({
      // Optimized configuration for Neon PostgreSQL
      datasources: {
        db: {
          url: process.env.DATABASE_URL,
        },
      },
      // log: process.env.NODE_ENV === 'development'
      //   ? ['query', 'info', 'warn', 'error']
      //   : ['error'],
      log: ['error', 'warn'],
      errorFormat: 'pretty',
      // Connection pool settings optimized for Neon
      // transactionOptions: {
      //   timeout: 30000, // 30 seconds
      //   maxWait: 10000, // 10 seconds
      //   isolationLevel: 'ReadCommitted',
      // },
    });
  }

  /**
   * Connect to the database with retry logic for Neon
   */
  async onModuleInit() {
    if (this.isConnecting || this.isConnected) {
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
   * Connect with retry logic optimized for Neon's serverless nature
   */
  private async connectWithRetry(): Promise<void> {
    while (this.connectionRetries < this.maxRetries && !this.isConnected) {
      try {
        this.logger.log(
          `🔄 Connecting to Neon database (attempt ${this.connectionRetries + 1}/${this.maxRetries})...`,
        );

        // Connection timeout for Neon
        await Promise.race([
          this.$connect(),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Connection timeout after 20s')), 20000),
          ),
        ]);

        // Test connection with a simple query
        await Promise.race([
          this.$queryRaw`SELECT 1 as health_check, NOW() as current_time`,
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Health check timeout after 10s')), 10000),
          ),
        ]);

        this.logger.log('✅ Connected to Neon PostgreSQL successfully');
        this.isConnected = true;
        this.connectionRetries = 0;

        // Log connection info
        try {
          const dbInfo = await this.getDatabaseInfo();
          this.logger.log(`📊 Database: ${dbInfo.database} | Version: ${dbInfo.version.split(' ')[0]}`);
        } catch (error) {
          this.logger.warn('Could not fetch database info:', error.message);
        }

        return;
      } catch (error) {
        this.connectionRetries++;
        this.logger.error(
          `❌ Connection failed (${this.connectionRetries}/${this.maxRetries}): ${error.message}`,
        );

        this.logNeonConnectionError(error);

        // Disconnect before retry
        // Chỉ disconnect nếu thực sự cần, tránh disconnect liên tục
        if (this.isConnected) {
          try {
            await this.$disconnect();
          } catch (disconnectError) {
            // Ignore disconnect errors
          }
          this.isConnected = false;
        }

        if (this.connectionRetries >= this.maxRetries) {
          const errorMsg = `Neon database connection failed after ${this.maxRetries} attempts: ${error.message}`;
          this.logger.error(`🚨 ${errorMsg}`);
          
          if (process.env.NODE_ENV === 'production') {
            this.logger.warn('⚠️ Continuing in production mode - database operations may fail');
            return;
          } else {
            throw new Error(errorMsg);
          }
        }

        // Exponential backoff with jitter for Neon
        const delay = Math.min(
          this.retryDelay * Math.pow(1.8, this.connectionRetries - 1) + Math.random() * 1000,
          15000 // Max 15 seconds for Neon
        );
        
        this.logger.log(`⏳ Retrying in ${Math.round(delay)}ms...`);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  /**
   * Enhanced error logging for Neon-specific issues
   */
  private logNeonConnectionError(error: any) {
    const message = error.message.toLowerCase();

    if (message.includes('enotfound')) {
      this.logger.error('🌐 DNS resolution failed for Neon endpoint');
      this.logger.error('💡 Check: Neon database endpoint URL is correct');
    } else if (message.includes('econnrefused') || message.includes('connection refused')) {
      this.logger.error('🚪 Connection refused by Neon');
      this.logger.error('💡 Check: Neon database is active and not suspended');
    } else if (message.includes('timeout')) {
      this.logger.error('⏰ Connection timeout to Neon');
      this.logger.error('💡 Check: Network connectivity and Neon region latency');
    } else if (message.includes('authentication') || message.includes('password')) {
      this.logger.error('🔐 Authentication failed with Neon');
      this.logger.error('💡 Check: Database credentials are correct and not expired');
    } else if (message.includes('ssl') || message.includes('tls')) {
      this.logger.error('🔒 SSL/TLS error with Neon');
      this.logger.error('💡 Check: SSL mode is set to "require" for Neon');
    } else if (message.includes('database') && message.includes('does not exist')) {
      this.logger.error('🗄️ Database does not exist in Neon');
      this.logger.error('💡 Check: Database name is correct in Neon console');
    } else if (message.includes('suspended') || message.includes('inactive')) {
      this.logger.error('💤 Neon database is suspended or inactive');
      this.logger.error('💡 Check: Neon project status and billing');
    } else {
      this.logger.error(`🔍 Unknown Neon connection error: ${error.message}`);
      this.logger.error('💡 Check: Neon console for database status and logs');
    }
  }

  /**
   * Ensure connection is active (useful for long-running operations)
   */
  async ensureConnection(): Promise<void> {
    if (!this.isConnected) {
      await this.connectWithRetry();
      return;
    }

    try {
      // Quick health check
      await Promise.race([
        this.$queryRaw`SELECT 1`,
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Health check timeout')), 5000),
        ),
      ]);
    } catch (error) {
      this.logger.warn('🔄 Connection lost, reconnecting to Neon...');
      this.isConnected = false;

      try {
        await this.$disconnect();
      } catch (disconnectError) {
        // Ignore disconnect errors
      }

      await this.connectWithRetry();
    }
  }

  /**
   * Check if database connection is healthy
   */
  async isHealthy(): Promise<boolean> {
    try {
      await Promise.race([
        this.$queryRaw`SELECT 1 as health`,
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Health check timeout')), 5000),
        ),
      ]);
      return true;
    } catch (error) {
      this.logger.error('💔 Neon database health check failed:', error.message);
      return false;
    }
  }

  /**
   * Get database information
   */
  async getDatabaseInfo(): Promise<{
    database: string;
    username: string;
    version: string;
    serverTime: Date;
  }> {
    const result = (await this.$queryRaw`
      SELECT 
        current_database() as database,
        current_user as username,
        version() as version,
        now() as server_time
    `) as any[];

    return result[0];
  }

  /**
   * Test connection with latency measurement
   */
  async testConnection(): Promise<{
    success: boolean;
    latency?: number;
    error?: string;
    details?: any;
  }> {
    const startTime = Date.now();

    try {
      const result = await Promise.race([
        this.$queryRaw`
          SELECT 
            1 as test_query,
            current_timestamp as query_time,
            current_database() as database,
            current_user as username
        `,
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Test query timeout')), 10000),
        ),
      ]);

      const latency = Date.now() - startTime;

      return {
        success: true,
        latency,
        details: result[0],
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Get connection status for health monitoring
   */
  async getConnectionStatus(): Promise<{
    isConnected: boolean;
    lastError?: string;
    retryCount: number;
    environment: string;
    databaseInfo?: any;
  }> {
    try {
      const dbInfo = await this.getDatabaseInfo();

      return {
        isConnected: this.isConnected,
        retryCount: this.connectionRetries,
        environment: process.env.NODE_ENV || 'development',
        databaseInfo: dbInfo,
      };
    } catch (error) {
      return {
        isConnected: false,
        lastError: error.message,
        retryCount: this.connectionRetries,
        environment: process.env.NODE_ENV || 'development',
      };
    }
  }

  /**
   * Get database statistics
   */
  async getDatabaseStats(): Promise<{
    totalTables: number;
    totalRecords: { [tableName: string]: number };
    databaseSize: string;
  }> {
    try {
      // Get table statistics
      const tableStats = (await this.$queryRaw`
        SELECT 
          schemaname,
          tablename,
          n_live_tup as live_rows
        FROM pg_stat_user_tables 
        ORDER BY n_live_tup DESC;
      `) as any[];

      // Get database size
      const sizeResult = (await this.$queryRaw`
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
   * Check if a table exists in the database
   */
  async checkTableExists(tableName: string): Promise<boolean> {
    try {
      const result = (await this.$queryRaw`
        SELECT EXISTS (
          SELECT FROM information_schema.tables 
          WHERE table_schema = 'public' 
          AND table_name = ${tableName}
        );
      `) as any[];

      return result[0]?.exists || false;
    } catch (error) {
      this.logger.error(
        `Failed to check if table ${tableName} exists:`,
        error.message,
      );
      return false;
    }
  }

  /**
   * Disconnect from the database when the module is destroyed
   */
  async onModuleDestroy() {
    this.logger.log('🔄 Gracefully disconnecting from Neon database...');
    try {
      await this.$disconnect();
      this.isConnected = false;
      this.logger.log('✅ Disconnected from Neon database');
    } catch (error) {
      this.logger.error('❌ Error during Neon disconnect:', error.message);
    }
  }
}
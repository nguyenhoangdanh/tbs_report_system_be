// src/common/prisma.service.ts
import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { EnvironmentConfig } from '../config/config.environment';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(PrismaService.name);
  private connectionRetries = 0;
  private maxRetries = 5;
  private retryDelay = 3000;
  private isConnected = false;
  private isConnecting = false; // Prevent multiple concurrent connections

  constructor(private envConfig: EnvironmentConfig) {
    const config = envConfig.getDatabaseConfig();

    super({
      datasources: config.datasources,
      errorFormat: config.errorFormat,
      transactionOptions: config.transactionOptions,
      log: process.env.NODE_ENV === 'production' 
        ? [{ emit: 'event', level: 'error' }, { emit: 'event', level: 'warn' }]
        : [
            { emit: 'event', level: 'query' },
            { emit: 'event', level: 'error' },
            { emit: 'event', level: 'info' },
            { emit: 'event', level: 'warn' },
          ],
    });

    // Log connection info only once
    const connectionInfo = envConfig.getDatabaseConnectionInfo();
    this.logger.log(`🔗 Database connection info:`, {
      environment: connectionInfo.environment,
      host: connectionInfo.host,
      port: connectionInfo.port,
      database: connectionInfo.database,
      isSSL: connectionInfo.isSSL,
    });
  }

  async onModuleInit() {
    // Prevent multiple initialization
    if (this.isConnecting || this.isConnected) {
      return;
    }

    // For production, connect in background to prevent blocking startup
    if (this.envConfig.isProduction) {
      this.connectAsync();
    } else {
      await this.connectWithRetry();
    }
  }

  private async connectAsync() {
    // Prevent multiple async connections
    if (this.isConnecting) {
      return;
    }

    this.isConnecting = true;
    
    // Connect in background for production to prevent blocking
    setTimeout(async () => {
      try {
        await this.connectWithRetry();
      } catch (error) {
        this.logger.error(
          'Background database connection failed:',
          error.message,
        );
      } finally {
        this.isConnecting = false;
      }
    }, 1000);
  }

  private async connectWithRetry(): Promise<void> {
    // Prevent multiple concurrent connection attempts
    if (this.isConnecting || this.isConnected) {
      return;
    }

    this.isConnecting = true;

    try {
      while (this.connectionRetries < this.maxRetries && !this.isConnected) {
        try {
          this.logger.log(
            `🔄 Attempting database connection (${
              this.connectionRetries + 1
            }/${this.maxRetries})...`,
          );

          // Log connection details (masked) - only once per attempt
          if (this.connectionRetries === 0) {
            const maskedUrl = this.envConfig.databaseUrl.replace(
              /\/\/([^:]+):([^@]+)@/,
              '//***:***@',
            );
            this.logger.log(`📡 Database URL: ${maskedUrl}`);
            this.logger.log(`🌍 Environment: ${this.envConfig.nodeEnv}`);
          }

          // Add timeout to connection attempt
          await Promise.race([
            this.$connect(),
            new Promise((_, reject) =>
              setTimeout(
                () => reject(new Error('Connection timeout after 15s')),
                15000,
              ),
            ),
          ]);

          // Test with simple query
          await Promise.race([
            this.$queryRaw`SELECT 1 as test`,
            new Promise((_, reject) =>
              setTimeout(
                () => reject(new Error('Query timeout after 10s')),
                10000,
              ),
            ),
          ]);

          this.logger.log('✅ Database connected successfully');
          this.isConnected = true;
          this.connectionRetries = 0;

          // Log database info only once
          try {
            const dbInfo = await this.getDatabaseInfo();
            this.logger.log(
              `📊 Connected to: ${dbInfo.database} (${dbInfo.version})`,
            );
          } catch (error) {
            this.logger.warn('Could not fetch database info:', error.message);
          }

          return;
        } catch (error) {
          this.connectionRetries++;
          this.logger.error(
            `❌ Connection failed (${this.connectionRetries}/${this.maxRetries}): ${error.message}`,
          );

          // Enhanced error logging with specific troubleshooting
          this.logConnectionError(error);

          // Disconnect before retry
          try {
            await this.$disconnect();
          } catch (disconnectError) {
            // Ignore disconnect errors
          }

          if (this.connectionRetries >= this.maxRetries) {
            if (this.envConfig.isProduction) {
              this.logger.warn(
                '⚠️ Max retries reached in production, continuing without connection',
              );
              this.logger.warn(
                '🔧 App will start but database operations may fail',
              );
              return;
            } else {
              throw new Error(
                `Database connection failed after ${this.maxRetries} attempts: ${error.message}`,
              );
            }
          }

          // Exponential backoff with jitter
          const delay = Math.min(
            this.retryDelay * Math.pow(1.5, this.connectionRetries - 1) + 
            Math.random() * 1000, // Add jitter
            30000 // Max 30 seconds
          );
          this.logger.log(`⏳ Retrying in ${Math.round(delay)}ms...`);
          await new Promise((resolve) => setTimeout(resolve, delay));
        }
      }
    } finally {
      this.isConnecting = false;
    }
  }

  private logConnectionError(error: any) {
    if (error.message.includes('ENOTFOUND')) {
      this.logger.error('🌐 DNS resolution failed');
      this.logger.error('💡 Check: Database host name is correct');
    } else if (error.message.includes('ECONNREFUSED')) {
      this.logger.error('🚪 Connection refused');
      this.logger.error(
        '💡 Check: Database server is running and accepting connections',
      );
    } else if (error.message.includes('timeout')) {
      this.logger.error('⏰ Connection timeout');
      this.logger.error('💡 Check: Network connectivity and firewall settings');
    } else if (error.message.includes('authentication failed')) {
      this.logger.error('🔐 Authentication failed');
      this.logger.error('💡 Check: Username and password are correct');
    } else if (
      error.message.includes('TLS') ||
      error.message.includes('SSL') ||
      error.message.includes('certificate')
    ) {
      this.logger.error('🔒 TLS/SSL error');
      this.logger.error('💡 Check: SSL configuration and certificates');
    } else if (
      error.message.includes('database') &&
      error.message.includes('does not exist')
    ) {
      this.logger.error('🗄️ Database does not exist');
      this.logger.error('💡 Check: Database name is correct');
    } else {
      this.logger.error(`🔍 Unknown error: ${error.message}`);
    }
  }

  async ensureConnection(): Promise<void> {
    if (!this.isConnected) {
      await this.connectWithRetry();
    }

    try {
      await Promise.race([
        this.$queryRaw`SELECT 1`,
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Health check timeout')), 5000),
        ),
      ]);
    } catch (error) {
      this.logger.warn('🔄 Connection lost, attempting to reconnect...');
      this.isConnected = false;

      try {
        await this.$disconnect();
      } catch (disconnectError) {
        // Ignore disconnect errors
      }

      await this.connectWithRetry();
    }
  }

  async onModuleDestroy() {
    this.logger.log('🔄 Gracefully disconnecting from database...');
    try {
      await this.$disconnect();
      this.isConnected = false;
      this.logger.log('✅ Database disconnected');
    } catch (error) {
      this.logger.error('❌ Error during disconnect:', error);
    }
  }

  async isHealthy(): Promise<boolean> {
    try {
      await Promise.race([
        this.$queryRaw`SELECT 1`,
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Health check timeout')), 5000),
        ),
      ]);
      return true;
    } catch (error) {
      this.logger.error('💔 Database health check failed:', error.message);
      return false;
    }
  }

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
        isConnected: true,
        retryCount: this.connectionRetries,
        environment: this.envConfig.nodeEnv,
        databaseInfo: dbInfo,
      };
    } catch (error) {
      return {
        isConnected: false,
        lastError: error.message,
        retryCount: this.connectionRetries,
        environment: this.envConfig.nodeEnv,
      };
    }
  }

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
          n_tup_ins as inserts,
          n_tup_upd as updates,
          n_tup_del as deletes,
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

  async testConnection(): Promise<{
    success: boolean;
    latency?: number;
    error?: string;
    details?: any;
  }> {
    const startTime = Date.now();

    try {
      const result = await this.$queryRaw`
        SELECT 
          1 as test_query,
          current_timestamp as query_time,
          current_database() as database,
          current_user as user
      `;

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

  async getMigrationStatus(): Promise<{
    appliedMigrations: number;
    pendingMigrations: number;
    lastMigration?: string;
  }> {
    try {
      // Check if _prisma_migrations table exists
      const migrationTableExists =
        await this.checkTableExists('_prisma_migrations');

      if (!migrationTableExists) {
        return {
          appliedMigrations: 0,
          pendingMigrations: 0,
        };
      }

      const migrations = (await this.$queryRaw`
        SELECT 
          migration_name,
          applied_steps_count,
          finished_at
        FROM _prisma_migrations 
        ORDER BY started_at DESC;
      `) as any[];

      const lastMigration = migrations[0];

      return {
        appliedMigrations: migrations.length,
        pendingMigrations: 0, // Prisma doesn't expose this easily
        lastMigration: lastMigration?.migration_name,
      };
    } catch (error) {
      this.logger.error('Failed to get migration status:', error.message);
      return {
        appliedMigrations: 0,
        pendingMigrations: 0,
      };
    }
  }
}

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
  private isConnected = false;
  private connectionRetries = 0;
  private maxRetries = 5;

  constructor() {
    super({
      datasources: {
        db: {
          url: process.env.DATABASE_URL,
        },
      },
      log: process.env.NODE_ENV === 'production' ? ['error'] : ['error', 'warn'],
      errorFormat: 'minimal',
    });
  }

  /**
   * Connect to the database with retry logic for Neon
   */
  async onModuleInit() {
    await this.connectWithRetry();
  }

  private async connectWithRetry(): Promise<void> {
    while (this.connectionRetries < this.maxRetries && !this.isConnected) {
      try {
        this.logger.log(`🔄 Connecting to database (attempt ${this.connectionRetries + 1}/${this.maxRetries})...`);
        
        // Connect with timeout
        await Promise.race([
          this.$connect(),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Connection timeout')), 30000)
          ),
        ]);

        // Test connection
        await this.$queryRaw`SELECT 1 as test`;
        
        this.isConnected = true;
        this.connectionRetries = 0;
        
        // Log success based on database type
        const dbUrl = process.env.DATABASE_URL || '';
        if (dbUrl.includes('railway.app')) {
          this.logger.log('✅ Connected to Railway PostgreSQL');
        } else if (dbUrl.includes('neon.tech')) {
          this.logger.log('✅ Connected to Neon PostgreSQL');
        } else if (dbUrl.includes('localhost')) {
          this.logger.log('✅ Connected to local PostgreSQL');
        } else {
          this.logger.log('✅ Connected to PostgreSQL database');
        }
        
        return;
      } catch (error) {
        this.connectionRetries++;
        this.logger.error(`❌ Connection failed (${this.connectionRetries}/${this.maxRetries}):`, error.message);
        
        // Log specific error details
        this.logConnectionError(error);
        
        if (this.connectionRetries >= this.maxRetries) {
          if (process.env.NODE_ENV === 'production') {
            this.logger.warn('⚠️ Max retries reached. Continuing in degraded mode.');
            return;
          } else {
            throw new Error(`Database connection failed after ${this.maxRetries} attempts: ${error.message}`);
          }
        }

        // Exponential backoff with jitter
        const delay = Math.min(1000 * Math.pow(2, this.connectionRetries - 1), 10000);
        const jitter = Math.random() * 1000;
        const totalDelay = Math.floor(delay + jitter);
        
        this.logger.log(`⏳ Retrying in ${totalDelay}ms...`);
        await new Promise(resolve => setTimeout(resolve, totalDelay));
      }
    }
  }

  private logConnectionError(error: any): void {
    const message = error.message?.toLowerCase() || '';
    const dbUrl = process.env.DATABASE_URL || '';
    
    if (message.includes('enotfound')) {
      this.logger.error('🌐 DNS resolution failed - check database hostname');
    } else if (message.includes('econnrefused')) {
      this.logger.error('🚪 Connection refused - check if database is running');
    } else if (message.includes('timeout')) {
      this.logger.error('⏰ Connection timeout - check network and database availability');
    } else if (message.includes('authentication') || message.includes('password')) {
      this.logger.error('🔐 Authentication failed - check database credentials');
    } else if (message.includes('database') && message.includes('does not exist')) {
      this.logger.error('🗄️ Database does not exist - check database name');
    } else if (message.includes('ssl') || message.includes('tls')) {
      this.logger.error('🔒 SSL/TLS error - check SSL configuration');
    } else if (message.includes('terminating') || message.includes('administrator')) {
      this.logger.error('💤 Database connection terminated by administrator');
    } else {
      this.logger.error(`🔍 Database error: ${error.message}`);
    }
    
    // Log database type for context
    if (dbUrl.includes('neon.tech')) {
      this.logger.error('💡 Neon database - check console.neon.tech for status');
    } else if (dbUrl.includes('railway.app')) {
      this.logger.error('💡 Railway database - check Railway dashboard for status');
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
          setTimeout(() => reject(new Error('Health check timeout')), 5000)
        ),
      ]);
      return true;
    } catch (error) {
      this.logger.error('💔 Database health check failed:', error.message);
      return false;
    }
  }

  async getConnectionInfo(): Promise<any> {
    try {
      const result = await this.$queryRaw`
        SELECT 
          current_database() as database,
          current_user as username,
          version() as version,
          NOW() as server_time
      ` as any[];
      
      return result[0];
    } catch (error) {
      this.logger.error('Failed to get connection info:', error.message);
      return null;
    }
  }

  /**
   * Disconnect from the database when the module is destroyed
   */
  async onModuleDestroy() {
    if (this.isConnected) {
      this.logger.log('🔄 Disconnecting from database...');
      try {
        await this.$disconnect();
        this.isConnected = false;
        this.logger.log('✅ Database disconnected successfully');
      } catch (error) {
        this.logger.error('❌ Error during disconnect:', error.message);
      }
    }
  }
}
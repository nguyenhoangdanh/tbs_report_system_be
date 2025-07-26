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

  constructor() {
    super({
      datasources: {
        db: {
          url: process.env.DATABASE_URL,
        },
      },
      log: process.env.NODE_ENV === 'production' ? ['error', 'warn'] : ['error', 'warn', 'info'],
      errorFormat: 'minimal',
      // Railway-specific timeout configurations
      // __internal: {
      //   engine: {
      //     connectTimeout: 60000, // 60 seconds for Railway cold starts
      //     requestTimeout: 60000,
      //   },
      // },
    });
  }

  /**
   * Connect to the database with retry logic for Neon
   */
  async onModuleInit() {
    try {
      this.logger.log('🔄 Connecting to database...');
      
      // Increased timeout for Railway cold starts
      await Promise.race([
        this.$connect(),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Connection timeout after 60s')), 60000),
        ),
      ]);

      // Verify connection
      await this.$queryRaw`SELECT 1 as health_check`;
      
      this.isConnected = true;
      
      // Log environment info
      const dbUrl = process.env.DATABASE_URL;
      if (dbUrl?.includes('railway.app')) {
        this.logger.log('✅ Connected to Railway database successfully');
      } else if (dbUrl?.includes('neon.tech')) {
        this.logger.log('✅ Connected to Neon PostgreSQL successfully');
      } else {
        this.logger.log('✅ Connected to database successfully');
      }
      
    } catch (error) {
      this.logger.error('❌ Failed to connect to database:', error.message);
      
      if (process.env.NODE_ENV === 'production') {
        this.logger.warn('⚠️ Continuing in production mode - database operations may fail');
      } else {
        throw error;
      }
    }
  }

  /**
   * Disconnect from the database when the module is destroyed
   */
  async onModuleDestroy() {
    if (this.isConnected) {
      this.logger.log('🔄 Disconnecting from Neon PostgreSQL...');
      try {
        await this.$disconnect();
        this.logger.log('✅ Disconnected from database');
      } catch (error) {
        this.logger.error('❌ Error during disconnect:', error.message);
      }
    }
  }

  /**
   * Check if database connection is healthy
   */
  async isHealthy(): Promise<boolean> {
    try {
      await this.$queryRaw`SELECT 1 as health`;
      return true;
    } catch (error) {
      this.logger.error('💔 Database health check failed:', error.message);
      return false;
    }
  }
}
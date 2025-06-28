// src/common/prisma.service.ts
import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(PrismaService.name);
  private connectionRetries = 0;
  private maxRetries = 3; // Reduced for faster startup
  private retryDelay = 2000; // 2 seconds
  private isConnected = false;

  constructor() {
    const isProduction = process.env.NODE_ENV === 'production';
    
    super({
      datasources: {
        db: {
          url: process.env.DATABASE_URL,
        },
      },
      log: isProduction ? ['error'] : ['error', 'warn'],
      errorFormat: 'minimal',
      // Add connection pooling and timeout settings for production
      ...(isProduction && {
        transactionOptions: {
          timeout: 30000, // 30 seconds
        },
        // Add SSL configuration for production
        __internal: {
          engine: {
            enableRawQueries: true,
          },
        },
      }),
    });
  }

  async onModuleInit() {
    // Don't block app startup on database connection in production
    if (process.env.NODE_ENV === 'production') {
      this.connectAsync();
    } else {
      await this.connectWithRetry();
    }
  }

  private async connectAsync() {
    // Connect in background for production
    setTimeout(async () => {
      try {
        await this.connectWithRetry();
      } catch (error) {
        this.logger.error('Background database connection failed:', error.message);
      }
    }, 1000);
  }

  private async connectWithRetry(): Promise<void> {
    while (this.connectionRetries < this.maxRetries) {
      try {
        this.logger.log(`🔄 Attempting database connection (attempt ${this.connectionRetries + 1}/${this.maxRetries})...`);
        this.logger.log(`📡 Database URL: ${process.env.DATABASE_URL?.replace(/\/\/.*@/, '//***:***@')}`);
        
        // Add timeout to connection attempt
        await Promise.race([
          this.$connect(),
          new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Connection timeout after 10s')), 10000)
          )
        ]);
        
        this.logger.log('✅ Database connected successfully');
        
        // Test connection with a simple query with timeout
        await Promise.race([
          this.$queryRaw`SELECT 1 as test`,
          new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Query timeout after 5s')), 5000)
          )
        ]);
        
        this.logger.log('✅ Database query test passed');
        
        this.isConnected = true;
        this.connectionRetries = 0; // Reset on success
        
        return;
      } catch (error) {
        this.connectionRetries++;
        this.isConnected = false;
        this.logger.error(`❌ Database connection failed (attempt ${this.connectionRetries}):`, error.message);
        
        // Log specific TLS errors
        if (error.message.includes('TLS') || error.message.includes('SSL') || error.message.includes('EOF')) {
          this.logger.error('🔒 TLS/SSL connection error detected. This might be a Fly.io database connectivity issue.');
        }
        
        // Disconnect before retry
        try {
          await this.$disconnect();
        } catch (disconnectError) {
          // Ignore disconnect errors
        }
        
        if (this.connectionRetries >= this.maxRetries) {
          this.logger.error('🚨 Max database connection retries reached');
          
          // In production, don't throw - let app start but mark as unhealthy
          if (process.env.NODE_ENV === 'production') {
            this.logger.warn('⚠️ Continuing startup without database connection');
            return;
          } else {
            throw new Error(`Failed to connect to database after ${this.maxRetries} attempts: ${error.message}`);
          }
        }
        
        this.logger.log(`⏳ Retrying in ${this.retryDelay}ms...`);
        await new Promise(resolve => setTimeout(resolve, this.retryDelay));
      }
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
          setTimeout(() => reject(new Error('Query timeout')), 5000)
        )
      ]);
    } catch (error) {
      this.logger.warn('🔄 Database connection lost, attempting to reconnect...');
      this.isConnected = false;
      
      // Disconnect before reconnecting
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
      this.logger.error('❌ Error during database disconnect:', error);
    }
  }

  async isHealthy(): Promise<boolean> {
    try {
      await Promise.race([
        this.$queryRaw`SELECT 1`,
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Database query timeout')), 5000)
        )
      ]);
      return true;
    } catch (error) {
      this.logger.error('💔 Database health check failed:', error.message);
      return false;
    }
  }

  async getConnectionStatus(): Promise<{
    isConnected: boolean;
    lastError?: string;
    retryCount: number;
  }> {
    try {
      await Promise.race([
        this.$queryRaw`SELECT current_database(), current_user, version()`,
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Connection status timeout')), 3000)
        )
      ]);
      return {
        isConnected: true,
        retryCount: this.connectionRetries,
      };
    } catch (error) {
      return {
        isConnected: false,
        lastError: error.message,
        retryCount: this.connectionRetries,
      };
    }
  }
}

import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

// Global connection cache for Vercel
declare global {
  var __prisma: PrismaClient | undefined;
}

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  constructor() {
    // Use singleton pattern for Vercel serverless
    if (global.__prisma) {
      return global.__prisma as any;
    }

    super({
      log: process.env.NODE_ENV === 'production' 
        ? ['error'] 
        : ['error', 'warn'],
      
      datasources: {
        db: {
          url: process.env.DATABASE_URL,
        },
      },
    });

    // Cache the instance globally
    if (process.env.NODE_ENV === 'production') {
      global.__prisma = this;
    }
  }

  async onModuleInit() {
    try {
      // Quick connection test with timeout
      const connectPromise = this.$connect();
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Connection timeout')), 5000)
      );
      
      await Promise.race([connectPromise, timeoutPromise]);
      this.logger.log('✅ Database connected');
    } catch (error) {
      this.logger.error('❌ Database connection failed:', error);
      // Don't throw error to prevent app crash on cold start
    }
  }

  async onModuleDestroy() {
    // Don't disconnect in production to maintain connection pool
    if (process.env.NODE_ENV !== 'production') {
      await this.$disconnect();
    }
  }

  // Health check method
  async isHealthy(): Promise<boolean> {
    try {
      await this.$queryRaw`SELECT 1`;
      return true;
    } catch {
      return false;
    }
  }
}

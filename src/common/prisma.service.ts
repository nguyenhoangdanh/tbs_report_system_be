// src/share/prisma.service.ts
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
  private static instance: PrismaService | undefined;

  constructor() {
    super({
      log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
      errorFormat: 'minimal',
      datasources: {
        db: {
          url: process.env.DATABASE_URL,
        },
      },
    });

    // Store instance for serverless reuse without 'this' aliasing
    if (process.env.NODE_ENV === 'production' && !PrismaService.instance) {
      PrismaService.instance = this;
    }
  }

  static getInstance(): PrismaService {
    if (process.env.NODE_ENV === 'production' && PrismaService.instance) {
      return PrismaService.instance;
    }
    return new PrismaService();
  }

  async onModuleInit() {
    try {
      await this.$connect();
      if (process.env.NODE_ENV !== 'production') {
        this.logger.log('✅ Database connected');
      }
    } catch (error) {
      this.logger.error('❌ Database connection failed:', error);
      // Don't throw in production to prevent cold start failures
      if (process.env.NODE_ENV !== 'production') {
        throw error;
      }
    }
  }

  async onModuleDestroy() {
    // Keep connections alive in production for reuse
    if (process.env.NODE_ENV !== 'production') {
      await this.$disconnect();
    }
  }

  async isHealthy(): Promise<boolean> {
    try {
      await this.$queryRaw`SELECT 1`;
      return true;
    } catch (error) {
      this.logger.error('Database health check failed:', error);
      return false;
    }
  }

  // Utility method to handle Prisma errors consistently
  handleError(error: any, context: string): never {
    this.logger.error(
      `Database error in ${context}: ${error.message}`,
      error.stack,
    );
    throw error;
  }
}

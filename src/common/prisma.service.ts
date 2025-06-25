import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  constructor() {
    super({
      // Chỉ cần config cơ bản
      log: process.env.NODE_ENV === 'production' 
        ? ['error', 'warn'] 
        : ['query', 'info', 'warn', 'error'],
      
      datasources: {
        db: {
          url: process.env.DATABASE_URL,
        },
      },
      // Bỏ hết config __internal - Prisma tự handle connection pooling
    });
  }

  async onModuleInit() {
    try {
      await this.$connect();
      this.logger.log('✅ Connected to database');
    } catch (error) {
      this.logger.error('❌ Failed to connect to database:', error);
      throw error;
    }
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}

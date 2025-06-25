import { Controller, Get, Logger } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { AppService } from './app.service';
import { PrismaService } from './common/prisma.service';
import { Public } from './common/decorators/public.decorator';

@ApiTags('app')
@Controller()
export class AppController {
  private readonly logger = new Logger(AppController.name);

  constructor(
    private readonly appService: AppService,
    private readonly prismaService: PrismaService,
  ) {}

  @Get()
  @Public()
  @ApiOperation({ summary: 'Get API status' })
  @ApiResponse({ status: 200, description: 'API is running' })
  getStatus() {
    return this.appService.getStatus();
  }

  @Get('health')
  @Public()
  @ApiOperation({ summary: 'Health check' })
  @ApiResponse({ status: 200, description: 'Health status' })
  async getHealth() {
    const startTime = Date.now();

    try {
      const isDbHealthy = await this.prismaService.isHealthy();
      const dbLatency = Date.now() - startTime;

      return {
        status: 'ok',
        timestamp: new Date().toISOString(),
        database: {
          status: isDbHealthy ? 'connected' : 'disconnected',
          latency: `${dbLatency}ms`,
        },
        environment: process.env.NODE_ENV || 'development',
        version: '1.0.0',
        uptime: Math.floor(process.uptime()),
      };
    } catch (error) {
      const dbLatency = Date.now() - startTime;
      this.logger.error('Health check failed:', error);

      return {
        status: 'error',
        timestamp: new Date().toISOString(),
        database: {
          status: 'error',
          latency: `${dbLatency}ms`,
          error: error.message,
        },
        environment: process.env.NODE_ENV || 'development',
        version: '1.0.0',
      };
    }
  }
}

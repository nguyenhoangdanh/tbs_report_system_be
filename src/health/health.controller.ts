import { Controller, Get } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { Public } from '../common/decorators/public.decorator';

@Controller('health')
@Public()
export class HealthController {
  constructor(private readonly prismaService: PrismaService) {}

  @Get()
  async getHealth() {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      environment: process.env.NODE_ENV,
      version: '1.0.0',
    };
  }

  @Get('db')
  async getDatabaseHealth() {
    try {
      const connectionStatus = await this.prismaService.getConnectionStatus();

      return {
        status: 'ok',
        database: {
          status: connectionStatus.isConnected ? 'healthy' : 'unhealthy',
          ...connectionStatus,
        },
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      return {
        status: 'error',
        database: {
          status: 'unhealthy',
          error: error.message,
        },
        timestamp: new Date().toISOString(),
      };
    }
  }

  @Get('detailed')
  async getDetailedHealth() {
    try {
      const connectionStatus = await this.prismaService.getConnectionStatus();
      const dbStats = await this.prismaService.getDatabaseStats();
      const migrationStatus = await this.prismaService.getMigrationStatus();

      return {
        status: 'ok',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        environment: process.env.NODE_ENV,
        version: '1.0.0',
        database: {
          connection: connectionStatus,
          stats: dbStats,
          migrations: migrationStatus,
        },
        memory: {
          used: Math.round(process.memoryUsage().heapUsed / 1024 / 1024) + ' MB',
          total: Math.round(process.memoryUsage().heapTotal / 1024 / 1024) + ' MB',
        },
      };
    } catch (error) {
      return {
        status: 'error',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        environment: process.env.NODE_ENV,
        version: '1.0.0',
        error: error.message,
        memory: {
          used: Math.round(process.memoryUsage().heapUsed / 1024 / 1024) + ' MB',
          total: Math.round(process.memoryUsage().heapTotal / 1024 / 1024) + ' MB',
        },
      };
    }
  }
}

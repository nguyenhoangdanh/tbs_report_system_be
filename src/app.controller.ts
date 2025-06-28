import { Controller, Get } from '@nestjs/common';
import { AppService } from './app.service';
import { PrismaService } from './common/prisma.service';
import { Public } from './common/decorators/public.decorator';

@Controller()
export class AppController {
  constructor(
    private readonly appService: AppService,
    private readonly prismaService: PrismaService,
  ) {}

  @Get()
  @Public()
  getRoot() {
    return {
      message: 'Weekly Work Report API',
      status: 'ok',
      timestamp: new Date().toISOString(),
      version: '1.0.0',
      endpoints: {
        health: '/health',
        apiHealth: '/api/health',
        databaseHealth: '/api/health/db',
        docs: '/api',
      },
    };
  }

  @Get('health')
  @Public()
  getHealth() {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      environment: process.env.NODE_ENV,
      version: '1.0.0',
      pid: process.pid,
      memory: process.memoryUsage(),
    };
  }

  @Get('api/health')
  @Public()
  getApiHealth() {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      environment: process.env.NODE_ENV,
      version: '1.0.0',
      services: {
        api: {
          status: 'operational',
        },
      },
      system: {
        pid: process.pid,
        memory: process.memoryUsage(),
        cpu: process.cpuUsage(),
        platform: process.platform,
        nodeVersion: process.version,
      },
    };
  }

  @Get('api/health/db')
  @Public()
  async getDatabaseHealth() {
    try {
      console.log('🔍 Database health check requested');

      // Get comprehensive database status
      const [isHealthy, connectionStatus, stats, migrationStatus] =
        await Promise.all([
          this.prismaService.isHealthy(),
          this.prismaService.getConnectionStatus(),
          this.prismaService.getDatabaseStats().catch(() => null),
          this.prismaService.getMigrationStatus().catch(() => null),
        ]);

      console.log('📊 Database status:', { isHealthy, connectionStatus });

      if (isHealthy) {
        return {
          status: 'ok',
          timestamp: new Date().toISOString(),
          database: {
            status: 'connected',
            isHealthy: true,
            ...connectionStatus,
            stats,
            migrations: migrationStatus,
          },
        };
      } else {
        return {
          status: 'degraded',
          timestamp: new Date().toISOString(),
          database: {
            status: 'disconnected',
            isHealthy: false,
            ...connectionStatus,
          },
        };
      }
    } catch (error) {
      console.error('❌ Database health check error:', error);
      return {
        status: 'error',
        timestamp: new Date().toISOString(),
        database: {
          status: 'error',
          isHealthy: false,
          error: error.message,
          environment: process.env.NODE_ENV,
        },
      };
    }
  }

  @Get('api/health/detailed')
  @Public()
  async getDetailedHealth() {
    try {
      const [connectionTest, databaseStats, migrationStatus] =
        await Promise.all([
          this.prismaService.testConnection(),
          this.prismaService.getDatabaseStats().catch(() => null),
          this.prismaService.getMigrationStatus().catch(() => null),
        ]);

      return {
        status: connectionTest.success ? 'ok' : 'error',
        timestamp: new Date().toISOString(),
        environment: process.env.NODE_ENV,
        database: {
          connection: connectionTest,
          stats: databaseStats,
          migrations: migrationStatus,
        },
        system: {
          uptime: process.uptime(),
          memory: process.memoryUsage(),
          cpu: process.cpuUsage(),
          platform: process.platform,
          nodeVersion: process.version,
          pid: process.pid,
        },
      };
    } catch (error) {
      return {
        status: 'error',
        timestamp: new Date().toISOString(),
        error: error.message,
      };
    }
  }
}

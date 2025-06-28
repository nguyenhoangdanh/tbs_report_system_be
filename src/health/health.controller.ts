import { Controller, Get } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { Public } from '../common/decorators/public.decorator';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(private readonly prismaService: PrismaService) {}

  @Get()
  @Public()
  @ApiOperation({ summary: 'Basic health check' })
  @ApiResponse({ status: 200, description: 'API is healthy' })
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

  @Get('db')
  @Public()
  @ApiOperation({ summary: 'Database health check' })
  @ApiResponse({ status: 200, description: 'Database is healthy' })
  @ApiResponse({ status: 503, description: 'Database is unhealthy' })
  async getDatabaseHealth() {
    try {
      console.log('🔍 Database health check requested');
      const isHealthy = await this.prismaService.isHealthy();
      const connectionStatus = await this.prismaService.getConnectionStatus();

      console.log('📊 Database status:', { isHealthy, connectionStatus });

      if (isHealthy) {
        return {
          status: 'ok',
          timestamp: new Date().toISOString(),
          database: {
            status: 'connected',
            isHealthy: true,
            ...connectionStatus,
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
        },
      };
    }
  }
}

import { Module, OnApplicationShutdown } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { OfficesModule } from './offices/offices.module';
import { DepartmentsModule } from './departments/departments.module';
import { PositionsModule } from './positions/positions.module';
import { JobPositionsModule } from './job-positions/job-positions.module';
import { ReportsModule } from './reports/reports.module';
import { StatisticsModule } from './statistics/statistics.module';
import { PrismaService } from './common/prisma.service';
import { OrganizationsModule } from './organizations/organizations.module';
import { EnvironmentConfig } from './config/config.environment';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ScheduleTasksModule } from './schedule/schedule.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true, // Cache config for performance
      expandVariables: false, // Disable for performance
    }),
    // ScheduleModule,
    AuthModule,
    UsersModule,
    OfficesModule,
    DepartmentsModule,
    PositionsModule,
    JobPositionsModule,
    ReportsModule,
    StatisticsModule,
    ScheduleTasksModule,
    OrganizationsModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: PrismaService,
      useClass: PrismaService,
      // Make singleton
      scope: 1, // Singleton scope
    },
    EnvironmentConfig,
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
  ],
  exports: [PrismaService], // Export for other modules
})
export class AppModule implements OnApplicationShutdown {
  constructor(private readonly prismaService: PrismaService) {}

  // Graceful shutdown handling
  async onApplicationShutdown(signal?: string) {
    console.log(`🛑 Application shutdown signal received: ${signal}`);
  }
}

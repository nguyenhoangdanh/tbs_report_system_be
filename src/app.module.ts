import { Module } from '@nestjs/common';
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
import { HierarchyReportsModule } from './hierarchy-reports/hierarchy-reports.module';
import { PrismaService } from './common/prisma.service';
import { OrganizationsModule } from './organizations/organizations.module';
import { EnvironmentConfig } from './config/config.environment';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ScheduleTasksModule } from './schedule/schedule.module';
import { ServeStaticModule } from '@nestjs/serve-static';
import { join } from 'path';
import { HealthModule } from './health/health.module';

@Module({
  imports: [
    // Conditionally serve static files only in development
    ...(process.env.NODE_ENV !== 'production'
      ? [
          ServeStaticModule.forRoot({
            rootPath: join(__dirname, '..', 'uploads'),
            serveRoot: '/uploads',
            exclude: ['/api*'],
          }),
          ServeStaticModule.forRoot({
            rootPath: join(__dirname, '..', 'public'),
            serveRoot: '/',
            exclude: ['/api*'],
          }),
        ]
      : []),

    // Config module với file loading order cải thiện
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: [
        `.env.${process.env.NODE_ENV || 'development'}`,
        '.env.local',
        '.env',
      ],
      expandVariables: true,
      cache: true,
    }),

    // Feature modules
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
    HierarchyReportsModule,
    HealthModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    PrismaService,
    EnvironmentConfig,
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
  ],
  exports: [PrismaService],
})
export class AppModule {}
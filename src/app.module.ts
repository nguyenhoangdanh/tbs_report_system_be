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
import { PrismaService } from './common/prisma.service';
import { OrganizationsModule } from './organizations/organizations.module';
import { EnvironmentConfig } from './config/config.environment';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ScheduleTasksModule } from './schedule/schedule.module';
import { ServeStaticModule } from '@nestjs/serve-static';
import { join } from 'path';

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

    // Config module
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath:
        process.env.NODE_ENV === 'production'
          ? '.env'
          : `.env.${process.env.NODE_ENV || 'development'}`,
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
      useFactory: () => {
        return process.env.NODE_ENV === 'production' 
          ? PrismaService.getInstance() 
          : new PrismaService();
      },
      scope: 1, // Singleton
    },
    EnvironmentConfig,
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
  ],
  exports: [PrismaService], // Export for other modules
})
export class AppModule {}
import { Module } from '@nestjs/common';
import { ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';
import { PrismaService } from '../common/prisma.service';
import { EnvironmentConfig } from '../config/config.environment';

@Module({
  controllers: [ReportsController],
  providers: [ReportsService, PrismaService, EnvironmentConfig],
  exports: [ReportsService],
})
export class ReportsModule {}

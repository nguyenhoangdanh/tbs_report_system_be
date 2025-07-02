import { Module } from '@nestjs/common';
import { StatisticsController } from './statistics.controller';
import { StatisticsService } from './statistics.service';
import { PrismaService } from '../common/prisma.service';
import { HierarchyReportsModule } from '../hierarchy-reports/hierarchy-reports.module';

@Module({
  imports: [HierarchyReportsModule],
  controllers: [StatisticsController],
  providers: [StatisticsService, PrismaService],
  exports: [StatisticsService],
})
export class StatisticsModule {}

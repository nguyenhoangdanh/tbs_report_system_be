import { Module } from '@nestjs/common';
import { HierarchyReportsController } from './hierarchy-reports.controller';
import { HierarchyReportsService } from './hierarchy-reports.service';
import { PrismaService } from 'src/common/prisma.service';

@Module({
  controllers: [HierarchyReportsController],
  providers: [HierarchyReportsService,PrismaService],
  exports: [HierarchyReportsService],
})
export class HierarchyReportsModule {}

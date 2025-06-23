import { Module } from '@nestjs/common';
import { ScheduleService } from './schedule.service';
import { ReportsModule } from '../reports/reports.module';

@Module({
  imports: [ReportsModule],
  providers: [ScheduleService],
})
export class ScheduleTasksModule {}

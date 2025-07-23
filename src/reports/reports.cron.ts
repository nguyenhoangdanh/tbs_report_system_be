import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ReportsService } from './reports.service';
import { getCurrentWorkWeek, getPreviousWorkWeek } from '../common/utils/week-utils';

@Injectable()
export class ReportsCron {
  private readonly logger = new Logger(ReportsCron.name);

  constructor(private readonly reportsService: ReportsService) {}

  // Chạy vào 0h thứ 6 hàng tuần
  @Cron('0 0 * * 5')
  async handleLockPreviousWorkWeekReports() {
    const { weekNumber, year } = getCurrentWorkWeek();
    const prev = getPreviousWorkWeek(weekNumber, year);
    this.logger.log(`Auto-locking reports for work week ${prev.weekNumber}/${prev.year}`);
    await this.reportsService.lockReportsByWeek(prev.weekNumber, prev.year);
  }
}

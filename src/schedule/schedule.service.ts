import { Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ReportsService } from '../reports/reports.service';

@Injectable()
export class ScheduleService {
  constructor(private reportsService: ReportsService) {}

  // Run every Saturday at 10:00 AM
  @Cron('0 10 * * 6', {
    name: 'lockWeeklyReports',
    timeZone: 'Asia/Ho_Chi_Minh',
  })
  async lockWeeklyReports() {
    console.log('🕙 Running scheduled task: Lock weekly reports');
    try {
      await this.reportsService.lockReportsForCurrentWeek();
      console.log('✅ Weekly reports locked successfully');
    } catch (error) {
      console.error('❌ Error locking weekly reports:', error);
    }
  }

  // Alternative: Run every hour on Saturday to check if it's past 10 AM
  @Cron(CronExpression.EVERY_HOUR, {
    name: 'checkReportLocking',
    timeZone: 'Asia/Ho_Chi_Minh',
  })
  async checkReportLocking() {
    const now = new Date();
    const isSaturday = now.getDay() === 6; // Saturday is day 6
    const isAfter10AM = now.getHours() >= 10;

    if (isSaturday && isAfter10AM) {
      console.log('🕙 Running hourly check: Lock weekly reports');
      try {
        await this.reportsService.lockReportsForCurrentWeek();
      } catch (error) {
        console.error('❌ Error in hourly report lock check:', error);
      }
    }
  }
}

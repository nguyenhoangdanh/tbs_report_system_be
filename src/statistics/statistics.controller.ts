import { Controller, Get, Query, Request, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { Roles } from 'src/common/decorators/roles.decorator';
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';
import { RolesGuard } from 'src/common/guards/roles.guard';
import { StatisticsService } from './statistics.service';

@ApiTags('Statistics')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard)
@Controller('statistics')
export class StatisticsController {
  constructor(private readonly statisticsService: StatisticsService) {}

  @Get('dashboard')
  @ApiOperation({
    summary: 'Get dashboard statistics for current user including incomplete task reasons',
  })
  @ApiResponse({
    status: 200,
    description: 'Statistics retrieved successfully with incomplete task analysis',
  })
  async getDashboardStats(@Request() req) {
    return this.statisticsService.getDashboardStats(req.user.id);
  }

  @Get('admin-dashboard')
  @ApiOperation({ summary: 'Get admin dashboard statistics' })
  @ApiResponse({
    status: 200,
    description: 'Admin statistics retrieved successfully',
  })
  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'SUPERADMIN')
  async getAdminDashboardStats(
    @Request() req,
    @Query('departmentId') departmentId?: string,
    @Query('weekNumber') weekNumber?: number,
    @Query('year') year?: number,
  ) {
    return this.statisticsService.getAdminDashboardStats(req.user, {
      departmentId,
      weekNumber,
      year,
    });
  }

  @Get('user-reports')
  @ApiOperation({
    summary: 'Get user report statistics with incomplete reasons analysis',
  })
  @ApiResponse({
    status: 200,
    description: 'User report statistics retrieved successfully with reasons analysis',
  })
  async getUserReportStats(@Request() req) {
    return this.statisticsService.getUserReportStats(req.user.id);
  }

  @Get('recent-activities')
  @ApiOperation({
    summary: 'Get recent activities for user with incomplete task reasons',
  })
  @ApiResponse({
    status: 200,
    description: 'Recent activities retrieved successfully with incomplete reasons',
  })
  async getRecentActivities(@Request() req) {
    return this.statisticsService.getRecentActivities(req.user.id);
  }

  @Get('overview')
  @ApiOperation({ summary: 'Get overall statistics overview' })
  @ApiResponse({
    status: 200,
    description: 'Statistics overview retrieved successfully',
  })
  getOverview() {
    return this.statisticsService.getOverview();
  }

  @Get('completion-rate')
  @ApiOperation({ summary: 'Get completion rate by department and week' })
  @ApiQuery({ name: 'week', required: false, description: 'Week number' })
  @ApiQuery({ name: 'year', required: false, description: 'Year' })
  @ApiQuery({
    name: 'departmentId',
    required: false,
    description: 'Department ID',
  })
  @ApiResponse({
    status: 200,
    description: 'Completion rate retrieved successfully',
  })
  getCompletionRate(
    @Query('week') week?: string,
    @Query('year') year?: string,
    @Query('departmentId') departmentId?: string,
  ) {
    return this.statisticsService.getCompletionRate({
      week: week ? parseInt(week) : undefined,
      year: year ? parseInt(year) : undefined,
      departmentId,
    });
  }

  @Get('missing-reports')
  @ApiOperation({ summary: 'Get employees who have not submitted reports' })
  @ApiQuery({ name: 'week', required: false, description: 'Week number' })
  @ApiQuery({ name: 'year', required: false, description: 'Year' })
  @ApiResponse({
    status: 200,
    description: 'Missing reports retrieved successfully',
  })
  getMissingReports(
    @Query('week') week?: string,
    @Query('year') year?: string,
  ) {
    return this.statisticsService.getMissingReports({
      week: week ? parseInt(week) : undefined,
      year: year ? parseInt(year) : undefined,
    });
  }

  @Get('summary-report')
  @ApiOperation({ summary: 'Get comprehensive summary report' })
  @ApiQuery({ name: 'week', required: false, description: 'Week number' })
  @ApiQuery({ name: 'year', required: false, description: 'Year' })
  @ApiResponse({
    status: 200,
    description: 'Summary report retrieved successfully',
  })
  getSummaryReport(@Query('week') week?: string, @Query('year') year?: string) {
    return this.statisticsService.getSummaryReport({
      week: week ? parseInt(week) : undefined,
      year: year ? parseInt(year) : undefined,
    });
  }

  @Get('weekly-task-stats')
  @ApiOperation({
    summary: 'Get weekly completed/uncompleted task statistics with reasons analysis',
  })
  @ApiResponse({
    status: 200,
    description: 'Weekly task stats retrieved successfully with incomplete reasons',
  })
  async getWeeklyTaskStats(@Request() req) {
    return this.statisticsService.getWeeklyTaskStats(req.user.id);
  }

  @Get('monthly-task-stats')
  @ApiOperation({
    summary: 'Get monthly completed/uncompleted task statistics with top incomplete reasons',
  })
  @ApiQuery({ name: 'year', required: false, description: 'Year' })
  @ApiResponse({
    status: 200,
    description: 'Monthly task stats retrieved successfully with reasons breakdown',
  })
  async getMonthlyTaskStats(@Request() req, @Query('year') year?: string) {
    return this.statisticsService.getMonthlyTaskStats(
      req.user.id,
      year ? parseInt(year) : undefined,
    );
  }

  @Get('yearly-task-stats')
  @ApiOperation({
    summary: 'Get yearly completed/uncompleted task statistics with comprehensive reasons analysis',
  })
  @ApiResponse({
    status: 200,
    description: 'Yearly task stats retrieved successfully with detailed reasons',
  })
  async getYearlyTaskStats(@Request() req) {
    return this.statisticsService.getYearlyTaskStats(req.user.id);
  }

  @Get('incomplete-reasons-analysis')
  @ApiOperation({
    summary: 'Get detailed analysis of incomplete task reasons with filters',
  })
  @ApiQuery({ name: 'weekNumber', required: false, description: 'Specific week number' })
  @ApiQuery({ name: 'year', required: false, description: 'Specific year' })
  @ApiQuery({ name: 'startDate', required: false, description: 'Start date for date range filter (ISO string)' })
  @ApiQuery({ name: 'endDate', required: false, description: 'End date for date range filter (ISO string)' })
  @ApiResponse({
    status: 200,
    description: 'Detailed incomplete reasons analysis retrieved successfully',
  })
  async getIncompleteReasonsAnalysis(
    @Request() req,
    @Query('weekNumber') weekNumber?: string,
    @Query('year') year?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    const filters: any = {};

    if (weekNumber) filters.weekNumber = parseInt(weekNumber);
    if (year) filters.year = parseInt(year);
    if (startDate) filters.startDate = new Date(startDate);
    if (endDate) filters.endDate = new Date(endDate);

    return this.statisticsService.getIncompleteReasonsAnalysis(req.user.id, filters);
  }
}

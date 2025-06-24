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
  @ApiOperation({ summary: 'Get dashboard statistics for current user' })
  @ApiResponse({
    status: 200,
    description: 'Statistics retrieved successfully',
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
  @ApiOperation({ summary: 'Get user report statistics' })
  @ApiResponse({
    status: 200,
    description: 'User report statistics retrieved successfully',
  })
  async getUserReportStats(@Request() req) {
    return this.statisticsService.getUserReportStats(req.user.id);
  }

  @Get('recent-activities')
  @ApiOperation({ summary: 'Get recent activities for user' })
  @ApiResponse({
    status: 200,
    description: 'Recent activities retrieved successfully',
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
    summary:
      'Get weekly completed/uncompleted task statistics for current user',
  })
  @ApiResponse({
    status: 200,
    description: 'Weekly task stats retrieved successfully',
  })
  async getWeeklyTaskStats(@Request() req) {
    return this.statisticsService.getWeeklyTaskStats(req.user.id);
  }

  @Get('monthly-task-stats')
  @ApiOperation({
    summary:
      'Get monthly completed/uncompleted task statistics for current user',
  })
  @ApiQuery({ name: 'year', required: false, description: 'Year' })
  @ApiResponse({
    status: 200,
    description: 'Monthly task stats retrieved successfully',
  })
  async getMonthlyTaskStats(@Request() req, @Query('year') year?: string) {
    return this.statisticsService.getMonthlyTaskStats(
      req.user.id,
      year ? parseInt(year) : undefined,
    );
  }

  @Get('yearly-task-stats')
  @ApiOperation({
    summary:
      'Get yearly completed/uncompleted task statistics for current user',
  })
  @ApiResponse({
    status: 200,
    description: 'Yearly task stats retrieved successfully',
  })
  async getYearlyTaskStats(@Request() req) {
    return this.statisticsService.getYearlyTaskStats(req.user.id);
  }
}

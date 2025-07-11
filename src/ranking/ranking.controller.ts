import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiQuery, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '@prisma/client';
import { RankingService } from './ranking.service';

@ApiTags('Employee Ranking & Classification')
@ApiBearerAuth('JWT-auth')
@Controller('ranking')
@UseGuards(JwtAuthGuard)
export class RankingController {
  constructor(private readonly rankingService: RankingService) {}

  @Get('employees')
  @ApiOperation({ summary: 'Get employee rankings and classifications' })
  @ApiQuery({ name: 'employeeId', required: false, description: 'Specific employee ID' })
  @ApiQuery({ name: 'weekNumber', required: false, description: 'Specific week number' })
  @ApiQuery({ name: 'year', required: false, description: 'Specific year' })
  @ApiQuery({ name: 'periodWeeks', required: false, description: 'Number of weeks to analyze (default: 4)' })
  @ApiResponse({ status: 200, description: 'Employee rankings retrieved successfully' })
  async getEmployeeRanking(
    @Req() req: any,
    @Query('employeeId') employeeId?: string,
    @Query('weekNumber') weekNumber?: string,
    @Query('year') year?: string,
    @Query('periodWeeks') periodWeeks?: string,
  ) {
    return this.rankingService.getEmployeeRanking(req.user, {
      employeeId,
      weekNumber: weekNumber ? parseInt(weekNumber) : undefined,
      year: year ? parseInt(year) : undefined,
      periodWeeks: periodWeeks ? parseInt(periodWeeks) : undefined,
    });
  }

  @Get('departments')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN, Role.SUPERADMIN)
  @ApiOperation({ summary: 'Get department ranking statistics' })
  @ApiQuery({ name: 'departmentId', required: false, description: 'Specific department ID' })
  @ApiQuery({ name: 'weekNumber', required: false, description: 'Specific week number' })
  @ApiQuery({ name: 'year', required: false, description: 'Specific year' })
  @ApiQuery({ name: 'periodWeeks', required: false, description: 'Number of weeks to analyze (default: 4)' })
  @ApiResponse({ status: 200, description: 'Department rankings retrieved successfully' })
  async getDepartmentRankingStats(
    @Req() req: any,
    @Query('departmentId') departmentId?: string,
    @Query('weekNumber') weekNumber?: string,
    @Query('year') year?: string,
    @Query('periodWeeks') periodWeeks?: string,
  ) {
    return this.rankingService.getDepartmentRankingStats(req.user, {
      departmentId,
      weekNumber: weekNumber ? parseInt(weekNumber) : undefined,
      year: year ? parseInt(year) : undefined,
      periodWeeks: periodWeeks ? parseInt(periodWeeks) : undefined,
    });
  }

  @Get('offices')
  @UseGuards(RolesGuard)
@Roles(Role.ADMIN, Role.SUPERADMIN)
  @ApiOperation({ summary: 'Get office ranking statistics' })
  @ApiQuery({ name: 'officeId', required: false, description: 'Specific office ID' })
  @ApiQuery({ name: 'weekNumber', required: false, description: 'Specific week number' })
  @ApiQuery({ name: 'year', required: false, description: 'Specific year' })
  @ApiQuery({ name: 'periodWeeks', required: false, description: 'Number of weeks to analyze (default: 4)' })
  @ApiResponse({ status: 200, description: 'Office rankings retrieved successfully' })
  async getOfficeRankingStats(
    @Req() req: any,
    @Query('officeId') officeId?: string,
    @Query('weekNumber') weekNumber?: string,
    @Query('year') year?: string,
    @Query('periodWeeks') periodWeeks?: string,
  ) {
    return this.rankingService.getOfficeRankingStats(req.user, {
      officeId,
      weekNumber: weekNumber ? parseInt(weekNumber) : undefined,
      year: year ? parseInt(year) : undefined,
      periodWeeks: periodWeeks ? parseInt(periodWeeks) : undefined,
    });
  }

  @Get('overall')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN, Role.SUPERADMIN)
  @ApiOperation({ summary: 'Get overall ranking statistics across all offices (Admin/Superadmin only)' })
  @ApiQuery({ name: 'weekNumber', required: false, description: 'Specific week number' })
  @ApiQuery({ name: 'year', required: false, description: 'Specific year' })
  @ApiQuery({ name: 'periodWeeks', required: false, description: 'Number of weeks to analyze (default: 4)' })
  @ApiResponse({ status: 200, description: 'Overall rankings retrieved successfully' })
  async getOverallRankingStats(
    @Req() req: any,
    @Query('weekNumber') weekNumber?: string,
    @Query('year') year?: string,
    @Query('periodWeeks') periodWeeks?: string,
  ) {
    return this.rankingService.getOverallRankingStats(req.user, {
      weekNumber: weekNumber ? parseInt(weekNumber) : undefined,
      year: year ? parseInt(year) : undefined,
      periodWeeks: periodWeeks ? parseInt(periodWeeks) : undefined,
    });
  }

  @Get('position-ranking')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN, Role.SUPERADMIN)
  @ApiOperation({ summary: 'Get position-based ranking (Management hierarchy)' })
  @ApiQuery({ name: 'weekNumber', required: false, description: 'Week number' })
  @ApiQuery({ name: 'year', required: false, description: 'Year' })
  @ApiQuery({ name: 'periodWeeks', required: false, description: 'Number of weeks to analyze' })
  @ApiQuery({ name: 'timeFrame', required: false, description: 'Time frame: week, month, year' })
  @ApiResponse({ status: 200, description: 'Position rankings retrieved successfully' })
  async getPositionRanking(
    @Req() req: any,
    @Query('weekNumber') weekNumber?: string,
    @Query('year') year?: string,
    @Query('periodWeeks') periodWeeks?: string,
    @Query('timeFrame') timeFrame?: 'week' | 'month' | 'year',
  ) {
    return this.rankingService.getPositionRanking(req.user, {
      weekNumber: weekNumber ? parseInt(weekNumber) : undefined,
      year: year ? parseInt(year) : undefined,
      periodWeeks: periodWeeks ? parseInt(periodWeeks) : undefined,
      timeFrame,
    });
  }

  @Get('jobposition-ranking')
  @ApiOperation({ summary: 'Get job position-based ranking (Staff level)' })
  @ApiQuery({ name: 'weekNumber', required: false, description: 'Week number' })
  @ApiQuery({ name: 'year', required: false, description: 'Year' })
  @ApiQuery({ name: 'periodWeeks', required: false, description: 'Number of weeks to analyze' })
  @ApiQuery({ name: 'timeFrame', required: false, description: 'Time frame: week, month, year' })
  @ApiQuery({ name: 'departmentId', required: false, description: 'Filter by department' })
  @ApiResponse({ status: 200, description: 'Job position rankings retrieved successfully' })
  async getJobPositionRanking(
    @Req() req: any,
    @Query('weekNumber') weekNumber?: string,
    @Query('year') year?: string,
    @Query('periodWeeks') periodWeeks?: string,
    @Query('timeFrame') timeFrame?: 'week' | 'month' | 'year',
    @Query('departmentId') departmentId?: string,
  ) {
    return this.rankingService.getJobPositionRanking(req.user, {
      weekNumber: weekNumber ? parseInt(weekNumber) : undefined,
      year: year ? parseInt(year) : undefined,
      periodWeeks: periodWeeks ? parseInt(periodWeeks) : undefined,
      timeFrame,
      departmentId,
    });
  }

  @Get('time-performance')
  @UseGuards(RolesGuard)
 @Roles(Role.ADMIN, Role.SUPERADMIN)
  @ApiOperation({ summary: 'Get performance over time periods' })
  @ApiQuery({ name: 'timeFrame', required: true, description: 'Time frame: week, month, year' })
  @ApiQuery({ name: 'positionId', required: false, description: 'Filter by position' })
  @ApiQuery({ name: 'jobPositionId', required: false, description: 'Filter by job position' })
  @ApiQuery({ name: 'year', required: false, description: 'Year' })
  @ApiResponse({ status: 200, description: 'Time performance data retrieved successfully' })
  async getTimePerformance(
    @Req() req: any,
    @Query('timeFrame') timeFrame: 'week' | 'month' | 'year',
    @Query('positionId') positionId?: string,
    @Query('jobPositionId') jobPositionId?: string,
    @Query('year') year?: string,
  ) {
    if (!['week', 'month', 'year'].includes(timeFrame)) {
      throw new Error('Invalid timeFrame. Must be week, month, or year');
    }

    return this.rankingService.getTimePerformance(req.user, {
      timeFrame,
      positionId,
      jobPositionId,
      year: year ? parseInt(year) : undefined,
    });
  }
}

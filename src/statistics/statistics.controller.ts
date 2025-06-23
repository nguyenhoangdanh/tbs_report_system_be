import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiQuery,
} from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { Roles } from 'src/common/decorators/roles.decorator';
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';
import { RolesGuard } from 'src/common/guards/roles.guard';
import { StatisticsService } from './statistics.service';

@ApiTags('statistics')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.SUPERADMIN)
@Controller('statistics')
export class StatisticsController {
  constructor(private readonly statisticsService: StatisticsService) {}

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
}

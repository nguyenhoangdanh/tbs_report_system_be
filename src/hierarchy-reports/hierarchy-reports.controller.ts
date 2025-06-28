import {
  Controller,
  Get,
  Query,
  Param,
  UseGuards,
  Req,
  ForbiddenException,
} from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiQuery,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '@prisma/client';
import { HierarchyReportsService } from './hierarchy-reports.service';

@ApiTags('Hierarchy Reports')
@ApiBearerAuth('JWT-auth')
@Controller('hierarchy-reports')
@UseGuards(JwtAuthGuard)
export class HierarchyReportsController {
  constructor(private readonly hierarchyReportsService: HierarchyReportsService) {}

  @Get('offices-overview')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN, Role.SUPERADMIN)
  @ApiOperation({ summary: 'Get overview of all offices with statistics (Admin/Superadmin only)' })
  @ApiQuery({ name: 'weekNumber', required: false, description: 'Specific week number' })
  @ApiQuery({ name: 'year', required: false, description: 'Specific year' })
  @ApiResponse({ status: 200, description: 'Offices overview retrieved successfully' })
  async getOfficesOverview(
    @Req() req: any,
    @Query('weekNumber') weekNumber?: string,
    @Query('year') year?: string,
  ) {
    return this.hierarchyReportsService.getOfficesOverview(
      req.user,
      weekNumber ? parseInt(weekNumber) : undefined,
      year ? parseInt(year) : undefined,
    );
  }

  @Get('office/:officeId/details')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN, Role.SUPERADMIN, Role.OFFICE_MANAGER)
  @ApiOperation({ summary: 'Get detailed office statistics with departments breakdown' })
  @ApiQuery({ name: 'weekNumber', required: false, description: 'Specific week number' })
  @ApiQuery({ name: 'year', required: false, description: 'Specific year' })
  @ApiResponse({ status: 200, description: 'Office details retrieved successfully' })
  async getOfficeDetails(
    @Param('officeId') officeId: string,
    @Req() req: any,
    @Query('weekNumber') weekNumber?: string,
    @Query('year') year?: string,
  ) {
    return this.hierarchyReportsService.getOfficeDetails(
      officeId,
      req.user,
      weekNumber ? parseInt(weekNumber) : undefined,
      year ? parseInt(year) : undefined,
    );
  }

  @Get('department/:departmentId/details')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN, Role.SUPERADMIN, Role.OFFICE_MANAGER, Role.OFFICE_ADMIN)
  @ApiOperation({ summary: 'Get detailed department statistics with users breakdown' })
  @ApiQuery({ name: 'weekNumber', required: false, description: 'Specific week number' })
  @ApiQuery({ name: 'year', required: false, description: 'Specific year' })
  @ApiResponse({ status: 200, description: 'Department details retrieved successfully' })
  async getDepartmentDetails(
    @Param('departmentId') departmentId: string,
    @Req() req: any,
    @Query('weekNumber') weekNumber?: string,
    @Query('year') year?: string,
  ) {
    return this.hierarchyReportsService.getDepartmentDetails(
      departmentId,
      req.user,
      weekNumber ? parseInt(weekNumber) : undefined,
      year ? parseInt(year) : undefined,
    );
  }

  @Get('user/:userId/details')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN, Role.SUPERADMIN, Role.OFFICE_MANAGER, Role.OFFICE_ADMIN)
  @ApiOperation({ summary: 'Get detailed user statistics with task breakdown' })
  @ApiQuery({ name: 'weekNumber', required: false, description: 'Specific week number' })
  @ApiQuery({ name: 'year', required: false, description: 'Specific year' })
  @ApiQuery({ name: 'limit', required: false, description: 'Number of reports to retrieve' })
  @ApiResponse({ status: 200, description: 'User details retrieved successfully' })
  async getUserDetails(
    @Param('userId') userId: string,
    @Req() req: any,
    @Query('weekNumber') weekNumber?: string,
    @Query('year') year?: string,
    @Query('limit') limit?: string,
  ) {
    return this.hierarchyReportsService.getUserDetails(
      userId,
      req.user,
      weekNumber ? parseInt(weekNumber) : undefined,
      year ? parseInt(year) : undefined,
      limit ? parseInt(limit) : 10,
    );
  }

  @Get('my-hierarchy-view')
  @ApiOperation({ summary: 'Get hierarchy view based on current user role' })
  @ApiQuery({ name: 'weekNumber', required: false, description: 'Specific week number' })
  @ApiQuery({ name: 'year', required: false, description: 'Specific year' })
  @ApiResponse({ status: 200, description: 'Hierarchy view retrieved successfully' })
  async getMyHierarchyView(
    @Req() req: any,
    @Query('weekNumber') weekNumber?: string,
    @Query('year') year?: string,
  ) {
    return this.hierarchyReportsService.getMyHierarchyView(
      req.user,
      weekNumber ? parseInt(weekNumber) : undefined,
      year ? parseInt(year) : undefined,
    );
  }

  @Get('task-completion-trends')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN, Role.SUPERADMIN, Role.OFFICE_MANAGER, Role.OFFICE_ADMIN)
  @ApiOperation({ summary: 'Get task completion trends across hierarchy' })
  @ApiQuery({ name: 'officeId', required: false, description: 'Filter by office' })
  @ApiQuery({ name: 'departmentId', required: false, description: 'Filter by department' })
  @ApiQuery({ name: 'weeks', required: false, description: 'Number of weeks to analyze (default: 8)' })
  @ApiResponse({ status: 200, description: 'Task completion trends retrieved successfully' })
  async getTaskCompletionTrends(
    @Req() req: any,
    @Query('officeId') officeId?: string,
    @Query('departmentId') departmentId?: string,
    @Query('weeks') weeks?: string,
  ) {
    // Validate role-based access for filters
    if (officeId && !['ADMIN', 'SUPERADMIN'].includes(req.user.role)) {
      throw new ForbiddenException('Only ADMIN/SUPERADMIN can filter by office');
    }
    
    if (departmentId && !['ADMIN', 'SUPERADMIN', 'OFFICE_MANAGER'].includes(req.user.role)) {
      throw new ForbiddenException('Insufficient permissions to filter by department');
    }

    return this.hierarchyReportsService.getTaskCompletionTrends(
      req.user,
      {
        officeId,
        departmentId,
        weeks: weeks ? parseInt(weeks) : 8,
      },
    );
  }

  @Get('incomplete-reasons-hierarchy')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN, Role.SUPERADMIN, Role.OFFICE_MANAGER, Role.OFFICE_ADMIN)
  @ApiOperation({ summary: 'Get incomplete task reasons analysis across hierarchy' })
  @ApiQuery({ name: 'officeId', required: false, description: 'Filter by office' })
  @ApiQuery({ name: 'departmentId', required: false, description: 'Filter by department' })
  @ApiQuery({ name: 'weekNumber', required: false, description: 'Specific week number' })
  @ApiQuery({ name: 'year', required: false, description: 'Specific year' })
  @ApiResponse({ status: 200, description: 'Incomplete reasons analysis retrieved successfully' })
  async getIncompleteReasonsHierarchy(
    @Req() req: any,
    @Query('officeId') officeId?: string,
    @Query('departmentId') departmentId?: string,
    @Query('weekNumber') weekNumber?: string,
    @Query('year') year?: string,
  ) {
    // Validate role-based access for filters
    if (officeId && !['ADMIN', 'SUPERADMIN'].includes(req.user.role)) {
      throw new ForbiddenException('Only ADMIN/SUPERADMIN can filter by office');
    }
    
    if (departmentId && !['ADMIN', 'SUPERADMIN', 'OFFICE_MANAGER'].includes(req.user.role)) {
      throw new ForbiddenException('Insufficient permissions to filter by department');
    }

    return this.hierarchyReportsService.getIncompleteReasonsHierarchy(
      req.user,
      {
        officeId,
        departmentId,
        weekNumber: weekNumber ? parseInt(weekNumber) : undefined,
        year: year ? parseInt(year) : undefined,
      },
    );
  }

  @Get('admin/user/:userId/reports')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN, Role.SUPERADMIN, Role.OFFICE_MANAGER, Role.OFFICE_ADMIN)
  @ApiOperation({ summary: 'Get user reports for admin management' })
  @ApiQuery({ name: 'page', required: false, description: 'Page number' })
  @ApiQuery({ name: 'limit', required: false, description: 'Items per page' })
  @ApiQuery({ name: 'weekNumber', required: false, description: 'Filter by week number' })
  @ApiQuery({ name: 'year', required: false, description: 'Filter by year' })
  @ApiResponse({ status: 200, description: 'User reports retrieved successfully' })
  async getUserReportsForAdmin(
    @Param('userId') userId: string,
    @Req() req: any,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('weekNumber') weekNumber?: string,
    @Query('year') year?: string,
  ) {
    return this.hierarchyReportsService.getUserReportsForAdmin(
      userId,
      req.user,
      {
        page: page ? parseInt(page) : 1,
        limit: limit ? parseInt(limit) : 10,
        weekNumber: weekNumber ? parseInt(weekNumber) : undefined,
        year: year ? parseInt(year) : undefined,
      },
    );
  }

  @Get('admin/user/:userId/report/:reportId')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN, Role.SUPERADMIN, Role.OFFICE_MANAGER, Role.OFFICE_ADMIN)
  @ApiOperation({ summary: 'Get specific report details for admin' })
  @ApiResponse({ status: 200, description: 'Report details retrieved successfully' })
  async getReportDetailsForAdmin(
    @Param('userId') userId: string,
    @Param('reportId') reportId: string,
    @Req() req: any,
  ) {
    return this.hierarchyReportsService.getReportDetailsForAdmin(
      userId,
      reportId,
      req.user,
    );
  }
}

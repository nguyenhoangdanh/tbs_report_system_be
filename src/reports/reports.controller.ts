import {
  Controller,
  Get,
  Post,
  Patch, // Changed from Put to Patch
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  Req,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
} from '@nestjs/swagger';
import { ReportsService } from './reports.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CreateWeeklyReportDto, UpdateReportDto } from './dto/report.dto';

// Replace the previous PaginationQueryDto definition with:
interface PaginationQueryDto {
  page?: number;
  limit?: number;
}

@ApiTags('Reports')
@ApiBearerAuth('JWT-auth')
@Controller('reports')
@UseGuards(JwtAuthGuard)
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Post()
  @ApiOperation({ summary: 'Create weekly report' })
  @ApiResponse({ status: 201, description: 'Report created successfully' })
  async createWeeklyReport(
    @Body() createReportDto: CreateWeeklyReportDto,
    @Req() req: any,
  ) {
    return this.reportsService.createWeeklyReport(req.user.id, createReportDto);
  }

  @Get('my')
  @ApiOperation({ summary: 'Get my reports with pagination' })
  async getMyReports(@Query() query: PaginationQueryDto, @Req() req: any) {
    const page = query.page ? Number(query.page) : 1;
    const limit = query.limit ? Number(query.limit) : 10;
    return this.reportsService.getMyReports(req.user.id, page, limit);
  }

  @Get('current-week')
  @ApiOperation({ summary: 'Get current week report' })
  async getCurrentWeekReport(@Req() req: any) {
    const report = await this.reportsService.getCurrentWeekReport(req.user.id);
    if (!report) {
      throw new NotFoundException('No report found for current week');
    }
    return report;
  }

   // Admin/Superadmin endpoints
  @Get('all')
  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'SUPERADMIN')
  @ApiOperation({ summary: 'Get all reports (Admin/Superadmin only)' })
  async getAllReports(
    @Query() query: PaginationQueryDto,
    @Query('departmentId') departmentId?: string,
    @Query('weekNumber') weekNumber?: string,
    @Query('year') year?: string,
  ) {
    const page = query.page ? Number(query.page) : 1;
    const limit = query.limit ? Number(query.limit) : 10;
    return this.reportsService.getAllReports(
      page,
      limit,
      departmentId,
      weekNumber ? parseInt(weekNumber) : undefined,
      year ? parseInt(year) : undefined,
    );
  }

  @Get('stats')
  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'SUPERADMIN')
  @ApiOperation({ summary: 'Get reports statistics (Admin/Superadmin only)' })
  async getReportsStats(
    @Query('weekNumber') weekNumber?: string,
    @Query('year') year?: string,
  ) {
    return this.reportsService.getReportStats(
      weekNumber ? parseInt(weekNumber) : undefined,
      year ? parseInt(year) : undefined,
    );
  }

  @Get('week/:weekNumber/year/:year')
  @ApiOperation({ summary: 'Get report by week and year' })
  async getReportByWeek(
    @Param('weekNumber') weekNumber: string,
    @Param('year') year: string,
    @Req() req: any,
  ) {
    const report = await this.reportsService.getReportByWeek(
      req.user.id,
      parseInt(weekNumber),
      parseInt(year),
    );
    if (!report) {
      throw new NotFoundException('No report found for this week');
    }
    return report;
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get report by ID' })
  async getReportById(@Param('id') id: string, @Req() req: any) {
    const report = await this.reportsService.getReportById(id, req.user.id);

    // Check if user can access this report
    if (
      report.userId !== req.user.id &&
      !['ADMIN', 'SUPERADMIN'].includes(req.user.role)
    ) {
      throw new ForbiddenException('Access denied');
    }

    return report;
  }

  @Patch(':id') // Changed from Put to Patch
  @ApiOperation({ summary: 'Update report' })
  async updateReport(
    @Param('id') id: string,
    @Body() updateReportDto: UpdateReportDto,
    @Req() req: any,
  ) {
    return this.reportsService.updateReport(req.user.id, id, updateReportDto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete report' })
  @ApiResponse({ status: 200, description: 'Report deleted successfully' })
  @ApiResponse({ status: 404, description: 'Report not found' })
  @ApiResponse({ status: 403, description: 'Access denied or report locked' })
  async deleteReport(@Param('id') id: string, @Req() req: any) {
    await this.reportsService.deleteReport(req.user.id, id);
    return { message: 'Báo cáo đã được xóa thành công' };
  }

  // New endpoint to delete individual task
  @Delete('tasks/:taskId')
  @ApiOperation({ summary: 'Delete individual task' })
  @ApiResponse({ status: 200, description: 'Task deleted successfully' })
  async deleteTask(@Param('taskId') taskId: string, @Req() req: any) {
    return this.reportsService.deleteTask(req.user.id, taskId);
  }

  // New endpoint to update individual task
  @Patch('tasks/:taskId')
  @ApiOperation({ summary: 'Update individual task' })
  @ApiResponse({ status: 200, description: 'Task updated successfully' })
  async updateTask(
    @Param('taskId') taskId: string,
    @Body() updateTaskDto: any,
    @Req() req: any,
  ) {
    return this.reportsService.updateTask(req.user.id, taskId, updateTaskDto);
  }
}

import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
  Query,
  ParseIntPipe,
  HttpCode,
  HttpStatus,
  BadRequestException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiParam, ApiQuery } from '@nestjs/swagger';
import { ReportsService } from './reports.service';
import { CreateReportDto } from './dto/create-report.dto';
import { UpdateReportDto } from './dto/update-report.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { GetUser } from '../common/decorators/get-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { User, Role } from '@prisma/client';

@ApiTags('reports')
@Controller('reports')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth('JWT-auth')
export class ReportsController {
  constructor(private reportsService: ReportsService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a new weekly report' })
  @ApiResponse({ status: 201, description: 'Report created successfully' })
  @ApiResponse({ status: 400, description: 'Invalid input or report already exists' })
  @ApiResponse({ status: 403, description: 'Week is locked (after 10 AM Saturday)' })
  create(@GetUser() user: User, @Body() createReportDto: CreateReportDto) {
    return this.reportsService.create(user.id, createReportDto);
  }

  @Get('me')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get my reports' })
  @ApiResponse({ status: 200, description: 'User reports retrieved successfully' })
  findMyReports(@GetUser() user: User) {
    return this.reportsService.findMyReports(user.id);
  }

  @Get('me/:weekNumber/:year')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get my report for specific week' })
  @ApiParam({ name: 'weekNumber', description: 'Week number (1-53)' })
  @ApiParam({ name: 'year', description: 'Year (e.g., 2024)' })
  @ApiResponse({ status: 200, description: 'Report retrieved successfully' })
  @ApiResponse({ status: 404, description: 'Report not found' })
  findMyReport(
    @GetUser() user: User,
    @Param('weekNumber', ParseIntPipe) weekNumber: number,
    @Param('year', ParseIntPipe) year: number,
  ) {
    return this.reportsService.findMyReport(user.id, weekNumber, year);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update my report' })
  @ApiResponse({ status: 200, description: 'Report updated successfully' })
  update(
    @GetUser() user: any,
    @Param('id') id: string,
    @Body() updateReportDto: UpdateReportDto,
  ) {
    return this.reportsService.update(user.id, id, updateReportDto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete my report' })
  @ApiResponse({ status: 200, description: 'Report deleted successfully' })
  remove(@GetUser() user: any, @Param('id') id: string) {
    return this.reportsService.remove(user.id, id);
  }

  @Get('by-department')
  @Roles(Role.ADMIN, Role.SUPERADMIN)
  @ApiOperation({ summary: 'Get reports by department' })
  @ApiQuery({ name: 'weekNumber', required: false })
  @ApiQuery({ name: 'year', required: false })
  async findReportsByDepartment(
    @GetUser() user: any,
    @Query('weekNumber') weekNumber?: string,
    @Query('year') year?: string,
  ) {
    const departmentId = user.jobPosition?.departmentId;
    if (!departmentId) {
      throw new BadRequestException('User department not found');
    }

    return this.reportsService.findReportsByDepartment(
      departmentId,
      weekNumber ? parseInt(weekNumber) : undefined,
      year ? parseInt(year) : undefined,
    );
  }

  @Get('all')
  @Roles(Role.SUPERADMIN)
  @ApiOperation({ summary: 'Get all reports (superadmin only)' })
  @ApiQuery({ name: 'weekNumber', required: false })
  @ApiQuery({ name: 'year', required: false })
  findAllReports(
    @Query('weekNumber') weekNumber?: string,
    @Query('year') year?: string,
  ) {
    return this.reportsService.findAllReports(
      weekNumber ? parseInt(weekNumber) : undefined,
      year ? parseInt(year) : undefined,
    );
  }

  @Get('statistics')
  @Roles(Role.SUPERADMIN)
  @ApiOperation({ summary: 'Get reports statistics (superadmin only)' })
  @ApiQuery({ name: 'weekNumber', required: false })
  @ApiQuery({ name: 'year', required: false })
  getStatistics(
    @Query('weekNumber') weekNumber?: string,
    @Query('year') year?: string,
  ) {
    return this.reportsService.getReportsStatistics(
      weekNumber ? parseInt(weekNumber) : undefined,
      year ? parseInt(year) : undefined,
    );
  }
}

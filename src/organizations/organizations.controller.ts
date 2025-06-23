import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { OrganizationsService } from './organizations.service';
import { Public } from '../common/decorators/public.decorator';

@ApiTags('organizations')
@Controller('organizations')
@Public() // Make all endpoints in this controller public
export class OrganizationsController {
  constructor(private organizationsService: OrganizationsService) {}

  @Get('offices')
  @ApiOperation({ summary: 'Get all offices (public)' })
  @ApiResponse({ status: 200, description: 'Offices retrieved successfully' })
  async getOffices() {
    return this.organizationsService.getAllOffices();
  }

  @Get('departments')
  @ApiOperation({ summary: 'Get all departments (public)' })
  @ApiResponse({
    status: 200,
    description: 'Departments retrieved successfully',
  })
  async getDepartments() {
    return this.organizationsService.getAllDepartments();
  }

  @Get('positions')
  @ApiOperation({ summary: 'Get all positions (public)' })
  @ApiResponse({ status: 200, description: 'Positions retrieved successfully' })
  async getPositions() {
    return this.organizationsService.getAllPositions();
  }

  @Get('job-positions')
  @ApiOperation({ summary: 'Get all job positions (public)' })
  @ApiResponse({
    status: 200,
    description: 'Job positions retrieved successfully',
  })
  async getJobPositions() {
    return this.organizationsService.getAllJobPositions();
  }
}

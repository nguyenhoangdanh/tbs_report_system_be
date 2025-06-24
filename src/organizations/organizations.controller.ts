import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { Public } from '../common/decorators/public.decorator';
import { OrganizationsService } from './organizations.service';

@ApiTags('Organizations')
@Controller('organizations')
export class OrganizationsController {
  constructor(private readonly organizationsService: OrganizationsService) {}

  @Get('offices')
  @Public()
  @ApiOperation({ summary: 'Get all offices' })
  @ApiResponse({ status: 200, description: 'Offices retrieved successfully' })
  async getOffices() {
    return this.organizationsService.getAllOffices();
  }

  @Get('departments')
  @Public()
  @ApiOperation({ summary: 'Get all departments' })
  @ApiResponse({
    status: 200,
    description: 'Departments retrieved successfully',
  })
  async getDepartments() {
    return this.organizationsService.getAllDepartments();
  }

  @Get('positions')
  @Public()
  @ApiOperation({ summary: 'Get all positions' })
  @ApiResponse({ status: 200, description: 'Positions retrieved successfully' })
  async getPositions() {
    return this.organizationsService.getAllPositions();
  }

  @Get('job-positions')
  @Public()
  @ApiOperation({ summary: 'Get all job positions' })
  @ApiResponse({
    status: 200,
    description: 'Job positions retrieved successfully',
  })
  async getJobPositions() {
    return this.organizationsService.getAllJobPositions();
  }
}

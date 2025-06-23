import {
  Controller,
  Get,
  Patch,
  Body,
  UseGuards,
  HttpCode,
  HttpStatus,
  Param,
} from '@nestjs/common';
import { UsersService } from './users.service';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { GetUser } from '../common/decorators/get-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '@prisma/client';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';

@ApiTags('users')
@Controller('users')
@UseGuards(JwtAuthGuard)
export class UsersController {
  constructor(private usersService: UsersService) {}

  @Get('profile')
  @ApiOperation({ summary: 'Get current user profile' })
  @ApiResponse({ status: 200, description: 'Profile retrieved successfully' })
  async getProfile(@GetUser() user: any) {
    return this.usersService.getProfile(user.id);
  }

  @Patch('profile')
  @ApiOperation({ summary: 'Update current user profile' })
  @ApiResponse({ status: 200, description: 'Profile updated successfully' })
  async updateProfile(
    @GetUser() user: any,
    @Body() updateProfileDto: UpdateProfileDto,
  ) {
    return this.usersService.updateProfile(
      user.id,
      updateProfileDto,
      user.role,
    );
  }

  @Patch(':userId')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN, Role.SUPERADMIN)
  @ApiOperation({ summary: 'Update user by admin (partial update)' })
  @ApiResponse({ status: 200, description: 'User updated successfully' })
  async updateUserByAdmin(
    @GetUser() adminUser: any,
    @Param('userId') userId: string,
    @Body() updateProfileDto: UpdateProfileDto,
  ) {
    return this.usersService.updateUserByAdmin(
      adminUser.id,
      userId,
      updateProfileDto,
      adminUser.role,
    );
  }

  @Get('by-office')
  @Roles(Role.ADMIN, Role.SUPERADMIN)
  @UseGuards(RolesGuard)
  @ApiOperation({ summary: 'Get users by current user office' })
  async getUsersByOffice(@GetUser() user: any) {
    return this.usersService.getUsersByOffice(user.officeId);
  }

  @Get('by-department/:departmentId')
  @Roles(Role.ADMIN, Role.SUPERADMIN)
  @UseGuards(RolesGuard)
  @ApiOperation({ summary: 'Get users by department' })
  async getUsersByDepartment(@Param('departmentId') departmentId: string) {
    return this.usersService.getUsersByDepartment(departmentId);
  }

  @Get('all')
  @UseGuards(RolesGuard)
  @Roles(Role.SUPERADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get all users (superadmin only)' })
  async getAllUsers() {
    return this.usersService.getAllUsers();
  }
}

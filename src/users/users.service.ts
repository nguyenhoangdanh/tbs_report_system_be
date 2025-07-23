import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { Role } from '@prisma/client';

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}

  async getProfile(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        office: true,
        jobPosition: {
          include: {
            position: true,
            department: {
              include: {
                office: true,
              },
            },
          },
        },
      },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    const { password, ...userWithoutPassword } = user;
    const isManager = user.jobPosition.position.name === "NV" && user.jobPosition.position.level === 7 ? false : true;
    return { ...userWithoutPassword, isManager };
  }

  async updateProfile(
    userId: string,
    updateProfileDto: UpdateProfileDto,
    currentUserRole?: Role,
  ) {
    const {
      employeeCode,
      jobPositionId,
      officeId,
      phone,
      email,
      role,
      ...otherData
    } = updateProfileDto;

    // Get current user to check permissions
    const currentUser = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { jobPosition: { include: { department: true } } },
    });

    if (!currentUser) {
      throw new NotFoundException('User not found');
    }

    const isSuperAdmin = currentUserRole === Role.SUPERADMIN;

    // User can change their own info, but some fields require admin privileges
    if (employeeCode && employeeCode !== currentUser.employeeCode) {
      // Check if new employee code is already taken
      const existingUser = await this.prisma.user.findUnique({
        where: { employeeCode },
      });
      if (existingUser && existingUser.id !== userId) {
        throw new BadRequestException('Employee code is already in use');
      }
    }

    // Role change authorization - only superadmin can change roles
    if (role && role !== currentUser.role) {
      if (!isSuperAdmin) {
        throw new ForbiddenException('Only superadmin can change user roles');
      }
    }

    // Office change validation - users can change their office
    if (officeId && officeId !== currentUser.officeId) {
      const office = await this.prisma.office.findUnique({
        where: { id: officeId },
      });
      if (!office) {
        throw new BadRequestException('Office not found');
      }
    }


    // Validate job position if provided
    if (jobPositionId && jobPositionId !== currentUser.jobPositionId) {
      const jobPosition = await this.prisma.jobPosition.findUnique({
        where: { id: jobPositionId },
        include: { department: true },
      });
      if (!jobPosition) {
        throw new BadRequestException('Job position not found');
      }

      // For regular users, ensure job position belongs to their selected office
      const targetOfficeId = officeId || currentUser.officeId;
      if (jobPosition.department.officeId !== targetOfficeId) {
        throw new BadRequestException(
          'Job position must belong to the selected office',
        );
      }
    }

    // Check if email is already used by another user
    if (email && email !== currentUser.email) {
      const existingUser = await this.prisma.user.findUnique({
        where: { email },
      });
      if (existingUser && existingUser.id !== userId) {
        throw new BadRequestException('Email is already in use');
      }
    }

    // Check if phone is already used by another user
    // if (phone && phone !== currentUser.phone) {
    //   const existingUser = await this.prisma.user.findUnique({
    //     where: { phone },
    //   });
    //   if (existingUser && existingUser.id !== userId) {
    //     throw new BadRequestException('Phone number is already in use');
    //   }
    // }

    // Build update data - users can update all their fields
    const updateData: any = {
      ...otherData,
    };

    // Add conditional fields
    if (employeeCode !== undefined) updateData.employeeCode = employeeCode;
    if (email !== undefined) updateData.email = email;
    if (phone !== undefined) updateData.phone = phone;
    if (jobPositionId !== undefined) updateData.jobPositionId = jobPositionId;
    if (officeId !== undefined) updateData.officeId = officeId;
    if (role !== undefined) updateData.role = role;

    const user = await this.prisma.user.update({
      where: { id: userId },
      data: updateData,
      include: {
        office: true,
        jobPosition: {
          include: {
            position: true,
            department: {
              include: {
                office: true,
              },
            },
          },
        },
      },
    });

    const { password, ...userWithoutPassword } = user;
    return userWithoutPassword;
  }

  // Admin methods for managing other users
  async updateUserByAdmin(
    adminUserId: string,
    targetUserId: string,
    updateProfileDto: UpdateProfileDto,
    adminRole: Role,
  ) {
    // Get admin user info
    const adminUser = await this.prisma.user.findUnique({
      where: { id: adminUserId },
      include: { office: true },
    });

    if (!adminUser) {
      throw new NotFoundException('Admin user not found');
    }

    // Get target user
    const targetUser = await this.prisma.user.findUnique({
      where: { id: targetUserId },
      include: { office: true },
    });

    if (!targetUser) {
      throw new NotFoundException('Target user not found');
    }

    // Superadmin can modify anyone
    if (adminRole !== Role.SUPERADMIN && adminRole !== Role.ADMIN) {
      throw new ForbiddenException('Insufficient permissions');
    }

    // Authorization: Admin can only modify users in their office
    if (
      adminRole === Role.ADMIN &&
      targetUser.officeId !== adminUser.officeId
    ) {
      throw new ForbiddenException(
        'Admin can only modify users in their office',
      );
    }

    // Use the same update logic with admin permissions
    return this.updateProfile(targetUserId, updateProfileDto, adminRole);
  }

  // Add new method for superadmin to get all users for management
  async getAllUsersForManagement() {
    return this.prisma.user.findMany({
      include: {
        office: true,
        jobPosition: {
          include: {
            position: true,
            department: true,
          },
        },
      },
      orderBy: [
        { office: { name: 'asc' } },
        { jobPosition: { department: { name: 'asc' } } },
        { lastName: 'asc' },
        { firstName: 'asc' },
      ],
    });
  }

  async getUsersByOffice(officeId: string) {
    return this.prisma.user.findMany({
      where: {
        officeId,
        isActive: true,
      },
      include: {
        office: true,
        jobPosition: {
          include: {
            position: true,
            department: true,
          },
        },
      },
      orderBy: [
        { jobPosition: { department: { name: 'asc' } } },
        { lastName: 'asc' },
        { firstName: 'asc' },
      ],
    });
  }

  async getUsersByDepartment(departmentId: string) {
    return this.prisma.user.findMany({
      where: {
        jobPosition: {
          departmentId,
        },
        isActive: true,
      },
      include: {
        office: true,
        jobPosition: {
          include: {
            position: true,
            department: true,
          },
        },
      },
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
    });
  }

  async getAllUsers() {
    return this.prisma.user.findMany({
      where: { isActive: true },
      include: {
        office: true,
        jobPosition: {
          include: {
            position: true,
            department: true,
          },
        },
      },
      orderBy: [
        { office: { name: 'asc' } },
        { jobPosition: { department: { name: 'asc' } } },
        { lastName: 'asc' },
        { firstName: 'asc' },
      ],
    });
  }

  async getUsersWithRankingData(filters: any) {
    const users = await this.prisma.user.findMany({
      where: { isActive: true },
      include: {
        office: true,
        jobPosition: {
          include: {
            position: true,
            department: {
              include: {
                office: true,
              },
            },
          },
        },
        reports: {
          where: filters.reportFilters || {},
          include: {
            tasks: {
              select: {
                isCompleted: true,
              },
            },
          },
        },
      },
      orderBy: [
        { office: { name: 'asc' } },
        { jobPosition: { department: { name: 'asc' } } },
        { lastName: 'asc' },
        { firstName: 'asc' },
      ],
    });

    // Calculate ranking for each user
    return users.map(user => {
      const totalTasks = user.reports.reduce((sum, report) => sum + report.tasks.length, 0);
      const completedTasks = user.reports.reduce(
        (sum, report) => sum + report.tasks.filter(task => task.isCompleted).length, 
        0
      );
      
      const completionRate = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;
      const ranking = this.calculateEmployeeRanking(completionRate);
      
      const { reports, ...userWithoutReports } = user;
      
      return {
        ...userWithoutReports,
        performance: {
          totalReports: user.reports.length,
          totalTasks,
          completedTasks,
          completionRate,
          ranking,
          rankingLabel: this.getRankingLabel(ranking),
        },
      };
    });
  }

  // Helper methods for ranking calculations - Updated thresholds
  private calculateEmployeeRanking(completionRate: number): string {
    if (completionRate >= 100) return 'EXCELLENT';
    if (completionRate >= 95) return 'GOOD';
    if (completionRate >= 90) return 'AVERAGE';
    if (completionRate >= 85) return 'POOR';
    return 'FAIL';
  }

  private getRankingLabel(ranking: string): string {
    const labels = {
      'EXCELLENT': 'Xuất sắc',
      'GOOD': 'Tốt',
      'AVERAGE': 'Trung bình',
      'POOR': 'Yếu',
      'FAIL': 'Kém'
    };
    return labels[ranking] || 'Chưa xếp loại';
  }
}

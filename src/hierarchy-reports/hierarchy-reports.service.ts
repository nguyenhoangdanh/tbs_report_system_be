import { Injectable, ForbiddenException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { Role } from '@prisma/client';
import { getCurrentWorkWeek } from '../common/utils/week-utils';

interface HierarchyFilters {
  weekNumber?: number;
  year?: number;
  month?: number;
  officeId?: string;
  departmentId?: string;
  page?: number;
  limit?: number;
  status?: 'not_submitted' | 'incomplete' | 'completed' | 'all';
  weeks?: number;
}

@Injectable()
export class HierarchyReportsService {
  constructor(private prisma: PrismaService) {}

  /**
   * Management hierarchy view - Group by Position (chức vụ quản lý)
   */
  private async getManagementHierarchyView(userId: string, userRole: Role, weekNumber: number, year: number, filters: HierarchyFilters = {}) {
    // Get management positions - CHỈ dựa trên isManagement và tên chức danh
    const positions = await this.prisma.position.findMany({
      where: {
        isReportable: true,
        // Kết hợp nhiều điều kiện để xác định management positions
        OR: [
          { isManagement: true }, // Đã được set rõ ràng
          // Hoặc dựa trên tên chức danh
          { 
            name: {
              contains: 'giám đốc',
              mode: 'insensitive'
            }
          },
          { 
            name: {
              contains: 'trưởng',
              mode: 'insensitive'
            }
          },
          { 
            name: {
              contains: 'phó',
              mode: 'insensitive'
            }
          },
          { 
            name: {
              contains: 'manager',
              mode: 'insensitive'
            }
          },
          { 
            name: {
              contains: 'leader',
              mode: 'insensitive'
            }
          },
          { 
            name: {
              contains: 'supervisor',
              mode: 'insensitive'
            }
          }
        ],
        jobPositions: {
          some: {
            users: {
              some: { 
                isActive: true,
                ...(await this.buildUserAccessFilter(userId, userRole))
              }
            }
          }
        }
      },
      include: {
        jobPositions: {
          where: {
            isActive: true,
            users: {
              some: { 
                isActive: true,
                ...(await this.buildUserAccessFilter(userId, userRole))
              }
            }
          },
          include: {
            users: {
              where: { 
                isActive: true,
                ...(await this.buildUserAccessFilter(userId, userRole))
              },
              include: {
                office: true,
                jobPosition: {
                  include: {
                    department: {
                      include: {
                        office: true
                      }
                    }
                  }
                },
                reports: {
                  where: { weekNumber, year },
                  include: {
                    tasks: true
                  }
                }
              }
            }
          }
        }
      },
      orderBy: [
        { level: 'asc' }, // Level vẫn dùng để sắp xếp
        { name: 'asc' }
      ]
    });


    const positionStats = positions.map(position => {
      const allUsers = position.jobPositions.flatMap(jp => jp.users);
      const stats = this.calculatePositionStats(allUsers, weekNumber, year);
      
      
      return {
        position: {
          id: position.id,
          name: position.name,
          level: position.level,
          description: position.description,
          isManagement: position.isManagement || position.level <= 5 // Fallback logic
        },
        stats,
        userCount: allUsers.length,
        departmentBreakdown: this.calculateDepartmentBreakdown(allUsers),
        users: allUsers.map(user => this.mapUserToPositionUser(user))
      };
    });

    const summary = this.calculateManagementSummary(positionStats);

    return {
      weekNumber,
      year,
      viewType: 'management' as const,
      groupBy: 'position' as const,
      positions: positionStats,
      summary
    };
  }

  /**
   * Staff hierarchy view - Group by JobPosition (vị trí công việc nhân viên)
   */
  private async getStaffHierarchyView(userId: string, userRole: Role, weekNumber: number, year: number, filters: HierarchyFilters = {}) {
    // Get staff job positions - Loại trừ management positions
    const jobPositions = await this.prisma.jobPosition.findMany({
      where: {
        isActive: true,
        position: { 
          // CHỈ lấy positions KHÔNG phải management
          AND: [
            { isManagement: false },
            // VÀ không chứa các từ khóa quản lý
            { 
              name: {
                notIn: ['TGĐ', 'Tổng Giám Đốc', 'Giám Đốc', 'Phó Giám Đốc'],
                mode: 'insensitive'
              }
            },
            {
              NOT: {
                OR: [
                  { name: { contains: 'trưởng', mode: 'insensitive' } },
                  { name: { contains: 'phó', mode: 'insensitive' } },
                  { name: { contains: 'manager', mode: 'insensitive' } },
                  { name: { contains: 'leader', mode: 'insensitive' } },
                  { name: { contains: 'supervisor', mode: 'insensitive' } }
                ]
              }
            }
          ]
        },
        users: {
          some: { 
            isActive: true,
            ...(await this.buildUserAccessFilter(userId, userRole))
          }
        }
      },
      include: {
        position: true,
        department: {
          include: {
            office: true
          }
        },
        users: {
          where: { 
            isActive: true,
            // Apply role-based access filter
            ...(await this.buildUserAccessFilter(userId, userRole))
          },
          include: {
            office: true,
            jobPosition: {
              include: {
                department: {
                  include: {
                    office: true
                  }
                }
              }
            },
            reports: {
              where: { weekNumber, year },
              include: {
                tasks: true
              }
            }
          }
        }
      },
      orderBy: [
        { department: { name: 'asc' } },
        { jobName: 'asc' }
      ]
    });


    const jobPositionStats = jobPositions.map(jobPosition => {
      const stats = this.calculateJobPositionStats(jobPosition.users, weekNumber, year);
      
      
      return {
        jobPosition: {
          id: jobPosition.id,
          jobName: jobPosition.jobName,
          code: jobPosition.code,
          description: jobPosition.description,
          department: jobPosition.department,
          position: jobPosition.position
        },
        stats,
        userCount: jobPosition.users.length,
        users: jobPosition.users.map(user => this.mapUserToPositionUser(user))
      };
    });

    const summary = this.calculateStaffSummary(jobPositionStats);

    return {
      weekNumber,
      year,
      viewType: 'staff' as const,
      groupBy: 'jobPosition' as const,
      jobPositions: jobPositionStats,
      summary
    };
  }

  /**
   * Mixed hierarchy view - Trả về cả positions và jobPositions
   */
  private async getMixedHierarchyView(userId: string, userRole: Role, weekNumber: number, year: number, filters: HierarchyFilters = {}) {
    // Get both management positions and staff job positions
    const [managementView, staffView] = await Promise.all([
      this.getManagementHierarchyView(userId, userRole, weekNumber, year, filters),
      this.getStaffHierarchyView(userId, userRole, weekNumber, year, filters)
    ]);

    // Combine summaries
    const combinedSummary = {
      totalPositions: managementView.positions.length,
      totalJobPositions: staffView.jobPositions.length,
      totalUsers: managementView.summary.totalUsers + staffView.summary.totalUsers,
      totalUsersWithReports: managementView.summary.totalUsersWithReports + staffView.summary.totalUsersWithReports,
      averageSubmissionRate: Math.round(
        ((managementView.summary.averageSubmissionRate + staffView.summary.averageSubmissionRate) / 2)
      ),
      averageCompletionRate: Math.round(
        ((managementView.summary.averageCompletionRate + staffView.summary.averageCompletionRate) / 2)
      ),
      managementSummary: managementView.summary,
      staffSummary: staffView.summary
    };

    return {
      weekNumber,
      year,
      viewType: 'mixed' as const,
      groupBy: 'mixed' as const,
      positions: managementView.positions, // Chức vụ quản lý
      jobPositions: staffView.jobPositions, // Vị trí công việc
      summary: combinedSummary
    };
  }

  // Đơn giản hóa buildUserAccessFilter - bỏ logic level
  private async buildUserAccessFilter(userId: string, userRole: Role) {
    const accessFilter: any = {};
    
    if (userRole === Role.SUPERADMIN || userRole === Role.ADMIN) {
      // SUPERADMIN và ADMIN có thể xem tất cả
      return accessFilter;
    }
    
    if (userRole === Role.USER) {
      // Lấy thông tin user để xác định cấp độ
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        include: {
          jobPosition: {
            include: {
              position: true,
              department: true
            }
          }
        }
      });

      if (!user) {
        throw new NotFoundException('User not found');
      }

      // Nếu user có position.canViewHierarchy = true, có thể xem cấp dưới trong cùng department
      if (user.jobPosition?.position?.canViewHierarchy === true) {
        // Management user có thể xem trong cùng department
        accessFilter.jobPosition = {
          departmentId: user.jobPosition.departmentId
        };
      } else {
        // Regular user chỉ có thể xem đồng nghiệp cùng cấp trong department
        accessFilter.jobPosition = {
          departmentId: user.jobPosition.departmentId,
          position: {
            isManagement: false // CHỈ xem non-management positions
          }
        };
      }
    }
    
    return accessFilter;
  }

  /**
   * Get hierarchy view based on user role and permissions
   */
  async getMyHierarchyView(userId: string, userRole: Role, filters: HierarchyFilters = {}) {
    const { weekNumber, year } = this.getWeekFilters(filters);


    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        office: true,
        jobPosition: {
          include: {
            department: true,
            position: true
          }
        }
      }
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }


    // Xác định quyền xem dựa trên role và position
    const isAdminRole = userRole === Role.SUPERADMIN || userRole === Role.ADMIN;
    const userCanViewHierarchy = user.jobPosition?.position?.canViewHierarchy === true;

    // Check if there are management positions and job positions accessible to user
    const [managementPositionCount, jobPositionCount] = await Promise.all([
      this.prisma.position.count({
        where: {
          isReportable: true,
          OR: [
            { isManagement: true },
            { name: { contains: 'giám đốc', mode: 'insensitive' } },
            { name: { contains: 'trưởng', mode: 'insensitive' } },
            { name: { contains: 'phó', mode: 'insensitive' } },
            { name: { contains: 'manager', mode: 'insensitive' } },
            { name: { contains: 'leader', mode: 'insensitive' } }
          ],
          jobPositions: {
            some: {
              users: {
                some: { 
                  isActive: true,
                  ...(await this.buildUserAccessFilter(userId, userRole))
                }
              }
            }
          }
        }
      }),
      this.prisma.jobPosition.count({
        where: {
          isActive: true,
          position: { 
            AND: [
              { isManagement: false },
              {
                NOT: {
                  OR: [
                    { name: { contains: 'trưởng', mode: 'insensitive' } },
                    { name: { contains: 'phó', mode: 'insensitive' } },
                    { name: { contains: 'manager', mode: 'insensitive' } },
                    { name: { contains: 'leader', mode: 'insensitive' } }
                  ]
                }
              }
            ]
          },
          users: {
            some: { 
              isActive: true,
              ...(await this.buildUserAccessFilter(userId, userRole))
            }
          }
        }
      })
    ]);


    // Logic quyết định view type
    if (isAdminRole) {
      if (managementPositionCount > 0 && jobPositionCount > 0) {
        return this.getMixedHierarchyView(userId, userRole, weekNumber, year, filters);
      } else if (managementPositionCount > 0) {
        return this.getManagementHierarchyView(userId, userRole, weekNumber, year, filters);
      } else if (jobPositionCount > 0) {
        return this.getStaffHierarchyView(userId, userRole, weekNumber, year, filters);
      }
    } else if (userRole === Role.USER) {
      if (userCanViewHierarchy) {
        if (managementPositionCount > 0 && jobPositionCount > 0) {
          return this.getMixedHierarchyView(userId, userRole, weekNumber, year, filters);
        } else if (managementPositionCount > 0) {
          return this.getManagementHierarchyView(userId, userRole, weekNumber, year, filters);
        } else if (jobPositionCount > 0) {
          return this.getStaffHierarchyView(userId, userRole, weekNumber, year, filters);
        }
      } else {
        if (jobPositionCount > 0) {
          return this.getStaffHierarchyView(userId, userRole, weekNumber, year, filters);
        }
      }
    }

    // Return empty response if no accessible data
    return this.getEmptyHierarchyResponse(weekNumber, year);
  }

  private calculatePositionStats(users: any[], weekNumber: number, year: number) {
    const totalUsers = users.length;
    const usersWithReports = users.filter(u => u.reports && u.reports.length > 0).length;
    const usersWithCompletedReports = users.filter(u => 
      u.reports && u.reports.length > 0 && u.reports[0].isCompleted
    ).length;

    let totalTasks = 0;
    let completedTasks = 0;
    const completionRates: number[] = [];

    users.forEach(user => {
      if (user.reports && user.reports.length > 0) {
        const report = user.reports[0];
        const userTotalTasks = report.tasks ? report.tasks.length : 0;
        const userCompletedTasks = report.tasks ? report.tasks.filter((t: any) => t.isCompleted).length : 0;
        
        totalTasks += userTotalTasks;
        completedTasks += userCompletedTasks;
        
        const rate = userTotalTasks > 0 ? (userCompletedTasks / userTotalTasks) * 100 : 0;
        completionRates.push(rate);
      } else {
        completionRates.push(0);
      }
    });

    const averageCompletionRate = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;
    const submissionRate = totalUsers > 0 ? Math.round((usersWithReports / totalUsers) * 100) : 0;

    return {
      totalUsers,
      usersWithReports,
      usersWithCompletedReports,
      usersWithoutReports: totalUsers - usersWithReports,
      submissionRate,
      totalTasks,
      completedTasks,
      averageCompletionRate,
      positionRanking: this.calculateRanking(averageCompletionRate),
      rankingDistribution: this.calculateRankingDistribution(completionRates)
    };
  }

  private calculateJobPositionStats(users: any[], weekNumber: number, year: number) {
    const totalUsers = users.length;
    
    if (totalUsers === 0) {
      return {
        totalUsers: 0,
        usersWithReports: 0,
        usersWithCompletedReports: 0,
        usersWithoutReports: 0,
        submissionRate: 0,
        totalTasks: 0,
        completedTasks: 0,
        averageCompletionRate: 0,
        positionRanking: 'POOR',
        rankingDistribution: this.getEmptyRankingDistribution()
      };
    }

    const usersWithReports = users.filter(u => u.reports && u.reports.length > 0).length;
    const usersWithCompletedReports = users.filter(u => 
      u.reports && u.reports.length > 0 && u.reports[0].isCompleted
    ).length;

    let totalTasks = 0;
    let completedTasks = 0;
    const completionRates: number[] = [];

    users.forEach(user => {
      if (user.reports && user.reports.length > 0) {
        const report = user.reports[0];
        const userTotalTasks = report.tasks ? report.tasks.length : 0;
        const userCompletedTasks = report.tasks ? report.tasks.filter((t: any) => t.isCompleted).length : 0;
        
        totalTasks += userTotalTasks;
        completedTasks += userCompletedTasks;
        
        const rate = userTotalTasks > 0 ? (userCompletedTasks / userTotalTasks) * 100 : 0;
        completionRates.push(rate);
      } else {
        completionRates.push(0);
      }
    });

    const averageCompletionRate = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;
    const submissionRate = totalUsers > 0 ? Math.round((usersWithReports / totalUsers) * 100) : 0;

    return {
      totalUsers,
      usersWithReports,
      usersWithCompletedReports,
      usersWithoutReports: totalUsers - usersWithReports,
      submissionRate,
      totalTasks,
      completedTasks,
      averageCompletionRate,
      positionRanking: this.calculateRanking(averageCompletionRate),
      rankingDistribution: this.calculateRankingDistribution(completionRates)
    };
  }

  private getEmptyRankingDistribution() {
    return {
      excellent: { count: 0, percentage: 0 },
      good: { count: 0, percentage: 0 },
      average: { count: 0, percentage: 0 },
      belowAverage: { count: 0, percentage: 0 },
      poor: { count: 0, percentage: 0 }
    };
  }

  private calculateDepartmentBreakdown(users: any[]) {
    const departmentMap = new Map();
    
    users.forEach(user => {
      const deptId = user.jobPosition?.department?.id;
      const deptName = user.jobPosition?.department?.name;
      
      if (deptId && deptName) {
        if (!departmentMap.has(deptId)) {
          departmentMap.set(deptId, {
            id: deptId,
            name: deptName,
            userCount: 0,
            usersWithReports: 0
          });
        }
        
        const dept = departmentMap.get(deptId);
        dept.userCount++;
        
        if (user.reports && user.reports.length > 0) {
          dept.usersWithReports++;
        }
      }
    });
    
    return Array.from(departmentMap.values());
  }

  private calculateRanking(completionRate: number): string {
    if (completionRate >= 100) return 'EXCELLENT';
    if (completionRate >= 95) return 'GOOD';
    if (completionRate >= 90) return 'AVERAGE';
    if (completionRate >= 85) return 'POOR';
    return 'FAIL';
  }

  private calculateRankingDistribution(completionRates: number[]) {
    const distribution = {
      excellent: 0,
      good: 0,
      average: 0,
      poor: 0,
      fail: 0
    };

    completionRates.forEach(rate => {
      const ranking = this.calculateRanking(rate);
      switch (ranking) {
        case 'EXCELLENT':
          distribution.excellent++;
          break;
        case 'GOOD':
          distribution.good++;
          break;
        case 'AVERAGE':
          distribution.average++;
          break;
        case 'POOR':
          distribution.poor++;
          break;
        case 'FAIL':
          distribution.fail++;
          break;
      }
    });

    const total = completionRates.length;
    return {
      excellent: { count: distribution.excellent, percentage: total > 0 ? Math.round((distribution.excellent / total) * 100) : 0 },
      good: { count: distribution.good, percentage: total > 0 ? Math.round((distribution.good / total) * 100) : 0 },
      average: { count: distribution.average, percentage: total > 0 ? Math.round((distribution.average / total) * 100) : 0 },
      poor: { count: distribution.poor, percentage: total > 0 ? Math.round((distribution.poor / total) * 100) : 0 },
      fail: { count: distribution.fail, percentage: total > 0 ? Math.round((distribution.fail / total) * 100) : 0 }
    };
  }

  private calculateManagementSummary(positionStats: any[]) {
    const totalUsers = positionStats.reduce((sum, pos) => sum + pos.stats.totalUsers, 0);
    const totalUsersWithReports = positionStats.reduce((sum, pos) => sum + pos.stats.usersWithReports, 0);
    const averageCompletionRate = positionStats.length > 0
      ? Math.round(positionStats.reduce((sum, pos) => sum + pos.stats.averageCompletionRate, 0) / positionStats.length)
      : 0;

    return {
      totalPositions: positionStats.length,
      totalUsers,
      totalUsersWithReports,
      averageSubmissionRate: totalUsers > 0 ? Math.round((totalUsersWithReports / totalUsers) * 100) : 0,
      averageCompletionRate,
      bestPerformingPosition: positionStats.length > 0 
        ? positionStats.reduce((best, current) => 
            current.stats.averageCompletionRate > best.stats.averageCompletionRate ? current : best
          )
        : null,
      needsImprovementCount: positionStats.filter(pos => pos.stats.averageCompletionRate < 85).length
    };
  }

  private calculateStaffSummary(jobPositionStats: any[]) {
    if (jobPositionStats.length === 0) {
      return {
        totalJobPositions: 0,
        totalUsers: 0,
        totalUsersWithReports: 0,
        averageSubmissionRate: 0,
        averageCompletionRate: 0,
        bestPerformingJobPosition: null,
        needsImprovementCount: 0
      };
    }

    const totalUsers = jobPositionStats.reduce((sum, jp) => sum + jp.stats.totalUsers, 0);
    const totalUsersWithReports = jobPositionStats.reduce((sum, jp) => sum + jp.stats.usersWithReports, 0);
    const averageCompletionRate = jobPositionStats.length > 0
      ? Math.round(jobPositionStats.reduce((sum, jp) => sum + jp.stats.averageCompletionRate, 0) / jobPositionStats.length)
      : 0;

    const bestPerformingJobPosition = jobPositionStats.length > 0
      ? jobPositionStats.reduce((best, current) => 
          current.stats.averageCompletionRate > best.stats.averageCompletionRate ? current : best
        )
      : null;

    return {
      totalJobPositions: jobPositionStats.length,
      totalUsers,
      totalUsersWithReports,
      averageSubmissionRate: totalUsers > 0 ? Math.round((totalUsersWithReports / totalUsers) * 100) : 0,
      averageCompletionRate,
      bestPerformingJobPosition,
      needsImprovementCount: jobPositionStats.filter(jp => jp.stats.averageCompletionRate < 85).length
    };
  }

  private async getUserOfficeId(userId: string): Promise<string> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { officeId: true }
    });
    return user?.officeId || '';
  }

  private async getUserDepartmentId(userId: string): Promise<string> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { jobPosition: { select: { departmentId: true } } }
    });
    return user?.jobPosition?.departmentId || '';
  }

  private getWeekFilters(filters: HierarchyFilters) {
    const current = getCurrentWorkWeek();
    return {
      weekNumber: filters.weekNumber || current.weekNumber,
      year: filters.year || current.year
    };
  }

  // Add missing methods referenced in existing code
  private getEmptyHierarchyResponse(weekNumber: number, year: number) {
    return {
      weekNumber,
      year,
      viewType: 'empty' as const,
      groupBy: 'none' as const,
      positions: [],
      jobPositions: [],
      summary: {
        totalPositions: 0,
        totalJobPositions: 0,
        totalUsers: 0,
        totalUsersWithReports: 0,
        averageSubmissionRate: 0,
        averageCompletionRate: 0
      }
    };
  }

  private mapUserToPositionUser(user: any) {
    const report = user.reports && user.reports.length > 0 ? user.reports[0] : null;
    let stats = {
      hasReport: false,
      isCompleted: false,
      totalTasks: 0,
      completedTasks: 0,
      taskCompletionRate: 0
    };

    if (report) {
      const totalTasks = report.tasks ? report.tasks.length : 0;
      const completedTasks = report.tasks ? report.tasks.filter((t: any) => t.isCompleted).length : 0;
      
      stats = {
        hasReport: true,
        isCompleted: report.isCompleted,
        totalTasks,
        completedTasks,
        taskCompletionRate: totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0
      };
    }

    return {
      id: user.id,
      employeeCode: user.employeeCode,
      firstName: user.firstName,
      lastName: user.lastName,
      fullName: `${user.firstName} ${user.lastName}`,
      email: user.email,
      office: user.office,
      jobPosition: user.jobPosition,
      stats
    };
  }

  /**
   * Get offices overview (Admin/Superadmin only)
   */
  async getOfficesOverview(userId: string, filters: HierarchyFilters = {}) {
    const { weekNumber, year } = this.getWeekFilters(filters);

    const offices = await this.prisma.office.findMany({
      include: {
        departments: {
          include: {
            // Fix: Remove invalid 'users' from _count
            _count: {
              select: { 
                jobPositions: true
              }
            }
          }
        },
        // Fix: Get users directly from office relation
        users: {
          where: { isActive: true },
          include: {
            reports: {
              where: { weekNumber, year },
              include: {
                tasks: {
                  select: {
                    isCompleted: true
                  }
                }
              }
            }
          }
        }
      },
      orderBy: { name: 'asc' }
    });

    const officesWithStats = offices.map(office => {
      // Fix: Calculate user count properly from users relation
      const userCount = office.users.length;
      const stats = this.calculateOfficeStats(office.users, weekNumber, year);
      
      return {
        office: {
          id: office.id,
          name: office.name,
          type: office.type,
          description: office.description
        },
        departments: office.departments.map(dept => ({
          id: dept.id,
          name: dept.name,
          jobPositionCount: dept._count.jobPositions || 0,
          userCount: userCount // This is not accurate per department, but office-level
        })),
        stats
      };
    });

    return {
      weekNumber,
      year,
      groupBy: 'office' as const,
      offices: officesWithStats,
      summary: this.calculateOfficeSummaryStats(officesWithStats.map(o => o.stats))
    };
  }

  /**
   * Get position details
   */
  async getPositionDetails(userId: string, userRole: Role, positionId: string, filters: HierarchyFilters = {}) {
    const { weekNumber, year } = this.getWeekFilters(filters);

    const position = await this.prisma.position.findUnique({
      where: { id: positionId },
      include: {
        jobPositions: {
          include: {
            users: {
              include: {
                office: true,
                jobPosition: {
                  include: {
                    department: true
                  }
                },
                reports: {
                  where: { weekNumber, year },
                  include: {
                    tasks: true
                  }
                }
              }
            }
          }
        }
      }
    });

    if (!position) {
      throw new NotFoundException('Position not found');
    }

    // Flatten users from all job positions
    const users = position.jobPositions.flatMap(jp => jp.users);
    const mappedUsers = users.map(this.mapUserToPositionUser.bind(this));

    return {
      position: {
        id: position.id,
        name: position.name,
        description: position.description
      },
      weekNumber,
      year,
      groupBy: 'user' as const,
      users: mappedUsers,
      summary: {
        totalUsers: users.length,
        usersWithReports: users.filter(u => u.reports && u.reports.length > 0).length,
        usersWithCompletedReports: users.filter(u => 
          u.reports && u.reports.length > 0 && u.reports[0].tasks &&
          u.reports[0].tasks.every((task: any) => task.isCompleted)
        ).length,
        averageTaskCompletion: this.calculateAverageTaskCompletion(users)
      }
    };
  }

  /**
   * Get position users list
   */
  async getPositionUsers(userId: string, userRole: Role, positionId: string, filters: HierarchyFilters = {}) {
    const { weekNumber, year } = this.getWeekFilters(filters);

    const users = await this.prisma.user.findMany({
      where: {
        jobPosition: {
          positionId: positionId
        },
        isActive: true
      },
      include: {
        office: true,
        jobPosition: {
          include: {
            position: true,
            department: true
          }
        },
        reports: {
          where: { weekNumber, year },
          include: {
            tasks: true
          }
        }
      }
    });

    return {
      positionId,
      weekNumber,
      year,
      users: users.map(this.mapUserToPositionUser.bind(this)),
      summary: {
        totalUsers: users.length,
        usersWithReports: users.filter(u => u.reports && u.reports.length > 0).length
      }
    };
  }

  /**
   * Get user details
   */
  async getUserDetails(userId: string, userRole: Role, targetUserId: string, filters: HierarchyFilters = {}) {
    const { weekNumber, year, limit } = filters;

    const user = await this.prisma.user.findUnique({
      where: { id: targetUserId },
      include: {
        office: true,
        jobPosition: {
          include: {
            position: true,
            department: {
              include: {
                office: true
              }
            }
          }
        }
      }
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Get user reports
    const reportsWhere: any = { userId: targetUserId };
    if (weekNumber && year) {
      reportsWhere.weekNumber = weekNumber;
      reportsWhere.year = year;
    }

    const reports = await this.prisma.report.findMany({
      where: reportsWhere,
      include: {
        tasks: true
      },
      orderBy: [
        { year: 'desc' },
        { weekNumber: 'desc' }
      ],
      take: limit || 10
    });

    // Calculate overall stats
    const totalReports = reports.length;
    const completedReports = reports.filter(r => r.isCompleted).length;
    const totalTasks = reports.reduce((sum, r) => sum + r.tasks.length, 0);
    const completedTasks = reports.reduce((sum, r) => 
      sum + r.tasks.filter((t: any) => t.isCompleted).length, 0);

    return {
      user: {
        id: user.id,
        employeeCode: user.employeeCode,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        role: user.role,
        isActive: user.isActive,
        office: user.office,
        jobPosition: user.jobPosition
      },
      overallStats: {
        totalReports,
        completedReports,
        reportCompletionRate: totalReports > 0 ? Math.round((completedReports / totalReports) * 100) : 0,
        totalTasks,
        completedTasks,
        taskCompletionRate: totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0
      },
      reports: reports.map(report => ({
        id: report.id,
        weekNumber: report.weekNumber,
        year: report.year,
        isCompleted: report.isCompleted,
        isLocked: report.isLocked,
        createdAt: report.createdAt.toISOString(),
        updatedAt: report.updatedAt.toISOString(),
        stats: {
          totalTasks: report.tasks.length,
          completedTasks: report.tasks.filter((t: any) => t.isCompleted).length,
          incompleteTasks: report.tasks.filter((t: any) => !t.isCompleted).length,
          taskCompletionRate: report.tasks.length > 0 
            ? Math.round((report.tasks.filter((t: any) => t.isCompleted).length / report.tasks.length) * 100)
            : 0,
          tasksByDay: this.calculateTasksByDay(report.tasks),
          incompleteReasons: this.calculateIncompleteReasons(report.tasks)
        },
        tasks: report.tasks
      }))
    };
  }

  /**
   * Get employees without reports
   */
  async getEmployeesWithoutReports(userId: string, userRole: Role, filters: HierarchyFilters = {}) {
    const { weekNumber, year, page = 1, limit = 10 } = filters;
    const { weekNumber: currentWeek, year: currentYear } = this.getWeekFilters(filters);

    const whereClause = await this.buildUserWhereClause(userId, userRole, filters);

    const users = await this.prisma.user.findMany({
      where: {
        ...whereClause,
        reports: {
          none: {
            weekNumber: currentWeek,
            year: currentYear
          }
        }
      },
      include: {
        office: true,
        jobPosition: {
          include: {
            position: true,
            department: {
              include: {
                office: true
              }
            }
          }
        }
      },
      skip: (page - 1) * limit,
      take: limit
    });

    const total = await this.prisma.user.count({
      where: {
        ...whereClause,
        reports: {
          none: {
            weekNumber: currentWeek,
            year: currentYear
          }
        }
      }
    });

    return {
      weekNumber: currentWeek,
      year: currentYear,
      employees: users.map(user => ({
        id: user.id,
        employeeCode: user.employeeCode,
        firstName: user.firstName,
        lastName: user.lastName,
        fullName: `${user.firstName} ${user.lastName}`,
        email: user.email,
        role: user.role,
        office: user.office,
        jobPosition: user.jobPosition,
        status: 'not_submitted' as const,
        lastReportDate: null,
        daysOverdue: this.calculateDaysOverdue(currentWeek, currentYear)
      })),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      },
      summary: {
        totalActiveUsers: total,
        usersWithReports: 0,
        usersWithoutReports: total
      }
    };
  }

  /**
   * Get employees with incomplete reports
   */
  async getEmployeesWithIncompleteReports(userId: string, userRole: Role, filters: HierarchyFilters = {}) {
    const { weekNumber, year, page = 1, limit = 10 } = filters;
    const { weekNumber: currentWeek, year: currentYear } = this.getWeekFilters(filters);

    const whereClause = await this.buildUserWhereClause(userId, userRole, filters);

    const users = await this.prisma.user.findMany({
      where: {
        ...whereClause,
        reports: {
          some: {
            weekNumber: currentWeek,
            year: currentYear,
            isCompleted: false
          }
        }
      },
      include: {
        office: true,
        jobPosition: {
          include: {
            position: true,
            department: {
              include: {
                office: true
              }
            }
          }
        },
        reports: {
          where: {
            weekNumber: currentWeek,
            year: currentYear
          },
          include: {
            tasks: true
          }
        }
      },
      skip: (page - 1) * limit,
      take: limit
    });

    const total = await this.prisma.user.count({
      where: {
        ...whereClause,
        reports: {
          some: {
            weekNumber: currentWeek,
            year: currentYear,
            isCompleted: false
          }
        }
      }
    });

    return {
      weekNumber: currentWeek,
      year: currentYear,
      employees: users.map(user => {
        const report = user.reports[0];
        const totalTasks = report?.tasks.length || 0;
        const completedTasks = report?.tasks.filter((t: any) => t.isCompleted).length || 0;

        return {
          id: user.id,
          employeeCode: user.employeeCode,
          firstName: user.firstName,
          lastName: user.lastName,
          fullName: `${user.firstName} ${user.lastName}`,
          email: user.email,
          role: user.role,
          office: user.office,
          jobPosition: user.jobPosition,
          status: 'incomplete' as const,
          reportDetails: report ? {
            id: report.id,
            createdAt: report.createdAt.toISOString(),
            updatedAt: report.updatedAt.toISOString(),
            totalTasks,
            completedTasks,
            incompleteTasks: totalTasks - completedTasks,
            completionRate: totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0
          } : undefined
        };
      }),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      },
      summary: {
        totalActiveUsers: total,
        usersWithReports: total,
        usersWithoutReports: 0
      }
    };
  }

  /**
   * Get employees reporting status
   */
  async getEmployeesReportingStatus(userId: string, userRole: Role, filters: HierarchyFilters = {}) {
    const { weekNumber, year, page = 1, limit = 10, status } = filters;
    const { weekNumber: currentWeek, year: currentYear } = this.getWeekFilters(filters);

    const whereClause = await this.buildUserWhereClause(userId, userRole, filters);

    // Build status-specific where clause
    let statusWhere: any = {};
    if (status === 'not_submitted') {
      statusWhere = {
        reports: {
          none: {
            weekNumber: currentWeek,
            year: currentYear
          }
        }
      };
    } else if (status === 'incomplete') {
      statusWhere = {
        reports: {
          some: {
            weekNumber: currentWeek,
            year: currentYear,
            isCompleted: false
          }
        }
      };
    } else if (status === 'completed') {
      statusWhere = {
        reports: {
          some: {
            weekNumber: currentWeek,
            year: currentYear,
            isCompleted: true
          }
        }
      };
    }

    const users = await this.prisma.user.findMany({
      where: {
        ...whereClause,
        ...statusWhere
      },
      include: {
        office: true,
        jobPosition: {
          include: {
            position: true,
            department: {
              include: {
                office: true
              }
            }
          }
        },
        reports: {
          where: {
            weekNumber: currentWeek,
            year: currentYear
          },
          include: {
            tasks: true
          }
        }
      },
      skip: (page - 1) * limit,
      take: limit
    });

    const total = await this.prisma.user.count({
      where: {
        ...whereClause,
        ...statusWhere
      }
    });

    return {
      weekNumber: currentWeek,
      year: currentYear,
      employees: users.map(user => {
        const report = user.reports[0];
        let userStatus: 'not_submitted' | 'incomplete' | 'completed' = 'not_submitted';

        if (report) {
          userStatus = report.isCompleted ? 'completed' : 'incomplete';
        }

        return {
          id: user.id,
          employeeCode: user.employeeCode,
          firstName: user.firstName,
          lastName: user.lastName,
          fullName: `${user.firstName} ${user.lastName}`,
          email: user.email,
          role: user.role,
          office: user.office,
          jobPosition: user.jobPosition,
          status: userStatus,
          reportDetails: report ? {
            id: report.id,
            createdAt: report.createdAt.toISOString(),
            updatedAt: report.updatedAt.toISOString(),
            totalTasks: report.tasks.length,
            completedTasks: report.tasks.filter((t: any) => t.isCompleted).length,
            completionRate: report.tasks.length > 0 
              ? Math.round((report.tasks.filter((t: any) => t.isCompleted).length / report.tasks.length) * 100)
              : 0
          } : undefined
        };
      }),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      },
      summary: {
        totalActiveUsers: total,
        usersWithReports: users.filter(u => u.reports.length > 0).length,
        usersWithoutReports: users.filter(u => u.reports.length === 0).length
      }
    };
  }

  /**
   * Get task completion trends
   */
  async getTaskCompletionTrends(userId: string, userRole: Role, filters: HierarchyFilters = {}) {
    const { officeId, departmentId, weeks = 4 } = filters;
    const current = getCurrentWorkWeek();

    const whereClause = await this.buildUserWhereClause(userId, userRole, { officeId, departmentId });

    // Generate week ranges
    const weekRanges = [];
    for (let i = 0; i < weeks; i++) {
      let weekNumber = current.weekNumber - i;
      let year = current.year;
      
      if (weekNumber <= 0) {
        weekNumber = 52 + weekNumber;
        year = current.year - 1;
      }
      
      weekRanges.push({ weekNumber, year });
    }

    const trends = [];
    for (const { weekNumber, year } of weekRanges) {
      const reports = await this.prisma.report.findMany({
        where: {
          weekNumber,
          year,
          // Fix: Apply user filter correctly
          user: whereClause
        },
        include: {
          tasks: {
            select: {
              isCompleted: true
            }
          }
        }
      });

      const totalTasks = reports.reduce((sum, report) => sum + report.tasks.length, 0);
      const completedTasks = reports.reduce((sum, report) => 
        sum + report.tasks.filter(task => task.isCompleted).length, 0);

      trends.push({
        weekNumber,
        year,
        totalTasks,
        completedTasks,
        taskCompletionRate: totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0
      });
    }

    trends.sort((a, b) => {
      if (a.year !== b.year) return b.year - a.year;
      return b.weekNumber - a.weekNumber;
    });

    const summary = {
      totalTasks: trends.reduce((sum, t) => sum + t.totalTasks, 0),
      totalCompletedTasks: trends.reduce((sum, t) => sum + t.completedTasks, 0),
      averageTaskCompletion: trends.length > 0 
        ? Math.round(trends.reduce((sum, t) => sum + t.taskCompletionRate, 0) / trends.length)
        : 0
    };

    return {
      filters: { officeId, departmentId, weeks },
      trends,
      summary
    };
  }

  /**
   * Get incomplete reasons hierarchy analysis
   */
  async getIncompleteReasonsHierarchy(userId: string, userRole: Role, filters: HierarchyFilters = {}) {
    const { weekNumber, year } = this.getWeekFilters(filters);

    const whereClause = await this.buildUserWhereClause(userId, userRole, filters);

    const reports = await this.prisma.report.findMany({
      where: {
        weekNumber,
        year,
        // Fix: Apply user filter correctly
        user: whereClause
      },
      include: {
        tasks: {
          where: {
            isCompleted: false,
            reasonNotDone: {
              not: null
            }
          }
        },
        user: {
          include: {
            office: true,
            jobPosition: {
              include: {
                department: true
              }
            }
          }
        }
      }
    });

    const reasonsMap = new Map();
    let totalIncompleteTasks = 0;

    reports.forEach(report => {
      report.tasks.forEach(task => {
        if (!task.isCompleted && task.reasonNotDone) {
          totalIncompleteTasks++;
          
          if (!reasonsMap.has(task.reasonNotDone)) {
            reasonsMap.set(task.reasonNotDone, {
              reason: task.reasonNotDone,
              count: 0,
              users: new Set(),
              sampleTasks: []
            });
          }
          
          const reasonData = reasonsMap.get(task.reasonNotDone);
          reasonData.count++;
          reasonData.users.add(report.user.id);
          
          if (reasonData.sampleTasks.length < 3) {
            reasonData.sampleTasks.push({
              taskName: task.taskName,
              userName: `${report.user.firstName} ${report.user.lastName}`,
              department: report.user.jobPosition?.department?.name || '',
              office: report.user.office?.name || ''
            });
          }
        }
      });
    });

    const reasonsAnalysis = Array.from(reasonsMap.values())
      .map(reason => ({
        reason: reason.reason,
        count: reason.count,
        users: reason.users.size,
        percentage: totalIncompleteTasks > 0 ? Math.round((reason.count / totalIncompleteTasks) * 100) : 0,
        sampleTasks: reason.sampleTasks
      }))
      .sort((a, b) => b.count - a.count);

    return {
      weekNumber,
      year,
      totalReports: reports.length,
      totalIncompleteTasks,
      reasonsAnalysis,
      summary: {
        totalIncompleteTasks,
        diversityIndex: reasonsAnalysis.length
      }
    };
  }

  // Helper methods

  private async buildUserWhereClause(userId: string, userRole: Role, filters: any = {}) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { 
        office: true, 
        jobPosition: { 
          include: { 
            department: true,
            position: true 
          } 
        } 
      }
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    const whereClause: any = { isActive: true };

    if (userRole === Role.SUPERADMIN || userRole === Role.ADMIN) {
      // No additional filters for super admin/admin
    } else if (userRole === Role.USER) {
      // Check if user has hierarchy viewing permission
      if (user.jobPosition?.position?.canViewHierarchy === true) {
        // Management user can see their department
        whereClause.jobPosition = {
          departmentId: user.jobPosition.departmentId
        };
      } else {
        // Regular user can only see themselves
        whereClause.id = userId;
      }
    }

    // Apply additional filters
    if (filters.officeId) {
      whereClause.officeId = filters.officeId;
    }
    if (filters.departmentId) {
      whereClause.jobPosition = {
        ...whereClause.jobPosition,
        departmentId: filters.departmentId
      };
    }

    return whereClause;
  }

  private calculateOfficeStats(users: any[], weekNumber: number, year: number) {
    const totalUsers = users.length;
    const usersWithReports = users.filter(u => u.reports && u.reports.length > 0).length;
    const usersWithoutReports = totalUsers - usersWithReports;

    return {
      totalUsers,
      usersWithReports,
      usersWithoutReports,
      reportSubmissionRate: totalUsers > 0 ? Math.round((usersWithReports / totalUsers) * 100) : 0
    };
  }

  private calculateAverageTaskCompletion(users: any[]): number {
    let totalTasks = 0;
    let completedTasks = 0;

    users.forEach(user => {
      if (user.reports && user.reports.length > 0) {
        const report = user.reports[0];
        if (report.tasks) {
          totalTasks += report.tasks.length;
          completedTasks += report.tasks.filter((t: any) => t.isCompleted).length;
        }
      }
    });

    return totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;
  }

  private calculateTasksByDay(tasks: any[]) {
    return {
      monday: tasks.filter(t => t.monday).length,
      tuesday: tasks.filter(t => t.tuesday).length,
      wednesday: tasks.filter(t => t.wednesday).length,
      thursday: tasks.filter(t => t.thursday).length,
      friday: tasks.filter(t => t.friday).length,
      saturday: tasks.filter(t => t.saturday).length,
    };
  }

  private calculateIncompleteReasons(tasks: any[]) {
    const reasonsMap = new Map();
    
    tasks.forEach(task => {
      if (!task.isCompleted && task.reasonNotDone) {
        if (!reasonsMap.has(task.reasonNotDone)) {
          reasonsMap.set(task.reasonNotDone, {
            reason: task.reasonNotDone,
            count: 0,
            tasks: []
          });
        }
        
        const reasonData = reasonsMap.get(task.reasonNotDone);
        reasonData.count++;
        reasonData.tasks.push(task.taskName);
      }
    });

    return Array.from(reasonsMap.values())
      .sort((a, b) => b.count - a.count);
  }

  private calculateDaysOverdue(weekNumber: number, year: number): number {
    const now = new Date();
    const currentWeek = getCurrentWorkWeek();
    
    if (year < currentWeek.year || (year === currentWeek.year && weekNumber < currentWeek.weekNumber)) {
      // Calculate days since the week ended
      return Math.max(0, Math.floor((now.getTime() - new Date(year, 0, 1 + (weekNumber - 1) * 7).getTime()) / (1000 * 60 * 60 * 24)));
    }
    
    return 0;
  }

  // FIX: Remove duplicate calculateSummaryStats methods and keep only one
  private calculateSummaryStats(users: any[], weekNumber: number, year: number) {
    const totalUsers = users.length;
    const usersWithReports = users.filter(u => u.reports && u.reports.length > 0).length;
    const usersWithoutReports = totalUsers - usersWithReports;

    let totalUsersWithCompletedReports = 0;
    let totalTasks = 0;
    let totalCompletedTasks = 0;
    const allCompletionRates: number[] = [];

    users.forEach(user => {
      if (user.reports && user.reports.length > 0) {
        const report = user.reports[0];
        if (report.tasks) {
          const userTotalTasks = report.tasks.length;
          const userCompletedTasks = report.tasks.filter((task: any) => task.isCompleted).length;
          
          totalTasks += userTotalTasks;
          totalCompletedTasks += userCompletedTasks;
          
          const userCompletionRate = userTotalTasks > 0 ? (userCompletedTasks / userTotalTasks) * 100 : 0;
          allCompletionRates.push(userCompletionRate);
          
          if (userCompletionRate === 100) {
            totalUsersWithCompletedReports++;
          }
        }
      } else {
        allCompletionRates.push(0);
      }
    });

    const averageSubmissionRate = totalUsers > 0 ? Math.round((usersWithReports / totalUsers) * 100) : 0;
    const averageCompletionRate = totalTasks > 0 ? Math.round((totalCompletedTasks / totalTasks) * 100) : 0;

    const positionSet = new Set();
    users.forEach(user => {
      if (user.jobPosition?.position) {
        positionSet.add(user.jobPosition.position.id);
      }
    });

    return {
      totalPositions: positionSet.size,
      totalUsers,
      totalUsersWithReports: usersWithReports,
      totalUsersWithCompletedReports,
      totalUsersWithoutReports: usersWithoutReports,
      averageSubmissionRate,
      averageCompletionRate,
      rankingDistribution: this.calculateRankingDistribution(allCompletionRates)
    };
  }

  // Separate method for office summary stats
  private calculateOfficeSummaryStats(officeStats: any[]) {
    const totalUsers = officeStats.reduce((sum, stat) => sum + stat.totalUsers, 0);
    const totalUsersWithReports = officeStats.reduce((sum, stat) => sum + stat.usersWithReports, 0);
    const averageSubmissionRate = totalUsers > 0 ? Math.round((totalUsersWithReports / totalUsers) * 100) : 0;

    return {
      totalPositions: officeStats.length,
      totalUsers,
      totalUsersWithReports,
      totalUsersWithCompletedReports: 0,
      totalUsersWithoutReports: totalUsers - totalUsersWithReports,
      averageSubmissionRate,
      averageCompletionRate: 0,
      rankingDistribution: {
        excellent: { count: 0, percentage: 0 },
        good: { count: 0, percentage: 0 },
        average: { count: 0, percentage: 0 },
        poor: { count: 0, percentage: 0 },
        fail: { count: 0, percentage: 0 }
      }
    };
  }

  /**
   * Get specific report details for admin view
   */
  async getReportDetailsForAdmin(userId: string, reportId: string, currentUser: any) {
    // Verify the target user exists
    const targetUser = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        office: true,
        jobPosition: {
          include: {
            department: { include: { office: true } },
            position: true,
          },
        },
      },
    });

    if (!targetUser) {
      throw new NotFoundException('User not found');
    }

    // Check permissions - admin can only view reports from their office
    // if (currentUser.role === Role.ADMIN && targetUser.officeId !== currentUser.officeId) {
    //   throw new ForbiddenException('You can only view reports from your office');
    // }

    // Get the specific report
    const report = await this.prisma.report.findFirst({
      where: {
        id: reportId,
        userId: userId,
      },
      include: {
        tasks: {
          orderBy: { createdAt: 'asc' },
        },
        user: {
          include: {
            office: true,
            jobPosition: {
              include: {
                department: { include: { office: true } },
                position: true,
              },
            },
          },
        },
      },
    });

    if (!report) {
      throw new NotFoundException('Report not found');
    }

    // Calculate report statistics
    const stats = this.calculateReportStatistics(report);

    return {
      report,
      user: targetUser,
      stats,
    };
  }

  /**
   * Calculate detailed statistics for a report
   */
  private calculateReportStatistics(report: any) {
    const tasks = report.tasks || [];
    const totalTasks = tasks.length;
    const completedTasks = tasks.filter((task: any) => task.isCompleted).length;
    const incompleteTasks = totalTasks - completedTasks;
    const taskCompletionRate = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

    // Calculate tasks by day
    const tasksByDay = {
      monday: tasks.filter((task: any) => task.monday).length,
      tuesday: tasks.filter((task: any) => task.tuesday).length,
      wednesday: tasks.filter((task: any) => task.wednesday).length,
      thursday: tasks.filter((task: any) => task.thursday).length,
      friday: tasks.filter((task: any) => task.friday).length,
      saturday: tasks.filter((task: any) => task.saturday).length,
    };

    // Group incomplete reasons
    const incompleteReasons = [];
    const reasonGroups = new Map();

    tasks
      .filter((task: any) => !task.isCompleted && task.reasonNotDone)
      .forEach((task: any) => {
        const reason = task.reasonNotDone.trim();
        if (!reasonGroups.has(reason)) {
          reasonGroups.set(reason, {
            reason,
            count: 0,
            tasks: [],
          });
        }
        const group = reasonGroups.get(reason);
        group.count++;
        group.tasks.push(task.taskName);
      });

    incompleteReasons.push(...reasonGroups.values());

    return {
      totalTasks,
      completedTasks,
      incompleteTasks,
      taskCompletionRate,
      tasksByDay,
      incompleteReasons,
    };
  }
}
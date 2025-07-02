import { Injectable, Logger, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { Role } from '@prisma/client';
import { getCurrentWeek } from '../common/utils/week-utils';

export enum EmployeeRanking {
  EXCELLENT = 'EXCELLENT',       // Xuất sắc (90-100%)
  GOOD = 'GOOD',                 // Tốt (80-89%)
  AVERAGE = 'AVERAGE',           // Trung bình (70-79%)
  BELOW_AVERAGE = 'BELOW_AVERAGE', // Dưới trung bình (60-69%)
  POOR = 'POOR'                  // Kém (< 60%)
}

@Injectable()
export class RankingService {
  private readonly logger = new Logger(RankingService.name);

  constructor(private prisma: PrismaService) {}

  // Calculate ranking based on completion rate
  private calculateRanking(completionRate: number): EmployeeRanking {
    if (completionRate >= 90) return EmployeeRanking.EXCELLENT;
    if (completionRate >= 80) return EmployeeRanking.GOOD;
    if (completionRate >= 70) return EmployeeRanking.AVERAGE;
    if (completionRate >= 60) return EmployeeRanking.BELOW_AVERAGE;
    return EmployeeRanking.POOR;
  }

  // Get ranking label in Vietnamese
  private getRankingLabel(ranking: EmployeeRanking): string {
    const labels = {
      [EmployeeRanking.EXCELLENT]: 'Xuất sắc',
      [EmployeeRanking.GOOD]: 'Tốt',
      [EmployeeRanking.AVERAGE]: 'Trung bình',
      [EmployeeRanking.BELOW_AVERAGE]: 'Dưới trung bình',
      [EmployeeRanking.POOR]: 'Kém'
    };
    return labels[ranking];
  }

  // Calculate percentage for consistent results
  private calculatePercentage(numerator: number, denominator: number): number {
    if (denominator === 0) return 0;
    return Math.round((numerator / denominator) * 100);
  }

  async getEmployeeRanking(
    currentUser: any,
    filters: {
      employeeId?: string;
      weekNumber?: number;
      year?: number;
      periodWeeks?: number; // Number of weeks to analyze (default: 4)
    }
  ) {
    const { weekNumber: currentWeek, year: currentYear } = getCurrentWeek();
    const targetWeek = filters.weekNumber || currentWeek;
    const targetYear = filters.year || currentYear;
    const periodWeeks = filters.periodWeeks || 4;

    // Generate week ranges for analysis period
    const weekRanges = [];
    for (let i = 0; i < periodWeeks; i++) {
      let week = targetWeek - i;
      let year = targetYear;
      
      if (week <= 0) {
        week = 52 + week;
        year = targetYear - 1;
      }
      
      weekRanges.push({ weekNumber: week, year });
    }

    // Build where clause for user access control
    const userWhereClause: any = { isActive: true };
    
    if (filters.employeeId) {
      // Check if current user can access this employee
      if (!await this.canAccessEmployee(currentUser, filters.employeeId)) {
        throw new ForbiddenException('Access denied to this employee');
      }
      userWhereClause.id = filters.employeeId;
    } else {
      // Apply role-based filtering
      this.applyRoleBasedFiltering(currentUser, userWhereClause);
    }

    // Get users with their reports
    const users = await this.prisma.user.findMany({
      where: userWhereClause,
      include: {
        office: { select: { id: true, name: true, type: true } },
        jobPosition: {
          include: {
            position: { select: { name: true } },
            department: {
              include: {
                office: { select: { name: true } }
              }
            }
          }
        },
        reports: {
          where: {
            OR: weekRanges.map(({ weekNumber, year }) => ({ weekNumber, year }))
          },
          include: {
            tasks: {
              select: { isCompleted: true }
            }
          }
        }
      },
      orderBy: [
        { office: { name: 'asc' } },
        { jobPosition: { department: { name: 'asc' } } },
        { lastName: 'asc' },
        { firstName: 'asc' }
      ]
    });

    // Calculate rankings for each user
    const employeeRankings = users.map(user => {
      const totalTasks = user.reports.reduce((sum, report) => sum + report.tasks.length, 0);
      const completedTasks = user.reports.reduce(
        (sum, report) => sum + report.tasks.filter(task => task.isCompleted).length, 
        0
      );
      
      const completionRate = this.calculatePercentage(completedTasks, totalTasks);
      const ranking = this.calculateRanking(completionRate);
      
      return {
        employee: {
          id: user.id,
          employeeCode: user.employeeCode,
          firstName: user.firstName,
          lastName: user.lastName,
          fullName: `${user.firstName} ${user.lastName}`,
          email: user.email,
          role: user.role,
          office: user.office,
          jobPosition: {
            id: user.jobPosition.id,
            jobName: user.jobPosition.jobName,
            positionName: user.jobPosition.position.name,
            department: {
              id: user.jobPosition.department.id,
              name: user.jobPosition.department.name,
              office: user.jobPosition.department.office
            }
          }
        },
        performance: {
          totalReports: user.reports.length,
          totalTasks,
          completedTasks,
          completionRate,
          ranking,
          rankingLabel: this.getRankingLabel(ranking),
          analysisPeriod: {
            weeks: periodWeeks,
            from: weekRanges[weekRanges.length - 1],
            to: weekRanges[0]
          }
        }
      };
    });

    return {
      filters: {
        ...filters,
        weekNumber: targetWeek,
        year: targetYear,
        periodWeeks
      },
      employees: employeeRankings,
      summary: this.calculateRankingSummary(employeeRankings)
    };
  }

  async getDepartmentRankingStats(
    currentUser: any,
    filters: {
      departmentId?: string;
      officeId?: string; // Add officeId to get departments within an office
      weekNumber?: number;
      year?: number;
      periodWeeks?: number;
    }
  ) {
    const { weekNumber: currentWeek, year: currentYear } = getCurrentWeek();
    const targetWeek = filters.weekNumber || currentWeek;
    const targetYear = filters.year || currentYear;
    const periodWeeks = filters.periodWeeks || 4;

    // Build where clause based on user role and filters
    const departmentWhereClause: any = {};
    
    if (filters.departmentId) {
      if (!await this.canAccessDepartment(currentUser, filters.departmentId)) {
        throw new ForbiddenException('Access denied to this department');
      }
      departmentWhereClause.id = filters.departmentId;
    } else if (filters.officeId) {
      // Get departments within a specific office
      if (!this.canAccessOffice(currentUser, filters.officeId)) {
        throw new ForbiddenException('Access denied to this office');
      }
      departmentWhereClause.officeId = filters.officeId;
    } else {
      // When no specific ID is provided, get departments based on user role
      this.applyRoleBasedDepartmentFiltering(currentUser, departmentWhereClause);
    }

    // Generate week ranges
    const weekRanges = [];
    for (let i = 0; i < periodWeeks; i++) {
      let week = targetWeek - i;
      let year = targetYear;
      
      if (week <= 0) {
        week = 52 + week;
        year = targetYear - 1;
      }
      
      weekRanges.push({ weekNumber: week, year });
    }

    // Get departments with user performance data
    const departments = await this.prisma.department.findMany({
      where: departmentWhereClause,
      include: {
        office: { select: { id: true, name: true, type: true } },
        jobPositions: {
          include: {
            users: {
              where: { isActive: true },
              include: {
                reports: {
                  where: {
                    OR: weekRanges.map(({ weekNumber, year }) => ({ weekNumber, year }))
                  },
                  include: {
                    tasks: { select: { isCompleted: true } }
                  }
                }
              }
            }
          }
        }
      },
      orderBy: { name: 'asc' }
    });

    const departmentStats = departments.map(department => {
      const allUsers = department.jobPositions.flatMap(jp => jp.users);
      
      // Calculate individual employee rankings
      const employeeRankings = allUsers.map(user => {
        const totalTasks = user.reports.reduce((sum, report) => sum + report.tasks.length, 0);
        const completedTasks = user.reports.reduce(
          (sum, report) => sum + report.tasks.filter(task => task.isCompleted).length, 
          0
        );
        
        const completionRate = this.calculatePercentage(completedTasks, totalTasks);
        const ranking = this.calculateRanking(completionRate);
        
        return { completionRate, ranking };
      });

      // Calculate department statistics
      const rankingCounts = this.calculateRankingCounts(employeeRankings);
      const averageCompletionRate = employeeRankings.length > 0
        ? Math.round(employeeRankings.reduce((sum, emp) => sum + emp.completionRate, 0) / employeeRankings.length)
        : 0;

      return {
        department: {
          id: department.id,
          name: department.name,
          description: department.description,
          office: department.office
        },
        stats: {
          totalEmployees: allUsers.length,
          averageCompletionRate,
          departmentRanking: this.calculateRanking(averageCompletionRate),
          rankingDistribution: rankingCounts,
          topPerformers: this.getTopPerformers(allUsers, employeeRankings),
          needsImprovement: this.getNeedsImprovement(allUsers, employeeRankings)
        }
      };
    });

    return {
      filters: {
        ...filters,
        weekNumber: targetWeek,
        year: targetYear,
        periodWeeks
      },
      departments: departmentStats,
      summary: this.calculateDepartmentSummary(departmentStats)
    };
  }

  async getOfficeRankingStats(
    currentUser: any,
    filters: {
      officeId?: string;
      weekNumber?: number;
      year?: number;
      periodWeeks?: number;
    }
  ) {
    const { weekNumber: currentWeek, year: currentYear } = getCurrentWeek();
    const targetWeek = filters.weekNumber || currentWeek;
    const targetYear = filters.year || currentYear;
    const periodWeeks = filters.periodWeeks || 4;

    // Build where clause based on user role and filters
    const officeWhereClause: any = {};
    
    if (filters.officeId) {
      // Check access permissions for specific office
      if (!this.canAccessOffice(currentUser, filters.officeId)) {
        throw new ForbiddenException('Access denied to this office');
      }
      officeWhereClause.id = filters.officeId;
    } else {
      // When no specific office ID is provided, get offices based on user role
      this.applyRoleBasedOfficeFiltering(currentUser, officeWhereClause);
    }

    // Generate week ranges
    const weekRanges = [];
    for (let i = 0; i < periodWeeks; i++) {
      let week = targetWeek - i;
      let year = targetYear;
      
      if (week <= 0) {
        week = 52 + week;
        year = targetYear - 1;
      }
      
      weekRanges.push({ weekNumber: week, year });
    }

    // Get offices with complete performance data
    const offices = await this.prisma.office.findMany({
      where: officeWhereClause,
      include: {
        departments: {
          include: {
            jobPositions: {
              include: {
                users: {
                  where: { isActive: true },
                  include: {
                    reports: {
                      where: {
                        OR: weekRanges.map(({ weekNumber, year }) => ({ weekNumber, year }))
                      },
                      include: {
                        tasks: { select: { isCompleted: true } }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      },
      orderBy: [
        { type: 'asc' },
        { name: 'asc' }
      ]
    });

    const officeStats = offices.map(office => {
      const allUsers = office.departments.flatMap(dept => 
        dept.jobPositions.flatMap(jp => jp.users)
      );
      
      // Calculate individual employee rankings
      const employeeRankings = allUsers.map(user => {
        const totalTasks = user.reports.reduce((sum, report) => sum + report.tasks.length, 0);
        const completedTasks = user.reports.reduce(
          (sum, report) => sum + report.tasks.filter(task => task.isCompleted).length, 
          0
        );
        
        const completionRate = this.calculatePercentage(completedTasks, totalTasks);
        const ranking = this.calculateRanking(completionRate);
        
        return { user, completionRate, ranking };
      });

      // Calculate department-level stats
      const departmentStats = office.departments.map(dept => {
        const deptUsers = dept.jobPositions.flatMap(jp => jp.users);
        const deptEmployeeRankings = deptUsers.map(user => {
          const totalTasks = user.reports.reduce((sum, report) => sum + report.tasks.length, 0);
          const completedTasks = user.reports.reduce(
            (sum, report) => sum + report.tasks.filter(task => task.isCompleted).length, 
            0
          );
          
          const completionRate = this.calculatePercentage(completedTasks, totalTasks);
          const ranking = this.calculateRanking(completionRate);
          
          return { completionRate, ranking };
        });

        const avgCompletionRate = deptEmployeeRankings.length > 0
          ? Math.round(deptEmployeeRankings.reduce((sum, emp) => sum + emp.completionRate, 0) / deptEmployeeRankings.length)
          : 0;

        return {
          departmentId: dept.id,
          departmentName: dept.name,
          totalEmployees: deptUsers.length,
          averageCompletionRate: avgCompletionRate,
          departmentRanking: this.calculateRanking(avgCompletionRate),
          rankingDistribution: this.calculateRankingCounts(deptEmployeeRankings)
        };
      });

      // Calculate office statistics
      const rankingCounts = this.calculateRankingCounts(employeeRankings);
      const averageCompletionRate = employeeRankings.length > 0
        ? Math.round(employeeRankings.reduce((sum, emp) => sum + emp.completionRate, 0) / employeeRankings.length)
        : 0;

      return {
        office: {
          id: office.id,
          name: office.name,
          type: office.type,
          description: office.description
        },
        stats: {
          totalEmployees: allUsers.length,
          totalDepartments: office.departments.length,
          averageCompletionRate,
          officeRanking: this.calculateRanking(averageCompletionRate),
          rankingDistribution: rankingCounts,
          departmentBreakdown: departmentStats,
          topPerformers: this.getTopPerformers(allUsers, employeeRankings).slice(0, 5),
          needsImprovement: this.getNeedsImprovement(allUsers, employeeRankings).slice(0, 5)
        }
      };
    });

    return {
      filters: {
        ...filters,
        weekNumber: targetWeek,
        year: targetYear,
        periodWeeks
      },
      offices: officeStats,
      summary: this.calculateOfficeSummary(officeStats)
    };
  }

  async getOverallRankingStats(
    currentUser: any,
    filters: {
      weekNumber?: number;
      year?: number;
      periodWeeks?: number;
    }
  ) {
    // Only ADMIN and SUPERADMIN can see overall stats
    if (![Role.ADMIN, Role.SUPERADMIN].includes(currentUser.role)) {
      throw new ForbiddenException('Access denied');
    }

    const { weekNumber: currentWeek, year: currentYear } = getCurrentWeek();
    const targetWeek = filters.weekNumber || currentWeek;
    const targetYear = filters.year || currentYear;
    const periodWeeks = filters.periodWeeks || 4;

    // Generate week ranges
    const weekRanges = [];
    for (let i = 0; i < periodWeeks; i++) {
      let week = targetWeek - i;
      let year = targetYear;
      
      if (week <= 0) {
        week = 52 + week;
        year = targetYear - 1;
      }
      
      weekRanges.push({ weekNumber: week, year });
    }

    // Get all offices with complete data
    const offices = await this.prisma.office.findMany({
      include: {
        departments: {
          include: {
            jobPositions: {
              include: {
                users: {
                  where: { isActive: true },
                  include: {
                    reports: {
                      where: {
                        OR: weekRanges.map(({ weekNumber, year }) => ({ weekNumber, year }))
                      },
                      include: {
                        tasks: { select: { isCompleted: true } }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      },
      orderBy: [
        { type: 'asc' },
        { name: 'asc' }
      ]
    });

    // Calculate overall statistics
    const allUsers = offices.flatMap(office =>
      office.departments.flatMap(dept => 
        dept.jobPositions.flatMap(jp => jp.users)
      )
    );

    const employeeRankings = allUsers.map(user => {
      const totalTasks = user.reports.reduce((sum, report) => sum + report.tasks.length, 0);
      const completedTasks = user.reports.reduce(
        (sum, report) => sum + report.tasks.filter(task => task.isCompleted).length, 
        0
      );
      
      const completionRate = this.calculatePercentage(completedTasks, totalTasks);
      const ranking = this.calculateRanking(completionRate);
      
      return { user, completionRate, ranking };
    });

    // Calculate office-level rankings
    const officeRankings = offices.map(office => {
      const officeUsers = office.departments.flatMap(dept => 
        dept.jobPositions.flatMap(jp => jp.users)
      );
      
      const officeEmployeeRankings = officeUsers.map(user => {
        const totalTasks = user.reports.reduce((sum, report) => sum + report.tasks.length, 0);
        const completedTasks = user.reports.reduce(
          (sum, report) => sum + report.tasks.filter(task => task.isCompleted).length, 
          0
        );
        
        return this.calculatePercentage(completedTasks, totalTasks);
      });

      const averageCompletionRate = officeEmployeeRankings.length > 0
        ? Math.round(officeEmployeeRankings.reduce((sum, rate) => sum + rate, 0) / officeEmployeeRankings.length)
        : 0;

      return {
        office: {
          id: office.id,
          name: office.name,
          type: office.type
        },
        averageCompletionRate,
        ranking: this.calculateRanking(averageCompletionRate),
        totalEmployees: officeUsers.length
      };
    });

    return {
      filters: {
        ...filters,
        weekNumber: targetWeek,
        year: targetYear,
        periodWeeks
      },
      overall: {
        totalEmployees: allUsers.length,
        totalOffices: offices.length,
        totalDepartments: offices.reduce((sum, office) => sum + office.departments.length, 0),
        rankingDistribution: this.calculateRankingCounts(employeeRankings),
        averageCompletionRate: employeeRankings.length > 0
          ? Math.round(employeeRankings.reduce((sum, emp) => sum + emp.completionRate, 0) / employeeRankings.length)
          : 0
      },
      officeRankings: officeRankings.sort((a, b) => b.averageCompletionRate - a.averageCompletionRate),
      topPerformers: this.getTopPerformers(allUsers, employeeRankings).slice(0, 10),
      needsImprovement: this.getNeedsImprovement(allUsers, employeeRankings).slice(0, 10)
    };
  }

  // Helper methods
  private calculateRankingCounts(employeeRankings: any[]) {
    const counts = {
      [EmployeeRanking.EXCELLENT]: 0,
      [EmployeeRanking.GOOD]: 0,
      [EmployeeRanking.AVERAGE]: 0,
      [EmployeeRanking.BELOW_AVERAGE]: 0,
      [EmployeeRanking.POOR]: 0
    };

    employeeRankings.forEach(emp => {
      counts[emp.ranking]++;
    });

    const total = employeeRankings.length;
    
    return {
      excellent: { count: counts[EmployeeRanking.EXCELLENT], percentage: this.calculatePercentage(counts[EmployeeRanking.EXCELLENT], total) },
      good: { count: counts[EmployeeRanking.GOOD], percentage: this.calculatePercentage(counts[EmployeeRanking.GOOD], total) },
      average: { count: counts[EmployeeRanking.AVERAGE], percentage: this.calculatePercentage(counts[EmployeeRanking.AVERAGE], total) },
      belowAverage: { count: counts[EmployeeRanking.BELOW_AVERAGE], percentage: this.calculatePercentage(counts[EmployeeRanking.BELOW_AVERAGE], total) },
      poor: { count: counts[EmployeeRanking.POOR], percentage: this.calculatePercentage(counts[EmployeeRanking.POOR], total) }
    };
  }

  private calculateRankingSummary(employeeRankings: any[]) {
    const rankingCounts = this.calculateRankingCounts(employeeRankings);
    
    return {
      totalEmployees: employeeRankings.length,
      rankingDistribution: rankingCounts,
      averageCompletionRate: employeeRankings.length > 0
        ? Math.round(employeeRankings.reduce((sum, emp) => sum + emp.performance.completionRate, 0) / employeeRankings.length)
        : 0,
      topPerformers: employeeRankings
        .filter(emp => emp.performance.ranking === EmployeeRanking.EXCELLENT)
        .length,
      needsImprovement: employeeRankings
        .filter(emp => [EmployeeRanking.BELOW_AVERAGE, EmployeeRanking.POOR].includes(emp.performance.ranking))
        .length
    };
  }

  private calculateDepartmentSummary(departmentStats: any[]) {
    const totalEmployees = departmentStats.reduce((sum, dept) => sum + dept.stats.totalEmployees, 0);
    const averageCompletionRate = departmentStats.length > 0
      ? Math.round(departmentStats.reduce((sum, dept) => sum + dept.stats.averageCompletionRate, 0) / departmentStats.length)
      : 0;

    return {
      totalDepartments: departmentStats.length,
      totalEmployees,
      averageCompletionRate,
      bestPerformingDepartment: departmentStats.reduce((best, current) =>
        current.stats.averageCompletionRate > best.stats.averageCompletionRate ? current : best
      ),
      needsImprovementDepartments: departmentStats.filter(dept => 
        dept.stats.averageCompletionRate < 70
      ).length
    };
  }

  private calculateOfficeSummary(officeStats: any[]) {
    const totalEmployees = officeStats.reduce((sum, office) => sum + office.stats.totalEmployees, 0);
    const averageCompletionRate = officeStats.length > 0
      ? Math.round(officeStats.reduce((sum, office) => sum + office.stats.averageCompletionRate, 0) / officeStats.length)
      : 0;

    return {
      totalOffices: officeStats.length,
      totalEmployees,
      averageCompletionRate,
      bestPerformingOffice: officeStats.reduce((best, current) =>
        current.stats.averageCompletionRate > best.stats.averageCompletionRate ? current : best
      ),
      needsImprovementOffices: officeStats.filter(office => 
        office.stats.averageCompletionRate < 70
      ).length
    };
  }

  private getTopPerformers(users: any[], employeeRankings: any[]) {
    return employeeRankings
      .filter(emp => emp.ranking === EmployeeRanking.EXCELLENT)
      .sort((a, b) => b.completionRate - a.completionRate)
      .slice(0, 10)
      .map(emp => ({
        employeeCode: emp.user.employeeCode,
        fullName: `${emp.user.firstName} ${emp.user.lastName}`,
        completionRate: emp.completionRate,
        ranking: emp.ranking
      }));
  }

  private getNeedsImprovement(users: any[], employeeRankings: any[]) {
    return employeeRankings
      .filter(emp => [EmployeeRanking.BELOW_AVERAGE, EmployeeRanking.POOR].includes(emp.ranking))
      .sort((a, b) => a.completionRate - b.completionRate)
      .slice(0, 10)
      .map(emp => ({
        employeeCode: emp.user.employeeCode,
        fullName: `${emp.user.firstName} ${emp.user.lastName}`,
        completionRate: emp.completionRate,
        ranking: emp.ranking
      }));
  }

  // Access control methods
  private async canAccessEmployee(currentUser: any, employeeId: string): Promise<boolean> {
    switch (currentUser.role) {
      case Role.SUPERADMIN:
      case Role.ADMIN:
        return true;
      case Role.OFFICE_MANAGER: {
        const employee = await this.prisma.user.findUnique({
          where: { id: employeeId },
          select: { officeId: true }
        });
        return employee?.officeId === currentUser.officeId;
      }
      case Role.OFFICE_ADMIN: {
        const empDept = await this.prisma.user.findUnique({
          where: { id: employeeId },
          include: { jobPosition: { select: { departmentId: true } } }
        });
        const currentUserDept = await this.getUserDepartmentId(currentUser.id);
        return empDept?.jobPosition?.departmentId === currentUserDept;
      }
      default:
        return currentUser.id === employeeId;
    }
  }

  private async canAccessDepartment(currentUser: any, departmentId: string): Promise<boolean> {
    switch (currentUser.role) {
      case Role.SUPERADMIN:
      case Role.ADMIN:
        return true;
      case Role.OFFICE_MANAGER: {
        const department = await this.prisma.department.findUnique({
          where: { id: departmentId },
          select: { officeId: true }
        });
        return department?.officeId === currentUser.officeId;
      }
      case Role.OFFICE_ADMIN: {
        const currentUserDept = await this.getUserDepartmentId(currentUser.id);
        return currentUserDept === departmentId;
      }
      default:
        return false;
    }
  }

  private canAccessOffice(currentUser: any, officeId: string): boolean {
    switch (currentUser.role) {
      case Role.SUPERADMIN:
      case Role.ADMIN:
        return true;
      case Role.OFFICE_MANAGER:
        return currentUser.officeId === officeId;
      default:
        return false;
    }
  }

  private applyRoleBasedFiltering(currentUser: any, whereClause: any) {
    switch (currentUser.role) {
      case Role.OFFICE_MANAGER:
        whereClause.officeId = currentUser.officeId;
        break;
      case Role.OFFICE_ADMIN:
        // This will be handled in the query
        break;
      case Role.USER:
        whereClause.id = currentUser.id;
        break;
    }
  }

  private applyRoleBasedDepartmentFiltering(currentUser: any, whereClause: any) {
    switch (currentUser.role) {
      case Role.SUPERADMIN:
      case Role.ADMIN:
        // No filtering - can see all departments
        break;
      case Role.OFFICE_MANAGER:
        whereClause.officeId = currentUser.officeId;
        break;
      case Role.OFFICE_ADMIN: {
        // Get departments within the user's department scope
        // For now, just the user's own department
        const userDepartmentId = this.getUserDepartmentIdSync(currentUser);
        if (userDepartmentId) {
          whereClause.id = userDepartmentId;
        }
        break;
      }
      default:
        // Regular users shouldn't access department rankings
        whereClause.id = 'non-existent-id'; // This will return empty results
        break;
    }
  }

  private applyRoleBasedOfficeFiltering(currentUser: any, whereClause: any) {
    switch (currentUser.role) {
      case Role.SUPERADMIN:
      case Role.ADMIN:
        // No filtering - can see all offices
        break;
      case Role.OFFICE_MANAGER:
        whereClause.id = currentUser.officeId;
        break;
      case Role.OFFICE_ADMIN:
      case Role.USER:
        // Office admins and users can only see their own office
        whereClause.id = currentUser.officeId;
        break;
      default:
        whereClause.id = 'non-existent-id'; // This will return empty results
        break;
    }
  }

  private getUserDepartmentIdSync(currentUser: any): string | null {
    // Try to get department ID from the user object first
    if (currentUser.jobPosition?.departmentId) {
      return currentUser.jobPosition.departmentId;
    }
    
    // If not available, we'll need to handle this case
    // For now, return null and let the calling code handle it
    return null;
  }

  private async getUserDepartmentId(userId: string): Promise<string | null> {
    try {
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        include: { 
          jobPosition: { 
            select: { departmentId: true } 
          } 
        },
      });
      return user?.jobPosition?.departmentId || null;
    } catch (error) {
      this.logger.error('Error getting user department ID:', error);
      return null;
    }
  }
}

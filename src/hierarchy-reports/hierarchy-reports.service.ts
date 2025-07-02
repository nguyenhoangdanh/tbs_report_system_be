import {
  Injectable,
  ForbiddenException,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { Role } from '@prisma/client';
import { getCurrentWeek, calculateDaysOverdue } from '../common/utils/week-utils';

@Injectable()
export class HierarchyReportsService {
  private readonly logger = new Logger(HierarchyReportsService.name);

  constructor(private prisma: PrismaService) {}

  // Fixed helper method - ensure consistent integer percentage calculation
    // Fixed helper method - ensure consistent percentage calculation with 2 decimal places
  private calculatePercentage(numerator: number, denominator: number): number {
    if (denominator === 0) return 0;
    const percentage = (numerator / denominator) * 100;
    return Math.round(percentage * 100) / 100; // Round to 2 decimal places
  }

  // Helper method for integer percentage (when we specifically want whole numbers)
  private calculateIntegerPercentage(numerator: number, denominator: number): number {
    if (denominator === 0) return 0;
    return Math.round((numerator / denominator) * 100);
  }

  // Helper method to calculate ranking distribution
  private calculateRankingDistribution(completionRates: number[]): {
    excellent: { count: number; percentage: number }
    good: { count: number; percentage: number }
    average: { count: number; percentage: number }
    poor: { count: number; percentage: number }
    fail: { count: number; percentage: number }
  } {
    const total = completionRates.length
    
    if (total === 0) {
      return {
        excellent: { count: 0, percentage: 0 },
        good: { count: 0, percentage: 0 },
        average: { count: 0, percentage: 0 },
        poor: { count: 0, percentage: 0 },
        fail: { count: 0, percentage: 0 }
      }
    }

    const excellent = completionRates.filter(rate => rate === 100).length
    const good = completionRates.filter(rate => rate >= 95 && rate < 100).length
    const average = completionRates.filter(rate => rate >= 90 && rate < 95).length
    const poor = completionRates.filter(rate => rate >= 85 && rate < 90).length
    const fail = completionRates.filter(rate => rate < 85).length

    return {
      excellent: { count: excellent, percentage: this.calculatePercentage(excellent, total) },
      good: { count: good, percentage: this.calculatePercentage(good, total) },
      average: { count: average, percentage: this.calculatePercentage(average, total) },
      poor: { count: poor, percentage: this.calculatePercentage(poor, total) },
      fail: { count: fail, percentage: this.calculatePercentage(fail, total) }
    }
  }

  async getOfficesOverview(
    currentUser: any,
    weekNumber?: number,
    year?: number,
  ) {
    // Only ADMIN and SUPERADMIN can see all offices
    if (![Role.ADMIN, Role.SUPERADMIN].includes(currentUser.role)) {
      throw new ForbiddenException('Access denied');
    }

    const { weekNumber: currentWeek, year: currentYear } = getCurrentWeek();
    const targetWeek = weekNumber || currentWeek;
    const targetYear = year || currentYear;

    try {
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
                          weekNumber: targetWeek,
                          year: targetYear,
                        },
                        include: {
                          tasks: {
                            select: {
                              isCompleted: true,
                              reasonNotDone: true,
                            },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
          _count: {
            select: {
              departments: true,
              users: { where: { isActive: true } },
            },
          },
        },
        orderBy: [
          { type: 'asc' },
          { name: 'asc' }
        ],
      });

      const sortedOffices = this.sortOffices(offices);

      const officesStats = sortedOffices.map((office) => {
        const allUsers = office.departments.flatMap((dept) =>
          dept.jobPositions.flatMap((jp) => jp.users),
        );

        const usersWithReports = allUsers.filter(
          (user) => user.reports.length > 0,
        );

        const usersWithCompletedReports = usersWithReports.filter((user) =>
          user.reports.some((report) => report.isCompleted),
        );

        // Calculate task completion for this office
        const totalTasks = usersWithReports.reduce(
          (sum, user) =>
            sum +
            user.reports.reduce(
              (taskSum, report) => taskSum + report.tasks.length,
              0,
            ),
          0,
        );

        const completedTasks = usersWithReports.reduce(
          (sum, user) =>
            sum +
            user.reports.reduce(
              (taskSum, report) =>
                taskSum + report.tasks.filter((task) => task.isCompleted).length,
              0,
            ),
          0,
        );

        // Calculate overall office task completion rate
        const officeTaskCompletionRate = this.calculatePercentage(completedTasks, totalTasks);

        // Lý do chưa hoàn thành task
        const incompleteReasons = new Map<string, number>();
        usersWithReports.forEach((user) => {
          user.reports.forEach((report) => {
            report.tasks
              .filter((task) => !task.isCompleted)
              .forEach((task) => {
                const reason = task.reasonNotDone?.trim() || 'Không có lý do';
                incompleteReasons.set(reason, (incompleteReasons.get(reason) || 0) + 1);
              });
          });
        });

        const topIncompleteReasons = Array.from(incompleteReasons.entries())
          .map(([reason, count]) => ({ reason, count }))
          .sort((a, b) => b.count - a.count)
          .slice(0, 5);

        return {
          id: office.id,
          name: office.name,
          type: office.type,
          description: office.description,
          stats: {
            totalDepartments: office._count.departments,
            totalUsers: allUsers.length,
            usersWithReports: usersWithReports.length,
            usersWithCompletedReports: usersWithCompletedReports.length,
            usersWithoutReports: allUsers.length - usersWithReports.length,
            totalTasks,
            completedTasks,
            // Fixed percentage calculations
            reportSubmissionRate: this.calculatePercentage(usersWithReports.length, allUsers.length),
            reportCompletionRate: this.calculatePercentage(usersWithCompletedReports.length, usersWithReports.length),
            taskCompletionRate: officeTaskCompletionRate, // Backend calculated
            topIncompleteReasons,
          },
        };
      });

      // Calculate ranking distribution for offices
      const officeCompletionRates = officesStats.map(office => office.stats.taskCompletionRate);
      const officeRankingDistribution = this.calculateRankingDistribution(officeCompletionRates);

      // Calculate overall average weighted by number of users in each office
      const totalUsers = officesStats.reduce((sum, office) => sum + office.stats.totalUsers, 0);
      const weightedCompletionSum = officesStats.reduce((sum, office) => {
        return sum + (office.stats.taskCompletionRate * office.stats.totalUsers);
      }, 0);
      const overallAverageCompletionRate = totalUsers > 0 ? Math.round(weightedCompletionSum / totalUsers) : 0;

      return {
        weekNumber: targetWeek,
        year: targetYear,
        offices: officesStats,
        summary: {
          totalOffices: sortedOffices.length,
          totalDepartments: officesStats.reduce((sum, office) => sum + office.stats.totalDepartments, 0),
          totalUsers: officesStats.reduce((sum, office) => sum + office.stats.totalUsers, 0),
          totalUsersWithReports: officesStats.reduce((sum, office) => sum + office.stats.usersWithReports, 0),
          totalUsersWithCompletedReports: officesStats.reduce((sum, office) => sum + office.stats.usersWithCompletedReports, 0),
          totalUsersWithoutReports: officesStats.reduce((sum, office) => sum + office.stats.usersWithoutReports, 0),
          // Use weighted average for more accurate overall performance
          averageSubmissionRate: this.calculatePercentage(
            officesStats.reduce((sum, office) => sum + office.stats.usersWithReports, 0),
            officesStats.reduce((sum, office) => sum + office.stats.totalUsers, 0)
          ),
          averageCompletionRate: overallAverageCompletionRate, // Weighted average from backend
          rankingDistribution: officeRankingDistribution, // Add ranking distribution
        },
      };
    } catch (error) {
      this.logger.error('Error in getOfficesOverview:', error);
      throw error;
    }
  }

  async getOfficeDetails(
    officeId: string,
    currentUser: any,
    weekNumber?: number,
    year?: number,
  ) {
    // Check access permissions
    if (!this.canAccessOffice(currentUser, officeId)) {
      throw new ForbiddenException('Access denied to this office');
    }

    const { weekNumber: currentWeek, year: currentYear } = getCurrentWeek();
    const targetWeek = weekNumber || currentWeek;
    const targetYear = year || currentYear;

    try {
      const office = await this.prisma.office.findUnique({
        where: { id: officeId },
        include: {
          departments: {
            include: {
              jobPositions: {
                include: {
                  position: true,
                  users: {
                    where: { isActive: true },
                    include: {
                      reports: {
                        where: {
                          weekNumber: targetWeek,
                          year: targetYear,
                        },
                        include: {
                          tasks: {
                            select: {
                              taskName: true,
                              isCompleted: true,
                              reasonNotDone: true,
                            },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
            orderBy: { name: 'asc' },
          },
        },
      });

      if (!office) {
        throw new NotFoundException('Office not found');
      }

      const sortedDepartments = this.sortDepartments(office.departments);

      const departmentStats = sortedDepartments.map((department) => {
        const allUsers = department.jobPositions.flatMap((jp) => jp.users);
        
        const usersWithReports = allUsers.filter(
          (user) => user.reports.length > 0,
        );
        
        const usersWithCompletedReports = usersWithReports.filter((user) =>
          user.reports.some((report) => report.isCompleted),
        );

        // Calculate task completion for this department
        const totalTasks = usersWithReports.reduce(
          (sum, user) =>
            sum +
            user.reports.reduce(
              (taskSum, report) => taskSum + report.tasks.length,
              0,
            ),
          0,
        );

        const completedTasks = usersWithReports.reduce(
          (sum, user) =>
            sum +
            user.reports.reduce(
              (taskSum, report) =>
                taskSum + report.tasks.filter((task) => task.isCompleted).length,
              0,
            ),
          0,
        );

        // Calculate department task completion rate from all users
        const departmentTaskCompletionRate = this.calculatePercentage(completedTasks, totalTasks);

        const jobPositionsBreakdown = department.jobPositions.map((jp) => {
          const jpUsers = jp.users;
          const jpUsersWithReports = jpUsers.filter(
            (user) => user.reports.length > 0,
          );
          const jpUsersWithCompletedReports = jpUsersWithReports.filter((user) =>
            user.reports.some((report) => report.isCompleted),
          );

          return {
            id: jp.id,
            jobName: jp.jobName,
            positionName: jp.position.name,
            totalUsers: jpUsers.length,
            usersWithReports: jpUsersWithReports.length,
            usersWithCompletedReports: jpUsersWithCompletedReports.length,
            usersWithoutReports: jpUsers.length - jpUsersWithReports.length,
          };
        });

        // Get top incomplete reasons
        const incompleteReasons = new Map<string, number>();
        usersWithReports.forEach((user) => {
          user.reports.forEach((report) => {
            report.tasks
              .filter((task) => !task.isCompleted)
              .forEach((task) => {
                const reason = task.reasonNotDone?.trim() || 'Không có lý do';
                incompleteReasons.set(reason, (incompleteReasons.get(reason) || 0) + 1);
              });
          });
        });

        const topIncompleteReasons = Array.from(incompleteReasons.entries())
          .map(([reason, count]) => ({ reason, count }))
          .sort((a, b) => b.count - a.count)
          .slice(0, 5);

        return {
          id: department.id,
          name: department.name,
          description: department.description,
          stats: {
            totalUsers: allUsers.length,
            usersWithReports: usersWithReports.length,
            usersWithCompletedReports: usersWithCompletedReports.length,
            usersWithoutReports: allUsers.length - usersWithReports.length,
            totalTasks,
            completedTasks,
            reportSubmissionRate: this.calculatePercentage(usersWithReports.length, allUsers.length),
            reportCompletionRate: this.calculatePercentage(usersWithCompletedReports.length, usersWithReports.length),
            taskCompletionRate: departmentTaskCompletionRate, // Backend calculated from all users
            topIncompleteReasons,
          },
          jobPositionsBreakdown,
        };
      });

      // Calculate ranking distribution for departments
      const departmentCompletionRates = departmentStats.map(dept => dept.stats.taskCompletionRate);
      const departmentRankingDistribution = this.calculateRankingDistribution(departmentCompletionRates);

      // Calculate office average weighted by department sizes
      const totalUsers = departmentStats.reduce((sum, dept) => sum + dept.stats.totalUsers, 0);
      const weightedCompletionSum = departmentStats.reduce((sum, dept) => {
        return sum + (dept.stats.taskCompletionRate * dept.stats.totalUsers);
      }, 0);
      const officeAverageCompletionRate = totalUsers > 0 ? Math.round(weightedCompletionSum / totalUsers) : 0;

      return {
        office: {
          id: office.id,
          name: office.name,
          type: office.type,
          description: office.description,
        },
        weekNumber: targetWeek,
        year: targetYear,
        departments: departmentStats,
        summary: {
          totalDepartments: departmentStats.length,
          totalUsers: departmentStats.reduce((sum, dept) => sum + dept.stats.totalUsers, 0),
          totalUsersWithReports: departmentStats.reduce((sum, dept) => sum + dept.stats.usersWithReports, 0),
          totalUsersWithCompletedReports: departmentStats.reduce((sum, dept) => sum + dept.stats.usersWithCompletedReports, 0),
          totalUsersWithoutReports: departmentStats.reduce((sum, dept) => sum + dept.stats.usersWithoutReports, 0),
          averageSubmissionRate: this.calculatePercentage(
            departmentStats.reduce((sum, dept) => sum + dept.stats.usersWithReports, 0),
            departmentStats.reduce((sum, dept) => sum + dept.stats.totalUsers, 0)
          ),
          averageCompletionRate: officeAverageCompletionRate, // Weighted average from backend
          rankingDistribution: departmentRankingDistribution, // Add ranking distribution
        },
      };
    } catch (error) {
      this.logger.error('Error in getOfficeDetails:', error);
      throw error;
    }
  }

  async getDepartmentDetails(
    departmentId: string,
    currentUser: any,
    weekNumber?: number,
    year?: number,
  ) {
    // Check access permissions
    if (!await this.canAccessDepartment(currentUser, departmentId)) {
      throw new ForbiddenException('Access denied to this department');
    }

    const { weekNumber: currentWeek, year: currentYear } = getCurrentWeek();
    const targetWeek = weekNumber || currentWeek;
    const targetYear = year || currentYear;

    const department = await this.prisma.department.findUnique({
      where: { id: departmentId },
      include: {
        office: true,
        jobPositions: {
          include: {
            position: true,
            users: {
              where: { isActive: true },
              include: {
                jobPosition: {
                  include: {
                    position: true,
                  },
                },
                reports: {
                  where: {
                    weekNumber: targetWeek,
                    year: targetYear,
                  },
                  include: {
                    tasks: {
                      select: {
                        taskName: true,
                        isCompleted: true,
                        reasonNotDone: true,
                        monday: true,
                        tuesday: true,
                        wednesday: true,
                        thursday: true,
                        friday: true,
                        saturday: true,
                        sunday: true,
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!department) {
      throw new NotFoundException('Department not found');
    }

    const allUsers = department.jobPositions.flatMap((jp) => jp.users);

    const userStats = allUsers.map((user) => {
      const userReport = user.reports[0];
      const totalTasks = userReport?.tasks.length || 0;
      const completedTasks = userReport?.tasks.filter((task) => task.isCompleted).length || 0;

      // Calculate work days
      const workDays = userReport?.tasks.reduce((maxDays, task) => {
        const taskDays = [
          task.monday, task.tuesday, task.wednesday, task.thursday,
          task.friday, task.saturday, task.sunday
        ].filter(Boolean).length;
        return Math.max(maxDays, taskDays);
      }, 0) || 0;

      const incompleteReasons = userReport?.tasks
        .filter((task) => !task.isCompleted)
        .map((task) => ({
          taskName: task.taskName,
          reason: task.reasonNotDone?.trim() || 'Không có lý do',
        })) || [];

      // Backend calculated task completion rate for individual user
      const userTaskCompletionRate = this.calculatePercentage(completedTasks, totalTasks);

      return {
        id: user.id,
        employeeCode: user.employeeCode,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        jobPosition: {
          id: user.jobPosition.id,
          jobName: user.jobPosition.jobName,
          positionName: user.jobPosition.position.name,
        },
        reportStatus: {
          hasReport: !!userReport,
          isCompleted: userReport?.isCompleted || false,
          isLocked: userReport?.isLocked || false,
          totalTasks,
          completedTasks,
          workDaysCount: workDays,
          taskCompletionRate: userTaskCompletionRate, // Backend calculated
          incompleteReasons,
        },
      };
    });

    // Calculate ranking distribution for users
    const userCompletionRates = userStats
      .filter(user => user.reportStatus.hasReport)
      .map(user => user.reportStatus.taskCompletionRate);
    const userRankingDistribution = this.calculateRankingDistribution(userCompletionRates);

    // Calculate department average from actual user completion rates
    const usersWithReports = userStats.filter(user => user.reportStatus.hasReport);
    const departmentAverageTaskCompletion = usersWithReports.length > 0
      ? Math.round(usersWithReports.reduce((sum, user) => sum + user.reportStatus.taskCompletionRate, 0) / usersWithReports.length)
      : 0;

    return {
      department: {
        id: department.id,
        name: department.name,
        description: department.description,
        office: {
          id: department.office.id,
          name: department.office.name,
          type: department.office.type,
        },
      },
      weekNumber: targetWeek,
      year: targetYear,
      users: userStats,
      summary: {
        totalUsers: userStats.length,
        usersWithReports: userStats.filter((user) => user.reportStatus.hasReport).length,
        completedReports: userStats.filter((user) => user.reportStatus.isCompleted).length,
        averageTaskCompletion: departmentAverageTaskCompletion, // Backend calculated average
        rankingDistribution: userRankingDistribution, // Add ranking distribution
      },
    };
  }

  async getUserDetails(
    userId: string,
    currentUser: any,
    weekNumber?: number,
    year?: number,
    limit = 10,
  ) {
    // Check access permissions
    if (!await this.canAccessUser(currentUser, userId)) {
      throw new ForbiddenException('Access denied to this user');
    }

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

    // Get user's reports
    const reportsWhere: any = { userId };
    if (weekNumber && year) {
      reportsWhere.weekNumber = weekNumber;
      reportsWhere.year = year;
    }

    const reports = await this.prisma.report.findMany({
      where: reportsWhere,
      include: {
        tasks: {
          select: {
            id: true,
            taskName: true,
            isCompleted: true,
            reasonNotDone: true,
            monday: true,
            tuesday: true,
            wednesday: true,
            thursday: true,
            friday: true,
            saturday: true,
            sunday: true,
          },
        },
      },
      orderBy: [{ year: 'desc' }, { weekNumber: 'desc' }],
      take: limit,
    });

    // Analyze reports
    const reportsAnalysis = reports.map((report) => {
      const totalTasks = report.tasks.length;
      const completedTasks = report.tasks.filter((task) => task.isCompleted).length;
      const incompleteTasks = report.tasks.filter((task) => !task.isCompleted);

      const tasksByDay = {
        monday: report.tasks.filter((task) => task.monday).length,
        tuesday: report.tasks.filter((task) => task.tuesday).length,
        wednesday: report.tasks.filter((task) => task.wednesday).length,
        thursday: report.tasks.filter((task) => task.thursday).length,
        friday: report.tasks.filter((task) => task.friday).length,
        saturday: report.tasks.filter((task) => task.saturday).length,
        sunday: report.tasks.filter((task) => task.sunday).length,
      };

      const incompleteReasonsMap = new Map<string, { count: number; tasks: string[] }>();
      incompleteTasks.forEach((task) => {
        const reason = task.reasonNotDone?.trim() || 'Không có lý do';
        if (!incompleteReasonsMap.has(reason)) {
          incompleteReasonsMap.set(reason, { count: 0, tasks: [] });
        }
        const reasonData = incompleteReasonsMap.get(reason)!;
        reasonData.count += 1;
        reasonData.tasks.push(task.taskName);
      });

      const incompleteReasons = Array.from(incompleteReasonsMap.entries())
        .map(([reason, data]) => ({ reason, count: data.count, tasks: data.tasks }))
        .sort((a, b) => b.count - a.count);

      return {
        id: report.id,
        weekNumber: report.weekNumber,
        year: report.year,
        isCompleted: report.isCompleted,
        isLocked: report.isLocked,
        createdAt: report.createdAt,
        updatedAt: report.updatedAt,
        stats: {
          totalTasks,
          completedTasks,
          incompleteTasks: incompleteTasks.length,
          // Fixed percentage calculation
          taskCompletionRate: this.calculatePercentage(completedTasks, totalTasks),
          tasksByDay,
          incompleteReasons,
        },
        tasks: report.tasks,
      };
    });

    // Overall user statistics
    const totalReports = reports.length;
    const completedReports = reports.filter((r) => r.isCompleted).length;
    const totalTasks = reports.reduce((sum, r) => sum + r.tasks.length, 0);
    const completedTasks = reports.reduce(
      (sum, r) => sum + r.tasks.filter((t) => t.isCompleted).length,
      0,
    );

    return {
      user: {
        id: user.id,
        employeeCode: user.employeeCode,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        role: user.role,
        isActive: user.isActive,
        office: {
          id: user.office.id,
          name: user.office.name,
          type: user.office.type,
        },
        jobPosition: {
          id: user.jobPosition.id,
          jobName: user.jobPosition.jobName,
          positionName: user.jobPosition.position.name,
          department: {
            id: user.jobPosition.department.id,
            name: user.jobPosition.department.name,
            office: {
              id: user.jobPosition.department.office.id,
              name: user.jobPosition.department.office.name,
            },
          },
        },
      },
      overallStats: {
        totalReports,
        completedReports,
        // Fixed percentage calculations
        reportCompletionRate: this.calculatePercentage(completedReports, totalReports),
        totalTasks,
        completedTasks,
        taskCompletionRate: this.calculatePercentage(completedTasks, totalTasks),
      },
      reports: reportsAnalysis,
    };
  }

  async getMyHierarchyView(
    currentUser: any,
    weekNumber?: number,
    year?: number,
  ) {
    const { weekNumber: currentWeek, year: currentYear } = getCurrentWeek();
    const targetWeek = weekNumber || currentWeek;
    const targetYear = year || currentYear;

    try {
      switch (currentUser.role) {
        case Role.SUPERADMIN:
        case Role.ADMIN:
          return this.getOfficesOverview(currentUser, targetWeek, targetYear);

        case Role.OFFICE_MANAGER: {
          if (!currentUser.officeId) {
            throw new ForbiddenException('Office ID not found for office manager');
          }
          return this.getOfficeDetails(currentUser.officeId, currentUser, targetWeek, targetYear);
        }

        case Role.OFFICE_ADMIN: {
          let departmentId = currentUser.jobPosition?.departmentId;
          
          if (!departmentId) {
            const userWithJobPosition = await this.prisma.user.findUnique({
              where: { id: currentUser.id },
              include: { 
                jobPosition: { 
                  select: { departmentId: true } 
                } 
              },
            });
            departmentId = userWithJobPosition?.jobPosition?.departmentId;
          }

          if (!departmentId) {
            throw new ForbiddenException('Department ID not found for office admin');
          }

          return this.getDepartmentDetails(departmentId, currentUser, targetWeek, targetYear);
        }

        case Role.USER:
          return this.getUserDetails(currentUser.id, currentUser, targetWeek, targetYear);

        default:
          throw new ForbiddenException('Invalid user role');
      }
    } catch (error) {
      this.logger.error('Error in getMyHierarchyView:', error);
      throw error;
    }
  }

  async getTaskCompletionTrends(
    currentUser: any,
    filters: {
      officeId?: string;
      departmentId?: string;
      weeks: number;
    },
  ) {
    const { weekNumber: currentWeek, year: currentYear } = getCurrentWeek();
    
    // Generate week ranges
    const weekRanges = [];
    for (let i = 0; i < filters.weeks; i++) {
      let week = currentWeek - i;
      let year = currentYear;
      
      if (week <= 0) {
        week = 52 + week; // Handle year transition
        year = currentYear - 1;
      }
      
      weekRanges.push({ weekNumber: week, year });
    }

    // Build where clause based on filters and permissions
    const whereClause: any = {
      OR: weekRanges.map(({ weekNumber, year }) => ({ weekNumber, year })),
    };

    // Apply role-based filtering with proper department ID access
    if (currentUser.role === Role.OFFICE_MANAGER) {
      whereClause.user = { officeId: currentUser.officeId };
    } else if (currentUser.role === Role.OFFICE_ADMIN) {
      const departmentId = currentUser.jobPosition?.departmentId || 
        (await this.getUserDepartmentId(currentUser.id));
      
      if (departmentId) {
        whereClause.user = {
          jobPosition: { departmentId },
        };
      }
    } else if (filters.officeId && [Role.ADMIN, Role.SUPERADMIN].includes(currentUser.role)) {
      whereClause.user = { officeId: filters.officeId };
    } else if (filters.departmentId && [Role.ADMIN, Role.SUPERADMIN, Role.OFFICE_MANAGER].includes(currentUser.role)) {
      whereClause.user = { jobPosition: { departmentId: filters.departmentId } };
    }

    const reports = await this.prisma.report.findMany({
      where: whereClause,
      include: {
        tasks: {
          select: {
            isCompleted: true,
          },
        },
      },
    });

    // Group by week and calculate stats
    const weeklyStats = weekRanges.map(({ weekNumber, year }) => {
      const weekReports = reports.filter(
        (r) => r.weekNumber === weekNumber && r.year === year,
      );

      const totalTasks = weekReports.reduce((sum, r) => sum + r.tasks.length, 0);
      const completedTasks = weekReports.reduce(
        (sum, r) => sum + r.tasks.filter((t) => t.isCompleted).length,
        0,
      );

      return {
        weekNumber,
        year,
        totalReports: weekReports.length,
        completedReports: weekReports.filter((r) => r.isCompleted).length,
        totalTasks,
        completedTasks,
        // Fixed percentage calculations
        taskCompletionRate: this.calculatePercentage(completedTasks, totalTasks),
        reportCompletionRate: this.calculatePercentage(
          weekReports.filter((r) => r.isCompleted).length,
          weekReports.length
        ),
      };
    }).reverse(); // Reverse to show chronological order

    return {
      filters,
      trends: weeklyStats,
      summary: {
        // Fixed summary calculations - use actual averages
        averageTaskCompletion: weeklyStats.length > 0
          ? Math.round(weeklyStats.reduce((sum, week) => sum + week.taskCompletionRate, 0) / weeklyStats.length)
          : 0,
        averageReportCompletion: weeklyStats.length > 0
          ? Math.round(weeklyStats.reduce((sum, week) => sum + week.reportCompletionRate, 0) / weeklyStats.length)
          : 0,
      },
    };
  }

  async getIncompleteReasonsHierarchy(
    currentUser: any,
    filters: {
      officeId?: string;
      departmentId?: string;
      weekNumber?: number;
      year?: number;
    },
  ) {
    const { weekNumber: currentWeek, year: currentYear } = getCurrentWeek();
    const targetWeek = filters.weekNumber || currentWeek;
    const targetYear = filters.year || currentYear;

    // Build where clause
    const whereClause: any = {
      weekNumber: targetWeek,
      year: targetYear,
    };

    // Apply role-based and filter-based restrictions with proper department ID access
    if (currentUser.role === Role.OFFICE_MANAGER) {
      whereClause.user = { officeId: currentUser.officeId };
    } else if (currentUser.role === Role.OFFICE_ADMIN) {
      const departmentId = currentUser.jobPosition?.departmentId || 
        (await this.getUserDepartmentId(currentUser.id));
      
      if (departmentId) {
        whereClause.user = {
          jobPosition: { departmentId },
        };
      }
    } else if (filters.officeId && [Role.ADMIN, Role.SUPERADMIN].includes(currentUser.role)) {
      whereClause.user = { officeId: filters.officeId };
    } else if (filters.departmentId && [Role.ADMIN, Role.SUPERADMIN, Role.OFFICE_MANAGER].includes(currentUser.role)) {
      whereClause.user = { jobPosition: { departmentId: filters.departmentId } };
    }

    const reports = await this.prisma.report.findMany({
      where: whereClause,
      include: {
        tasks: {
          where: { isCompleted: false },
          select: {
            taskName: true,
            reasonNotDone: true,
          },
        },
        user: {
          select: {
            employeeCode: true,
            firstName: true,
            lastName: true,
            jobPosition: {
              select: {
                jobName: true,
                department: {
                  select: {
                    name: true,
                    office: {
                      select: {
                        name: true,
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    });

    // Analyze incomplete reasons
    const reasonsMap = new Map<string, {
      count: number;
      users: Set<string>;
      tasks: Array<{
        taskName: string;
        userName: string;
        department: string;
        office: string;
      }>;
    }>();

    reports.forEach((report) => {
      report.tasks.forEach((task) => {
        const reason = task.reasonNotDone?.trim() || 'Không có lý do';
        const userName = `${report.user.firstName} ${report.user.lastName}`;
        const department = report.user.jobPosition?.department?.name || 'N/A';
        const office = report.user.jobPosition?.department?.office?.name || 'N/A';

        if (!reasonsMap.has(reason)) {
          reasonsMap.set(reason, {
            count: 0,
            users: new Set(),
            tasks: [],
          });
        }

        const reasonData = reasonsMap.get(reason)!;
        reasonData.count += 1;
        reasonData.users.add(report.user.employeeCode);
        
        if (reasonData.tasks.length < 10) { // Limit sample tasks
          reasonData.tasks.push({
            taskName: task.taskName,
            userName,
            department,
            office,
          });
        }
      });
    });

    const totalIncompleteTasks = Array.from(reasonsMap.values())
      .reduce((sum, data) => sum + data.count, 0);

    const reasonsAnalysis = Array.from(reasonsMap.entries())
      .map(([reason, data]) => ({
        reason,
        count: data.count,
        affectedUsers: data.users.size,
        // Fixed percentage calculation
        percentage: this.calculatePercentage(data.count, totalIncompleteTasks),
        sampleTasks: data.tasks,
      }))
      .sort((a, b) => b.count - a.count);

    return {
      weekNumber: targetWeek,
      year: targetYear,
      filters,
      totalIncompleteTasks,
      totalReports: reports.length,
      reasonsAnalysis,
      summary: {
        topReason: reasonsAnalysis[0]?.reason || 'N/A',
        mostAffectedUsers: reasonsAnalysis[0]?.affectedUsers || 0,
        diversityIndex: reasonsMap.size, // Number of different reasons
      },
    };
  }

  async getUserReportsForAdmin(
    userId: string,
    currentUser: any,
    filters: {
      page: number;
      limit: number;
      weekNumber?: number;
      year?: number;
    },
  ) {
    // Check access permissions
    if (!await this.canAccessUser(currentUser, userId)) {
      throw new ForbiddenException('Access denied to this user');
    }

    const { page, limit, weekNumber, year } = filters;
    const skip = (page - 1) * limit;

    // Build where clause
    const whereClause: any = { userId };
    if (weekNumber && year) {
      whereClause.weekNumber = weekNumber;
      whereClause.year = year;
    }

    // Get user info
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

    // Get reports with pagination
    const [reports, total] = await Promise.all([
      this.prisma.report.findMany({
        where: whereClause,
        include: {
          tasks: {
            select: {
              id: true,
              taskName: true,
              isCompleted: true,
              reasonNotDone: true,
              monday: true,
              tuesday: true,
              wednesday: true,
              thursday: true,
              friday: true,
              saturday: true,
              sunday: true,
            },
          },
        },
        orderBy: [{ year: 'desc' }, { weekNumber: 'desc' }],
        skip,
        take: limit,
      }),
      this.prisma.report.count({ where: whereClause }),
    ]);

    // Process reports to add statistics
    const processedReports = reports.map((report) => {
      const totalTasks = report.tasks.length;
      const completedTasks = report.tasks.filter((task) => task.isCompleted).length;
      const incompleteTasks = report.tasks.filter((task) => !task.isCompleted);

      // Get incomplete reasons for this report
      const incompleteReasons = new Map<string, number>();
      incompleteTasks.forEach((task) => {
        const reason = task.reasonNotDone?.trim() || 'Không có lý do';
        incompleteReasons.set(reason, (incompleteReasons.get(reason) || 0) + 1);
      });

      const topIncompleteReasons = Array.from(incompleteReasons.entries())
        .map(([reason, count]) => ({ reason, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 3);

      return {
        id: report.id,
        weekNumber: report.weekNumber,
        year: report.year,
        isCompleted: report.isCompleted,
        isLocked: report.isLocked,
        createdAt: report.createdAt,
        updatedAt: report.updatedAt,
        totalTasks,
        completedTasks,
        incompleteTasks: incompleteTasks.length,
        taskCompletionRate: this.calculatePercentage(completedTasks, totalTasks),
        incompleteReasons: topIncompleteReasons,
      };
    });

    // Calculate summary statistics
    const totalReports = await this.prisma.report.count({ where: { userId } });
    const completedReports = await this.prisma.report.count({
      where: { userId, isCompleted: true },
    });
    const totalTasks = await this.prisma.reportTask.count({
      where: {
        report: { userId },
      },
    });
    const completedTasksTotal = await this.prisma.reportTask.count({
      where: {
        report: { userId },
        isCompleted: true,
      },
    });

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
        jobPosition: user.jobPosition,
      },
      reports: processedReports,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
      summary: {
        totalReports,
        completedReports,
        reportCompletionRate: totalReports > 0 ? Math.round((completedReports / totalReports) * 100) : 0,
        totalTasks,
        completedTasks: completedTasksTotal,
        taskCompletionRate: totalTasks > 0 ? Math.round((completedTasksTotal / totalTasks) * 100) : 0,
      },
    };
  }

  async getReportDetailsForAdmin(
    userId: string,
    reportId: string,
    currentUser: any,
  ) {
    // Check access permissions
    if (!await this.canAccessUser(currentUser, userId)) {
      throw new ForbiddenException('Access denied to this user');
    }

    // Get user info
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

    // Get specific report
    const report = await this.prisma.report.findFirst({
      where: {
        id: reportId,
        userId,
      },
      include: {
        tasks: {
          select: {
            id: true,
            taskName: true,
            isCompleted: true,
            reasonNotDone: true,
            monday: true,
            tuesday: true,
            wednesday: true,
            thursday: true,
            friday: true,
            saturday: true,
            sunday: true,
            createdAt: true,
            updatedAt: true,
          },
          orderBy: {
            createdAt: 'asc',
          },
        },
      },
    });

    if (!report) {
      throw new NotFoundException('Report not found');
    }

    // Calculate statistics
    const totalTasks = report.tasks.length;
    const completedTasks = report.tasks.filter((task) => task.isCompleted).length;
    const incompleteTasks = report.tasks.filter((task) => !task.isCompleted);

    // Work days analysis
    const workDaysCount = Math.max(
      ...report.tasks.map((task) => {
        const days = [
          task.monday, task.tuesday, task.wednesday, task.thursday,
          task.friday, task.saturday, task.sunday
        ].filter(Boolean).length;
        return days;
      }),
      0
    );

    // Tasks by day statistics
    const tasksByDay = {
      monday: report.tasks.filter((task) => task.monday).length,
      tuesday: report.tasks.filter((task) => task.tuesday).length,
      wednesday: report.tasks.filter((task) => task.wednesday).length,
      thursday: report.tasks.filter((task) => task.thursday).length,
      friday: report.tasks.filter((task) => task.friday).length,
      saturday: report.tasks.filter((task) => task.saturday).length,
      sunday: report.tasks.filter((task) => task.sunday).length,
    };

    // Incomplete reasons analysis
    const incompleteReasonsMap = new Map<string, { count: number; tasks: string[] }>();
    incompleteTasks.forEach((task) => {
      const reason = task.reasonNotDone?.trim() || 'Không có lý do';
      if (!incompleteReasonsMap.has(reason)) {
        incompleteReasonsMap.set(reason, { count: 0, tasks: [] });
      }
      const reasonData = incompleteReasonsMap.get(reason)!;
      reasonData.count += 1;
      reasonData.tasks.push(task.taskName);
    });

    const incompleteReasons = Array.from(incompleteReasonsMap.entries())
      .map(([reason, data]) => ({
        reason,
        count: data.count,
        tasks: data.tasks,
      }))
      .sort((a, b) => b.count - a.count);

    return {
      user: {
        id: user.id,
        employeeCode: user.employeeCode,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        role: user.role,
        office: user.office,
        jobPosition: user.jobPosition,
      },
      report: {
        id: report.id,
        weekNumber: report.weekNumber,
        year: report.year,
        isCompleted: report.isCompleted,
        isLocked: report.isLocked,
        createdAt: report.createdAt,
        updatedAt: report.updatedAt,
        tasks: report.tasks,
      },
      stats: {
        totalTasks,
        completedTasks,
        incompleteTasks: incompleteTasks.length,
        taskCompletionRate: totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0,
        workDaysCount,
        tasksByDay,
        incompleteReasons,
      },
    };
  }

  async getEmployeesWithoutReports(
    currentUser: any,
    filters: {
      weekNumber?: number;
      year?: number;
      officeId?: string;
      departmentId?: string;
      page?: number;
      limit?: number;
    },
  ) {
    const { weekNumber: currentWeek, year: currentYear } = getCurrentWeek();
    const targetWeek = filters.weekNumber || currentWeek;
    const targetYear = filters.year || currentYear;
    const page = filters.page || 1;
    const limit = filters.limit || 20;
    const skip = (page - 1) * limit;

    // Build where clause based on user role and filters
    const userWhereClause: any = {
      isActive: true,
    };

    // Apply role-based filtering
    switch (currentUser.role) {
      case Role.OFFICE_MANAGER: {
        userWhereClause.officeId = currentUser.officeId;
        break;
      }
      
      case Role.OFFICE_ADMIN: {
        const departmentId = currentUser.jobPosition?.departmentId || 
          (await this.getUserDepartmentId(currentUser.id));
        if (departmentId) {
          userWhereClause.jobPosition = { departmentId };
        }
        break;
      }
      
      case Role.ADMIN:
      case Role.SUPERADMIN: {
        if (filters.officeId) {
          userWhereClause.officeId = filters.officeId;
        }
        if (filters.departmentId) {
          userWhereClause.jobPosition = { departmentId: filters.departmentId };
        }
        break;
      }
      
      default:
        throw new ForbiddenException('Insufficient permissions');
    }

    // Get all users that match the criteria
    const allUsers = await this.prisma.user.findMany({
      where: userWhereClause,
      include: {
        office: {
          select: {
            id: true,
            name: true,
            type: true,
          },
        },
        jobPosition: {
          include: {
            position: {
              select: {
                name: true,
              },
            },
            department: {
              include: {
                office: {
                  select: {
                    name: true,
                  },
                },
              },
            },
          },
        },
        reports: {
          where: {
            weekNumber: targetWeek,
            year: targetYear,
          },
          select: {
            id: true,
            isCompleted: true,
            createdAt: true,
          },
        },
      },
    });

    // Filter users who haven't submitted reports for the target week
    const usersWithoutReports = allUsers.filter(user => user.reports.length === 0);

    // Apply pagination
    const totalUsers = usersWithoutReports.length;
    const paginatedUsers = usersWithoutReports.slice(skip, skip + limit);

    // Format the response
    const employeesWithoutReports = paginatedUsers.map(user => ({
      id: user.id,
      employeeCode: user.employeeCode,
      firstName: user.firstName,
      lastName: user.lastName,
      fullName: `${user.firstName} ${user.lastName}`,
      email: user.email,
      phone: user.phone,
      role: user.role,
      office: {
        id: user.office.id,
        name: user.office.name,
        type: user.office.type,
      },
      jobPosition: {
        id: user.jobPosition.id,
        jobName: user.jobPosition.jobName,
        positionName: user.jobPosition.position.name,
        department: {
          id: user.jobPosition.department.id,
          name: user.jobPosition.department.name,
          office: {
            name: user.jobPosition.department.office.name,
          },
        },
      },
      lastReportDate: null, // No report for this week
      daysOverdue: this.calculateDaysOverdue(targetWeek, targetYear),
    }));

    // Get statistics
    const totalActiveUsers = allUsers.length;
    const usersWithReports = allUsers.filter(user => user.reports.length > 0).length;
    const submissionRate = totalActiveUsers > 0 
      ? Math.round((usersWithReports / totalActiveUsers) * 100) 
      : 0;

    // Group by department for summary
    const departmentSummary = new Map<string, {
      departmentName: string;
      officeName: string;
      totalUsers: number;
      usersWithoutReports: number;
    }>();

    usersWithoutReports.forEach(user => {
      const deptKey = user.jobPosition.department.id;
      if (!departmentSummary.has(deptKey)) {
        departmentSummary.set(deptKey, {
          departmentName: user.jobPosition.department.name,
          officeName: user.jobPosition.department.office.name,
          totalUsers: 0,
          usersWithoutReports: 0,
        });
      }
      departmentSummary.get(deptKey)!.usersWithoutReports += 1;
    });

    // Add total users count for each department
    allUsers.forEach(user => {
      const deptKey = user.jobPosition.department.id;
      if (departmentSummary.has(deptKey)) {
        departmentSummary.get(deptKey)!.totalUsers += 1;
      }
    });

    const departmentBreakdown = Array.from(departmentSummary.entries()).map(([deptId, data]) => ({
      departmentId: deptId,
      departmentName: data.departmentName,
      officeName: data.officeName,
      totalUsers: data.totalUsers,
      usersWithoutReports: data.usersWithoutReports,
      missingRate: Math.round((data.usersWithoutReports / data.totalUsers) * 100),
    }));

    return {
      weekNumber: targetWeek,
      year: targetYear,
      employees: employeesWithoutReports,
      pagination: {
        page,
        limit,
        total: totalUsers,
        totalPages: Math.ceil(totalUsers / limit),
      },
      summary: {
        totalActiveUsers,
        usersWithReports,
        usersWithoutReports: totalUsers,
        submissionRate,
        missingRate: 100 - submissionRate,
      },
      departmentBreakdown,
    };
  }

  async getEmployeesWithIncompleteReports(
    currentUser: any,
    filters: {
      weekNumber?: number;
      year?: number;
      officeId?: string;
      departmentId?: string;
      page?: number;
      limit?: number;
    },
  ) {
    const { weekNumber: currentWeek, year: currentYear } = getCurrentWeek();
    const targetWeek = filters.weekNumber || currentWeek;
    const targetYear = filters.year || currentYear;
    const page = filters.page || 1;
    const limit = filters.limit || 20;
    const skip = (page - 1) * limit;

    // Build where clause for reports
    const reportWhereClause: any = {
      weekNumber: targetWeek,
      year: targetYear,
      isCompleted: false, // Only incomplete reports
    };

    // Apply role-based filtering
    switch (currentUser.role) {
      case Role.OFFICE_MANAGER: {
        reportWhereClause.user = { officeId: currentUser.officeId };
        break;
      }
      
      case Role.OFFICE_ADMIN: {
        const departmentId = currentUser.jobPosition?.departmentId || 
          (await this.getUserDepartmentId(currentUser.id));
        if (departmentId) {
          reportWhereClause.user = { jobPosition: { departmentId } };
        }
        break;
      }
      
      case Role.ADMIN:
      case Role.SUPERADMIN: {
        if (filters.officeId) {
          reportWhereClause.user = { officeId: filters.officeId };
        }
        if (filters.departmentId) {
          reportWhereClause.user = { jobPosition: { departmentId: filters.departmentId } };
        }
        break;
      }
      
      default:
        throw new ForbiddenException('Insufficient permissions');
    }

    // Get total count
    const totalCount = await this.prisma.report.count({
      where: reportWhereClause,
    });

    // Get reports with user details
    const incompleteReports = await this.prisma.report.findMany({
      where: reportWhereClause,
      include: {
        user: {
          include: {
            office: {
              select: {
                id: true,
                name: true,
                type: true,
              },
            },
            jobPosition: {
              include: {
                position: {
                  select: {
                    name: true,
                  },
                },
                department: {
                  include: {
                    office: {
                      select: {
                        name: true,
                      },
                    },
                  },
                },
              },
            },
          },
        },
        tasks: {
          select: {
            taskName: true,
            isCompleted: true,
            reasonNotDone: true,
          },
        },
      },
      orderBy: {
        createdAt: 'asc',
      },
      skip,
      take: limit,
    });

    // Format the response
    const employeesWithIncompleteReports = incompleteReports.map(report => {
      const totalTasks = report.tasks.length;
      const completedTasks = report.tasks.filter(task => task.isCompleted).length;
      const incompleteTasks = report.tasks.filter(task => !task.isCompleted);

      // Analyze incomplete reasons
      const reasonsMap = new Map<string, number>();
      incompleteTasks.forEach(task => {
        const reason = task.reasonNotDone?.trim() || 'Không có lý do';
        reasonsMap.set(reason, (reasonsMap.get(reason) || 0) + 1);
      });

      const topReasons = Array.from(reasonsMap.entries())
        .map(([reason, count]) => ({ reason, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 3);

      return {
        reportId: report.id,
        employee: {
          id: report.user.id,
          employeeCode: report.user.employeeCode,
          firstName: report.user.firstName,
          lastName: report.user.lastName,
          fullName: `${report.user.firstName} ${report.user.lastName}`,
          email: report.user.email,
          phone: report.user.phone,
          role: report.user.role,
          office: report.user.office,
          jobPosition: {
            id: report.user.jobPosition.id,
            jobName: report.user.jobPosition.jobName,
            positionName: report.user.jobPosition.position.name,
            department: {
              id: report.user.jobPosition.department.id,
              name: report.user.jobPosition.department.name,
              office: {
                name: report.user.jobPosition.department.office.name,
              },
            },
          },
        },
        reportDetails: {
          createdAt: report.createdAt,
          updatedAt: report.updatedAt,
          isLocked: report.isLocked,
          totalTasks,
          completedTasks,
          incompleteTasks: incompleteTasks.length,
          completionRate: totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0,
          topIncompleteReasons: topReasons,
        },
        daysOverdue: this.calculateDaysOverdue(targetWeek, targetYear),
      };
    });

    return {
      weekNumber: targetWeek,
      year: targetYear,
      employees: employeesWithIncompleteReports,
      pagination: {
        page,
        limit,
        total: totalCount,
        totalPages: Math.ceil(totalCount / limit),
      },
      summary: {
        totalIncompleteReports: totalCount,
      },
    };
  }

  async getEmployeesReportingStatus(
    currentUser: any,
    filters: {
      weekNumber?: number;
      year?: number;
      officeId?: string;
      departmentId?: string;
      status?: 'not_submitted' | 'incomplete' | 'completed' | 'all';
      page?: number;
      limit?: number;
    },
  ) {
    const { weekNumber: currentWeek, year: currentYear } = getCurrentWeek();
    const targetWeek = filters.weekNumber || currentWeek;
    const targetYear = filters.year || currentYear;
    const page = filters.page || 1;
    const limit = filters.limit || 20;
    const skip = (page - 1) * limit;

    // Build user where clause based on role and filters
    const userWhereClause: any = {
      isActive: true,
    };

    // Apply role-based filtering
    switch (currentUser.role) {
      case Role.OFFICE_MANAGER: {
        userWhereClause.officeId = currentUser.officeId;
        break;
      }
      
      case Role.OFFICE_ADMIN: {
        const departmentId = currentUser.jobPosition?.departmentId || 
          (await this.getUserDepartmentId(currentUser.id));
        if (departmentId) {
          userWhereClause.jobPosition = { departmentId };
        }
        break;
      }
      
      case Role.ADMIN:
      case Role.SUPERADMIN: {
        if (filters.officeId) {
          userWhereClause.officeId = filters.officeId;
        }
        if (filters.departmentId) {
          userWhereClause.jobPosition = { departmentId: filters.departmentId };
        }
        break;
      }
      
      default:
        throw new ForbiddenException('Insufficient permissions');
    }

    // Get all users
    const allUsers = await this.prisma.user.findMany({
      where: userWhereClause,
      include: {
        office: {
          select: {
            id: true,
            name: true,
            type: true,
          },
        },
        jobPosition: {
          include: {
            position: {
              select: {
                name: true,
              },
            },
            department: {
              include: {
                office: {
                  select: {
                    id: true,
                    name: true,
                  },
                },
              },
            },
          },
        },
        reports: {
          where: {
            weekNumber: targetWeek,
            year: targetYear,
          },
          include: {
            tasks: {
              select: {
                isCompleted: true,
                reasonNotDone: true,
              },
            },
          },
        },
      },
    });

    // Categorize users by status
    const categorizedUsers = allUsers.map(user => {
      const report = user.reports[0];
      let status: 'not_submitted' | 'incomplete' | 'completed';
      let reportDetails = null;

      if (!report) {
        status = 'not_submitted';
      } else if (report.isCompleted) {
        status = 'completed';
        reportDetails = {
          reportId: report.id,
          createdAt: report.createdAt,
          updatedAt: report.updatedAt,
          totalTasks: report.tasks.length,
          completedTasks: report.tasks.filter(task => task.isCompleted).length,
        };
      } else {
        status = 'incomplete';
        const totalTasks = report.tasks.length;
        const completedTasks = report.tasks.filter(task => task.isCompleted).length;
        
        reportDetails = {
          reportId: report.id,
          createdAt: report.createdAt,
          updatedAt: report.updatedAt,
          totalTasks,
          completedTasks,
          incompleteTasks: totalTasks - completedTasks,
          completionRate: totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0,
        };
      }

      return {
        id: user.id,
        employeeCode: user.employeeCode,
        firstName: user.firstName,
        lastName: user.lastName,
        fullName: `${user.firstName} ${user.lastName}`,
        email: user.email,
        phone: user.phone,
        role: user.role,
        office: user.office,
        jobPosition: {
          id: user.jobPosition.id,
          jobName: user.jobPosition.jobName,
          positionName: user.jobPosition.position.name,
          department: {
            id: user.jobPosition.department.id,
            name: user.jobPosition.department.name,
            office: {
              id: user.jobPosition.department.office.id,
              name: user.jobPosition.department.office.name,
            },
          },
        },
        status,
        reportDetails,
        daysOverdue: status === 'not_submitted' 
          ? this.calculateDaysOverdue(targetWeek, targetYear) 
          : null,
      };
    });

    // Filter by status if specified
    let filteredUsers = categorizedUsers;
    if (filters.status && filters.status !== 'all') {
      filteredUsers = categorizedUsers.filter(user => user.status === filters.status);
    }

    // Apply pagination
    const totalUsers = filteredUsers.length;
    const paginatedUsers = filteredUsers.slice(skip, skip + limit);

    // Calculate summary statistics
    const notSubmittedCount = categorizedUsers.filter(u => u.status === 'not_submitted').length;
    const incompleteCount = categorizedUsers.filter(u => u.status === 'incomplete').length;
    const completedCount = categorizedUsers.filter(u => u.status === 'completed').length;

    return {
      weekNumber: targetWeek,
      year: targetYear,
      employees: paginatedUsers,
      pagination: {
        page,
        limit,
        total: totalUsers,
        totalPages: Math.ceil(totalUsers / limit),
      },
      summary: {
        totalEmployees: allUsers.length,
        notSubmitted: notSubmittedCount,
        incomplete: incompleteCount,
        completed: completedCount,
        submissionRate: Math.round(((incompleteCount + completedCount) / allUsers.length) * 100),
        completionRate: Math.round((completedCount / allUsers.length) * 100),
      },
      filters: {
        ...filters,
        weekNumber: targetWeek,
        year: targetYear,
      },
    };
  }

  // Helper methods for access control and sorting remain the same
  private canAccessOffice(user: any, officeId: string): boolean {
    switch (user.role) {
      case Role.SUPERADMIN:
      case Role.ADMIN:
        return true;
      case Role.OFFICE_MANAGER:
        return user.officeId === officeId;
      default:
        return false;
    }
  }

  private async canAccessDepartment(user: any, departmentId: string): Promise<boolean> {
    try {
      switch (user.role) {
        case Role.SUPERADMIN:
        case Role.ADMIN:
          return true;
        
        case Role.OFFICE_MANAGER: {
          const department = await this.prisma.department.findUnique({
            where: { id: departmentId },
            select: { officeId: true },
          });
          return department?.officeId === user.officeId;
        }
        
        case Role.OFFICE_ADMIN: {
          let userDepartmentId = user.jobPosition?.departmentId;
          
          if (!userDepartmentId) {
            userDepartmentId = await this.getUserDepartmentId(user.id);
          }
          
          return userDepartmentId === departmentId;
        }
        
        default:
          return false;
      }
    } catch (error) {
      this.logger.error('Error in canAccessDepartment:', error);
      return false;
    }
  }

  private async canAccessUser(currentUser: any, userId: string): Promise<boolean> {
    try {
      switch (currentUser.role) {
        case Role.SUPERADMIN:
        case Role.ADMIN:
          return true;
        
        case Role.OFFICE_MANAGER: {
          const userOffice = await this.prisma.user.findUnique({
            where: { id: userId },
            select: { officeId: true },
          });
          return userOffice?.officeId === currentUser.officeId;
        }
        
        case Role.OFFICE_ADMIN: {
          let currentUserDepartmentId = currentUser.jobPosition?.departmentId;
          
          if (!currentUserDepartmentId) {
            currentUserDepartmentId = await this.getUserDepartmentId(currentUser.id);
          }
          
          if (!currentUserDepartmentId) {
            return false;
          }
          
          const targetUserDept = await this.prisma.user.findUnique({
            where: { id: userId },
            include: { jobPosition: { select: { departmentId: true } } },
          });
          
          return targetUserDept?.jobPosition?.departmentId === currentUserDepartmentId;
        }
        
        default:
          return currentUser.id === userId; // Users can only access themselves
      }
    } catch (error) {
      this.logger.error('Error in canAccessUser:', error);
      return false;
    }
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

  private calculateDaysOverdue(weekNumber: number, year: number): number {
    return calculateDaysOverdue(weekNumber, year);
  }

  private sortOffices(offices: any[]) {
    return offices.sort((a, b) => {
      const getPriority = (officeName: string) => {
        const name = officeName.toLowerCase().trim();
        if (name.includes('vpđh') || name.includes('th') || name === 'vpđh th') return 1;
        if (name.includes('ts1') || name.includes('nhà máy ts1')) return 2;
        if (name.includes('ts2') || name.includes('nhà máy ts2')) return 3;
        if (name.includes('ts3') || name.includes('nhà máy ts3')) return 4;
        return 999;
      };
      
      const priorityA = getPriority(a.name);
      const priorityB = getPriority(b.name);
      
      if (priorityA !== priorityB) {
        return priorityA - priorityB;
      }
      
      return a.name.localeCompare(b.name, 'vi', { numeric: true });
    });
  }

  private sortDepartments(departments: any[]) {
    return departments.sort((a, b) => {
      return a.name.localeCompare(b.name, 'vi', { numeric: true });
    });
  }
}

import {
  Injectable,
  ForbiddenException,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { Role } from '@prisma/client';

// Add the getCurrentWeek utility function if it doesn't exist
function getCurrentWeek(): { weekNumber: number; year: number } {
  const now = new Date();
  const year = now.getFullYear();
  
  // Get first day of year
  const firstDayOfYear = new Date(year, 0, 1);
  
  // Calculate days since first day of year
  const daysSinceFirstDay = Math.floor((now.getTime() - firstDayOfYear.getTime()) / (24 * 60 * 60 * 1000));
  
  // Calculate week number (ISO week date)
  const weekNumber = Math.ceil((daysSinceFirstDay + firstDayOfYear.getDay() + 1) / 7);
  
  return { weekNumber, year };
}

@Injectable()
export class HierarchyReportsService {
  private readonly logger = new Logger(HierarchyReportsService.name);

  constructor(private prisma: PrismaService) {}

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
        orderBy: { name: 'asc' },
      });

      const officesStats = offices.map((office) => {
        const allUsers = office.departments.flatMap((dept) =>
          dept.jobPositions.flatMap((jp) => jp.users),
        );

        const usersWithReports = allUsers.filter(
          (user) => user.reports.length > 0,
        );

        const completedReports = usersWithReports.filter((user) =>
          user.reports.some((report) => report.isCompleted),
        ).length;

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
          id: office.id,
          name: office.name,
          type: office.type,
          description: office.description,
          stats: {
            totalDepartments: office._count.departments,
            totalUsers: allUsers.length,
            usersWithReports: usersWithReports.length,
            completedReports,
            totalTasks,
            completedTasks,
            reportSubmissionRate:
              allUsers.length > 0
                ? Math.round((usersWithReports.length / allUsers.length) * 100)
                : 0,
            reportCompletionRate:
              usersWithReports.length > 0
                ? Math.round((completedReports / usersWithReports.length) * 100)
                : 0,
            taskCompletionRate:
              totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0,
            topIncompleteReasons,
          },
        };
      });

      return {
        weekNumber: targetWeek,
        year: targetYear,
        offices: officesStats,
        summary: {
          totalOffices: offices.length,
          totalDepartments: officesStats.reduce(
            (sum, office) => sum + office.stats.totalDepartments,
            0,
          ),
          totalUsers: officesStats.reduce(
            (sum, office) => sum + office.stats.totalUsers,
            0,
          ),
          totalReportsSubmitted: officesStats.reduce(
            (sum, office) => sum + office.stats.usersWithReports,
            0,
          ),
          averageSubmissionRate: officesStats.length > 0
            ? Math.round(
                officesStats.reduce(
                  (sum, office) => sum + office.stats.reportSubmissionRate,
                  0,
                ) / officesStats.length,
              )
            : 0,
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

      const departmentStats = office.departments.map((department) => {
        const allUsers = department.jobPositions.flatMap((jp) => jp.users);
        const usersWithReports = allUsers.filter(
          (user) => user.reports.length > 0,
        );
        const completedReports = usersWithReports.filter((user) =>
          user.reports.some((report) => report.isCompleted),
        ).length;

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

        const jobPositionsBreakdown = department.jobPositions.map((jp) => {
          const jpUsers = jp.users;
          const jpUsersWithReports = jpUsers.filter(
            (user) => user.reports.length > 0,
          );

          return {
            id: jp.id,
            jobName: jp.jobName,
            positionName: jp.position.name,
            totalUsers: jpUsers.length,
            usersWithReports: jpUsersWithReports.length,
            completedReports: jpUsersWithReports.filter((user) =>
              user.reports.some((report) => report.isCompleted),
            ).length,
          };
        });

        const incompleteReasons = new Map<string, { count: number; tasks: string[] }>();
        usersWithReports.forEach((user) => {
          user.reports.forEach((report) => {
            report.tasks
              .filter((task) => !task.isCompleted)
              .forEach((task) => {
                const reason = task.reasonNotDone?.trim() || 'Không có lý do';
                if (!incompleteReasons.has(reason)) {
                  incompleteReasons.set(reason, { count: 0, tasks: [] });
                }
                const reasonData = incompleteReasons.get(reason)!;
                reasonData.count += 1;
                if (reasonData.tasks.length < 3) {
                  reasonData.tasks.push(task.taskName);
                }
              });
          });
        });

        const topIncompleteReasons = Array.from(incompleteReasons.entries())
          .map(([reason, data]) => ({ reason, count: data.count, sampleTasks: data.tasks }))
          .sort((a, b) => b.count - a.count)
          .slice(0, 5);

        return {
          id: department.id,
          name: department.name,
          description: department.description,
          stats: {
            totalUsers: allUsers.length,
            usersWithReports: usersWithReports.length,
            completedReports,
            totalTasks,
            completedTasks,
            reportSubmissionRate:
              allUsers.length > 0
                ? Math.round((usersWithReports.length / allUsers.length) * 100)
                : 0,
            taskCompletionRate:
              totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0,
            topIncompleteReasons,
          },
          jobPositionsBreakdown,
        };
      });

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
          totalUsers: departmentStats.reduce(
            (sum, dept) => sum + dept.stats.totalUsers,
            0,
          ),
          totalReportsSubmitted: departmentStats.reduce(
            (sum, dept) => sum + dept.stats.usersWithReports,
            0,
          ),
          averageSubmissionRate: departmentStats.length > 0
            ? Math.round(
                departmentStats.reduce(
                  (sum, dept) => sum + dept.stats.reportSubmissionRate,
                  0,
                ) / departmentStats.length,
              )
            : 0,
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
      const workDays = userReport?.tasks.reduce((days, task) => {
        const taskDays = [
          task.monday, task.tuesday, task.wednesday, task.thursday,
          task.friday, task.saturday, task.sunday
        ].filter(Boolean).length;
        return Math.max(days, taskDays);
      }, 0) || 0;

      // Get incomplete reasons for this user
      const incompleteReasons = userReport?.tasks
        .filter((task) => !task.isCompleted)
        .map((task) => ({
          taskName: task.taskName,
          reason: task.reasonNotDone?.trim() || 'Không có lý do',
        })) || [];

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
          taskCompletionRate: totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0,
          incompleteReasons,
        },
      };
    });

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
        averageTaskCompletion: Math.round(
          userStats.reduce((sum, user) => sum + user.reportStatus.taskCompletionRate, 0) /
          (userStats.length || 1),
        ),
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
          taskCompletionRate: totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0,
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
        reportCompletionRate: totalReports > 0 ? Math.round((completedReports / totalReports) * 100) : 0,
        totalTasks,
        completedTasks,
        taskCompletionRate: totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0,
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
          // Get department ID from jobPosition
          let departmentId = currentUser.jobPosition?.departmentId;
          
          if (!departmentId) {
            // Fallback: fetch user with jobPosition relation
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
        taskCompletionRate: totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0,
        reportCompletionRate: weekReports.length > 0 
          ? Math.round((weekReports.filter((r) => r.isCompleted).length / weekReports.length) * 100) 
          : 0,
      };
    }).reverse(); // Reverse to show chronological order

    return {
      filters,
      trends: weeklyStats,
      summary: {
        averageTaskCompletion: Math.round(
          weeklyStats.reduce((sum, week) => sum + week.taskCompletionRate, 0) / weeklyStats.length,
        ),
        averageReportCompletion: Math.round(
          weeklyStats.reduce((sum, week) => sum + week.reportCompletionRate, 0) / weeklyStats.length,
        ),
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
        percentage: totalIncompleteTasks > 0 
          ? Math.round((data.count / totalIncompleteTasks) * 100) 
          : 0,
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

  // Helper method to get user's department ID
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

  // Helper methods for access control
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
          // Check if department belongs to user's office
          const department = await this.prisma.department.findUnique({
            where: { id: departmentId },
            select: { officeId: true },
          });
          return department?.officeId === user.officeId;
        }
        case Role.OFFICE_ADMIN: {
          // Handle both cases: jobPosition object or just jobPositionId
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
          // Check if user belongs to same office
          const userOffice = await this.prisma.user.findUnique({
            where: { id: userId },
            select: { officeId: true },
          });
          return userOffice?.officeId === currentUser.officeId;
        }
        case Role.OFFICE_ADMIN: {
          // Get current user's department ID
          let currentUserDepartmentId = currentUser.jobPosition?.departmentId;
          
          if (!currentUserDepartmentId) {
            currentUserDepartmentId = await this.getUserDepartmentId(currentUser.id);
          }
          
          if (!currentUserDepartmentId) {
            return false;
          }
          
          // Check if target user belongs to same department
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
        taskCompletionRate: totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0,
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
        totalTasks: totalTasks,
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
}

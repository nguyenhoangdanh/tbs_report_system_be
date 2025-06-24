import { Injectable } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { getCurrentWeek } from '../common/utils/date.utils';

@Injectable()
export class StatisticsService {
  constructor(private prisma: PrismaService) {}

  async getDashboardStats(userId: string) {
    const { weekNumber, year } = getCurrentWeek();

    // Check if user has current week report
    const currentWeekReport = await this.prisma.report.findUnique({
      where: {
        weekNumber_year_userId: {
          weekNumber,
          year,
          userId,
        },
      },
    });

    // Get total reports count
    const totalReports = await this.prisma.report.count({
      where: { userId },
    });

    // Get completed reports count
    const completedReports = await this.prisma.report.count({
      where: {
        userId,
        isCompleted: true,
      },
    });

    // Calculate completion rate
    const completionRate =
      totalReports > 0
        ? Math.round((completedReports / totalReports) * 100)
        : 0;

    // Get this month's reports
    const currentDate = new Date();
    const startOfMonth = new Date(
      currentDate.getFullYear(),
      currentDate.getMonth(),
      1,
    );
    const endOfMonth = new Date(
      currentDate.getFullYear(),
      currentDate.getMonth() + 1,
      0,
    );

    const thisMonthReports = await this.prisma.report.count({
      where: {
        userId,
        createdAt: {
          gte: startOfMonth,
          lte: endOfMonth,
        },
      },
    });

    return {
      currentWeek: {
        weekNumber,
        year,
        hasReport: !!currentWeekReport,
        isCompleted: currentWeekReport?.isCompleted || false,
        isLocked: currentWeekReport?.isLocked || false,
      },
      totals: {
        totalReports,
        completedReports,
        thisMonthReports,
        completionRate,
      },
    };
  }

  async getUserReportStats(userId: string) {
    // Get reports by month for chart
    const monthlyStats = await this.prisma.report.groupBy({
      by: ['year'],
      where: { userId },
      _count: {
        id: true,
      },
      orderBy: {
        year: 'desc',
      },
      take: 12,
    });

    // Get weekly completion trend (last 8 weeks)
    const weeklyTrend = await this.prisma.report.findMany({
      where: { userId },
      select: {
        weekNumber: true,
        year: true,
        isCompleted: true,
        createdAt: true,
      },
      orderBy: [{ year: 'desc' }, { weekNumber: 'desc' }],
      take: 8,
    });

    return {
      monthlyStats,
      weeklyTrend,
    };
  }

  async getRecentActivities(userId: string) {
    // Get recent reports
    const recentReports = await this.prisma.report.findMany({
      where: { userId },
      include: {
        tasks: {
          select: {
            taskName: true,
            isCompleted: true,
          },
        },
      },
      orderBy: {
        updatedAt: 'desc',
      },
      take: 5,
    });

    const activities = recentReports.map((report) => {
      const completedTasks = report.tasks.filter(
        (task) => task.isCompleted,
      ).length;
      const totalTasks = report.tasks.length;

      return {
        id: report.id,
        type: 'report',
        title: `Báo cáo tuần ${report.weekNumber}/${report.year}`,
        description: `${completedTasks}/${totalTasks} công việc hoàn thành`,
        status: report.isCompleted ? 'completed' : 'pending',
        createdAt: report.createdAt,
        updatedAt: report.updatedAt,
      };
    });

    return activities;
  }

  async getAdminDashboardStats(user: any, filters: any) {
    const { departmentId, weekNumber, year } = filters;
    const { weekNumber: currentWeek, year: currentYear } = getCurrentWeek();

    // Build where clause based on user role and filters
    const whereClause: any = {};

    // Role-based filtering
    if (user.role === 'ADMIN') {
      // Admin can only see their department
      whereClause.user = {
        jobPosition: {
          departmentId: user.jobPosition?.departmentId,
        },
      };
    }

    // Apply additional filters
    if (departmentId && user.role === 'SUPERADMIN') {
      whereClause.user = {
        jobPosition: { departmentId },
      };
    }

    if (weekNumber && year) {
      whereClause.weekNumber = weekNumber;
      whereClause.year = year;
    }

    // Get total reports
    const totalReports = await this.prisma.report.count({
      where: whereClause,
    });

    // Get completed reports
    const completedReports = await this.prisma.report.count({
      where: {
        ...whereClause,
        isCompleted: true,
      },
    });

    // Get current week stats
    const currentWeekStats = await this.prisma.report.count({
      where: {
        ...whereClause,
        weekNumber: currentWeek,
        year: currentYear,
      },
    });

    // Get total active users in scope
    const userWhereClause: any = {
      isActive: true,
    };

    if (user.role === 'ADMIN') {
      userWhereClause.jobPosition = {
        departmentId: user.jobPosition?.departmentId,
      };
    } else if (departmentId) {
      userWhereClause.jobPosition = {
        departmentId,
      };
    }

    const totalActiveUsers = await this.prisma.user.count({
      where: userWhereClause,
    });

    // Get department-wise stats (for SUPERADMIN)
    let departmentStats = [];
    if (user.role === 'SUPERADMIN') {
      departmentStats = await this.prisma.department.findMany({
        select: {
          id: true,
          name: true,
          office: {
            select: {
              name: true,
            },
          },
          jobPositions: {
            select: {
              users: {
                select: {
                  reports: {
                    where: {
                      weekNumber: currentWeek,
                      year: currentYear,
                    },
                    select: {
                      isCompleted: true,
                    },
                  },
                },
                where: {
                  isActive: true,
                },
              },
            },
          },
        },
      });

      departmentStats = departmentStats.map((dept) => {
        const allUsers = dept.jobPositions.flatMap((jp) => jp.users);
        const usersWithReports = allUsers.filter(
          (user) => user.reports.length > 0,
        );
        const completedReports = allUsers.filter((user) =>
          user.reports.some((report) => report.isCompleted),
        ).length;

        return {
          id: dept.id,
          name: dept.name,
          office: dept.office.name,
          totalUsers: allUsers.length,
          reportedUsers: usersWithReports.length,
          completedUsers: completedReports,
          reportRate:
            allUsers.length > 0
              ? Math.round((usersWithReports.length / allUsers.length) * 100)
              : 0,
          completionRate:
            usersWithReports.length > 0
              ? Math.round((completedReports / usersWithReports.length) * 100)
              : 0,
        };
      });
    }

    return {
      overview: {
        totalReports,
        completedReports,
        currentWeekReports: currentWeekStats,
        totalActiveUsers,
        reportRate:
          totalActiveUsers > 0
            ? Math.round((currentWeekStats / totalActiveUsers) * 100)
            : 0,
        completionRate:
          totalReports > 0
            ? Math.round((completedReports / totalReports) * 100)
            : 0,
      },
      departmentStats,
      currentWeek: {
        weekNumber: currentWeek,
        year: currentYear,
      },
    };
  }

  async getOverview() {
    const { weekNumber, year } = getCurrentWeek();

    // Get total reports
    const totalReports = await this.prisma.report.count();

    // Get completed reports
    const completedReports = await this.prisma.report.count({
      where: { isCompleted: true },
    });

    // Get current week reports
    const currentWeekReports = await this.prisma.report.count({
      where: { weekNumber, year },
    });

    // Get total active users
    const totalActiveUsers = await this.prisma.user.count({
      where: { isActive: true },
    });

    // Get reports by department
    const departmentStats = await this.prisma.department.findMany({
      select: {
        id: true,
        name: true,
        office: { select: { name: true } },
        jobPositions: {
          select: {
            users: {
              select: {
                reports: {
                  where: { weekNumber, year },
                  select: { isCompleted: true },
                },
              },
              where: { isActive: true },
            },
          },
        },
      },
    });

    const processedDepartmentStats = departmentStats.map((dept) => {
      const users = dept.jobPositions.flatMap((jp) => jp.users);
      const usersWithReports = users.filter((user) => user.reports.length > 0);
      const completedUsers = users.filter((user) =>
        user.reports.some((report) => report.isCompleted),
      );

      return {
        departmentId: dept.id,
        departmentName: dept.name,
        officeName: dept.office.name,
        totalUsers: users.length,
        submittedReports: usersWithReports.length,
        completedReports: completedUsers.length,
        submissionRate:
          users.length > 0 ? (usersWithReports.length / users.length) * 100 : 0,
        completionRate:
          usersWithReports.length > 0
            ? (completedUsers.length / usersWithReports.length) * 100
            : 0,
      };
    });

    return {
      overview: {
        totalReports,
        completedReports,
        currentWeekReports,
        totalActiveUsers,
        globalCompletionRate:
          totalReports > 0 ? (completedReports / totalReports) * 100 : 0,
        currentWeekSubmissionRate:
          totalActiveUsers > 0
            ? (currentWeekReports / totalActiveUsers) * 100
            : 0,
      },
      departmentStats: processedDepartmentStats,
      currentWeek: { weekNumber, year },
    };
  }

  async getCompletionRate(filters: {
    week?: number;
    year?: number;
    departmentId?: string;
  }) {
    const { week, year, departmentId } = filters;
    const { weekNumber: currentWeek, year: currentYear } = getCurrentWeek();

    const targetWeek = week || currentWeek;
    const targetYear = year || currentYear;

    const whereClause: any = {
      weekNumber: targetWeek,
      year: targetYear,
    };

    if (departmentId) {
      whereClause.user = {
        jobPosition: { departmentId },
      };
    }

    const totalReports = await this.prisma.report.count({
      where: whereClause,
    });

    const completedReports = await this.prisma.report.count({
      where: {
        ...whereClause,
        isCompleted: true,
      },
    });

    const completionRate =
      totalReports > 0 ? (completedReports / totalReports) * 100 : 0;

    return {
      week: targetWeek,
      year: targetYear,
      departmentId,
      totalReports,
      completedReports,
      completionRate: Math.round(completionRate * 100) / 100,
    };
  }

  async getMissingReports(filters: { week?: number; year?: number }) {
    const { week, year } = filters;
    const { weekNumber: currentWeek, year: currentYear } = getCurrentWeek();

    const targetWeek = week || currentWeek;
    const targetYear = year || currentYear;

    // Get all active users
    const allUsers = await this.prisma.user.findMany({
      where: { isActive: true },
      select: {
        id: true,
        employeeCode: true,
        firstName: true,
        lastName: true,
        email: true,
        jobPosition: {
          select: {
            jobName: true,
            department: {
              select: {
                name: true,
                office: { select: { name: true } },
              },
            },
          },
        },
        reports: {
          where: {
            weekNumber: targetWeek,
            year: targetYear,
          },
        },
      },
    });

    // Filter users who haven't submitted reports
    const usersWithoutReports = allUsers.filter(
      (user) => user.reports.length === 0,
    );

    return {
      week: targetWeek,
      year: targetYear,
      totalActiveUsers: allUsers.length,
      usersWithoutReports: usersWithoutReports.length,
      missingUsers: usersWithoutReports.map((user) => ({
        id: user.id,
        employeeCode: user.employeeCode,
        name: `${user.firstName} ${user.lastName}`,
        email: user.email,
        jobPosition: user.jobPosition?.jobName,
        department: user.jobPosition?.department?.name,
        office: user.jobPosition?.department?.office?.name,
      })),
    };
  }

  async getSummaryReport(filters: { week?: number; year?: number }) {
    const { week, year } = filters;
    const { weekNumber: currentWeek, year: currentYear } = getCurrentWeek();

    const targetWeek = week || currentWeek;
    const targetYear = year || currentYear;

    // Get overall statistics
    const overview = await this.getOverview();

    // Get completion rate
    const completionRate = await this.getCompletionRate({
      week: targetWeek,
      year: targetYear,
    });

    // Get missing reports
    const missingReports = await this.getMissingReports({
      week: targetWeek,
      year: targetYear,
    });

    // Get department breakdown
    const departments = await this.prisma.department.findMany({
      select: {
        id: true,
        name: true,
        office: { select: { name: true } },
        jobPositions: {
          select: {
            users: {
              select: {
                id: true,
                employeeCode: true,
                firstName: true,
                lastName: true,
                reports: {
                  where: {
                    weekNumber: targetWeek,
                    year: targetYear,
                  },
                  select: {
                    isCompleted: true,
                    tasks: {
                      select: {
                        isCompleted: true,
                      },
                    },
                  },
                },
              },
              where: { isActive: true },
            },
          },
        },
      },
    });

    const departmentBreakdown = departments.map((dept) => {
      const users = dept.jobPositions.flatMap((jp) => jp.users);
      const usersWithReports = users.filter((user) => user.reports.length > 0);
      const completedReports = usersWithReports.filter((user) =>
        user.reports.some((report) => report.isCompleted),
      );

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

      return {
        departmentId: dept.id,
        departmentName: dept.name,
        officeName: dept.office.name,
        totalUsers: users.length,
        submittedReports: usersWithReports.length,
        completedReports: completedReports.length,
        totalTasks,
        completedTasks,
        submissionRate:
          users.length > 0
            ? Math.round((usersWithReports.length / users.length) * 100)
            : 0,
        completionRate:
          usersWithReports.length > 0
            ? Math.round(
                (completedReports.length / usersWithReports.length) * 100,
              )
            : 0,
        taskCompletionRate:
          totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0,
      };
    });

    return {
      week: targetWeek,
      year: targetYear,
      generatedAt: new Date(),
      overview: overview.overview,
      completionRate,
      missingReports,
      departmentBreakdown,
    };
  }

  async getWeeklyTaskStats(userId: string) {
    const { weekNumber, year } = getCurrentWeek();

    // Lấy tất cả các báo cáo của user trong tuần này
    const reports = await this.prisma.report.findMany({
      where: {
        userId,
        weekNumber,
        year,
      },
      include: {
        tasks: true,
      },
    });

    let completed = 0;
    let uncompleted = 0;

    reports.forEach((report) => {
      report.tasks.forEach((task) => {
        if (task.isCompleted) {
          completed += 1;
        } else {
          uncompleted += 1;
        }
      });
    });

    return {
      weekNumber,
      year,
      completed,
      uncompleted,
      total: completed + uncompleted,
    };
  }

  async getMonthlyTaskStats(userId: string, year?: number) {
    const currentYear = year || new Date().getFullYear();
    // Lấy tất cả báo cáo của user trong năm
    const reports = await this.prisma.report.findMany({
      where: {
        userId,
        year: currentYear,
      },
      include: {
        tasks: true,
      },
    });

    // Khởi tạo dữ liệu cho 12 tháng
    const stats = Array.from({ length: 12 }, (_, i) => ({
      month: i + 1,
      completed: 0,
      uncompleted: 0,
      total: 0,
    }));

    reports.forEach((report) => {
      const month = report.createdAt.getMonth(); // 0-based
      report.tasks.forEach((task) => {
        if (task.isCompleted) {
          stats[month].completed += 1;
        } else {
          stats[month].uncompleted += 1;
        }
        stats[month].total += 1;
      });
    });

    return {
      year: currentYear,
      stats,
    };
  }

  async getYearlyTaskStats(userId: string) {
    // Lấy tất cả báo cáo của user
    const reports = await this.prisma.report.findMany({
      where: { userId },
      include: { tasks: true },
    });

    // Gom nhóm theo năm
    const yearlyMap = new Map<
      number,
      { completed: number; uncompleted: number; total: number }
    >();

    reports.forEach((report) => {
      const year = report.year;
      if (!yearlyMap.has(year)) {
        yearlyMap.set(year, { completed: 0, uncompleted: 0, total: 0 });
      }
      report.tasks.forEach((task) => {
        if (task.isCompleted) {
          yearlyMap.get(year)!.completed += 1;
        } else {
          yearlyMap.get(year)!.uncompleted += 1;
        }
        yearlyMap.get(year)!.total += 1;
      });
    });

    const stats = Array.from(yearlyMap.entries())
      .map(([year, data]) => ({ year, ...data }))
      .sort((a, b) => a.year - b.year);

    return { stats };
  }
}

import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { getCurrentWeek } from '../common/utils/date.utils';

@Injectable()
export class StatisticsService {
  private readonly logger = new Logger(StatisticsService.name);

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
      include: {
        tasks: {
          select: {
            taskName: true,
            isCompleted: true,
            reasonNotDone: true,
          },
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

    // Analyze current week incomplete tasks with task names
    let incompleteTasksAnalysis = null;
    if (currentWeekReport) {
      const incompleteTasks = currentWeekReport.tasks.filter(
        (task) => !task.isCompleted,
      );

      // Group reasons for incomplete tasks with task details
      const reasonsMap = new Map<string, {
        count: number;
        tasks: Array<{ taskName: string; reason: string }>;
      }>();
      
      incompleteTasks.forEach((task) => {
        const reason = task.reasonNotDone?.trim() || 'Không có lý do';
        if (!reasonsMap.has(reason)) {
          reasonsMap.set(reason, { count: 0, tasks: [] });
        }
        const reasonData = reasonsMap.get(reason)!;
        reasonData.count += 1;
        reasonData.tasks.push({
          taskName: task.taskName,
          reason: task.reasonNotDone?.trim() || 'Không có lý do'
        });
      });

      incompleteTasksAnalysis = {
        totalIncompleteTasks: incompleteTasks.length,
        totalTasks: currentWeekReport.tasks.length,
        reasons: Array.from(reasonsMap.entries()).map(([reason, data]) => ({
          reason,
          count: data.count,
          percentage: Math.round((data.count / incompleteTasks.length) * 100),
          tasks: data.tasks.slice(0, 3), // Show up to 3 sample tasks
        })).sort((a, b) => b.count - a.count),
      };
    }

    return {
      currentWeek: {
        weekNumber,
        year,
        hasReport: !!currentWeekReport,
        isCompleted: currentWeekReport?.isCompleted || false,
        isLocked: currentWeekReport?.isLocked || false,
        incompleteTasksAnalysis,
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

    // Get weekly completion trend (last 8 weeks) with reasons
    const weeklyTrend = await this.prisma.report.findMany({
      where: { userId },
      select: {
        weekNumber: true,
        year: true,
        isCompleted: true,
        createdAt: true,
        tasks: {
          select: {
            taskName: true,
            isCompleted: true,
            reasonNotDone: true,
          },
        },
      },
      orderBy: [{ year: 'desc' }, { weekNumber: 'desc' }],
      take: 8,
    });

    // Analyze incomplete task reasons across all reports with task names
    const allIncompleteTasks = weeklyTrend
      .flatMap((report) => 
        report.tasks
          .filter((task) => !task.isCompleted)
          .map((task) => ({
            taskName: task.taskName,
            reasonNotDone: task.reasonNotDone,
            weekNumber: report.weekNumber,
            year: report.year,
          }))
      );

    const reasonsAnalysis = new Map<string, {
      count: number;
      tasks: Array<{ taskName: string; weekNumber: number; year: number }>;
    }>();
    
    allIncompleteTasks.forEach((task) => {
      const reason = task.reasonNotDone?.trim() || 'Không có lý do';
      if (!reasonsAnalysis.has(reason)) {
        reasonsAnalysis.set(reason, { count: 0, tasks: [] });
      }
      const reasonData = reasonsAnalysis.get(reason)!;
      reasonData.count += 1;
      reasonData.tasks.push({
        taskName: task.taskName,
        weekNumber: task.weekNumber,
        year: task.year,
      });
    });

    const topReasons = Array.from(reasonsAnalysis.entries())
      .map(([reason, data]) => ({
        reason,
        count: data.count,
        percentage: Math.round((data.count / allIncompleteTasks.length) * 100),
        sampleTasks: data.tasks.slice(0, 5), // Show up to 5 sample tasks
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10); // Top 10 reasons

    return {
      monthlyStats,
      weeklyTrend: weeklyTrend.map((week) => ({
        weekNumber: week.weekNumber,
        year: week.year,
        isCompleted: week.isCompleted,
        createdAt: week.createdAt,
        totalTasks: week.tasks.length,
        completedTasks: week.tasks.filter((task) => task.isCompleted).length,
        incompleteTasks: week.tasks.filter((task) => !task.isCompleted).length,
      })),
      incompleteReasonsAnalysis: {
        totalIncompleteTasks: allIncompleteTasks.length,
        topReasons,
      },
    };
  }

  async getRecentActivities(userId: string) {
    // Get recent reports with task details
    const recentReports = await this.prisma.report.findMany({
      where: { userId },
      include: {
        tasks: {
          select: {
            taskName: true,
            isCompleted: true,
            reasonNotDone: true,
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
      const incompleteTasks = report.tasks.filter((task) => !task.isCompleted);

      // Get most common reason for incomplete tasks in this report with task names
      const reasonsMap = new Map<string, {
        count: number;
        tasks: Array<{ taskName: string }>;
      }>();
      
      incompleteTasks.forEach((task) => {
        const reason = task.reasonNotDone?.trim() || 'Không có lý do';
        if (!reasonsMap.has(reason)) {
          reasonsMap.set(reason, { count: 0, tasks: [] });
        }
        const reasonData = reasonsMap.get(reason)!;
        reasonData.count += 1;
        reasonData.tasks.push({ taskName: task.taskName });
      });

      const mostCommonReasonData = reasonsMap.size > 0 
        ? Array.from(reasonsMap.entries()).sort((a, b) => b[1].count - a[1].count)[0]
        : null;

      return {
        id: report.id,
        type: 'report',
        title: `Báo cáo tuần ${report.weekNumber}/${report.year}`,
        description: `${completedTasks}/${totalTasks} công việc hoàn thành`,
        status: report.isCompleted ? 'completed' : 'pending',
        createdAt: report.createdAt,
        updatedAt: report.updatedAt,
        incompleteTasksCount: incompleteTasks.length,
        mostCommonIncompleteReason: mostCommonReasonData?.[0] || null,
        incompleteTasksSample: mostCommonReasonData?.[1].tasks.slice(0, 2) || [], // Show up to 2 sample tasks
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
      const completedUsers = users.filter((user) =>
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
        completedReports: completedUsers.length,
        totalTasks,
        completedTasks,
        submissionRate:
          users.length > 0
            ? Math.round((usersWithReports.length / users.length) * 100)
            : 0,
        completionRate:
          usersWithReports.length > 0
            ? Math.round(
                (completedUsers.length / usersWithReports.length) * 100,
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

    // Lấy tất cả các báo cáo của user trong tuần này với task details
    const reports = await this.prisma.report.findMany({
      where: {
        userId,
        weekNumber,
        year,
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
    });

    let completed = 0;
    let uncompleted = 0;
    const incompleteReasons = new Map<string, { 
      count: number; 
      tasks: Array<{ taskName: string; reason: string }>;
    }>();

    reports.forEach((report) => {
      report.tasks.forEach((task) => {
        if (task.isCompleted) {
          completed += 1;
        } else {
          uncompleted += 1;
          const reason = task.reasonNotDone?.trim() || 'Không có lý do';
          if (!incompleteReasons.has(reason)) {
            incompleteReasons.set(reason, { count: 0, tasks: [] });
          }
          const reasonData = incompleteReasons.get(reason)!;
          reasonData.count += 1;
          reasonData.tasks.push({
            taskName: task.taskName,
            reason: task.reasonNotDone?.trim() || 'Không có lý do'
          });
        }
      });
    });

    const reasonsAnalysis = Array.from(incompleteReasons.entries())
      .map(([reason, data]) => ({
        reason,
        count: data.count,
        percentage: uncompleted > 0 ? Math.round((data.count / uncompleted) * 100) : 0,
        sampleTasks: data.tasks.slice(0, 3), // Show up to 3 sample tasks with names
      }))
      .sort((a, b) => b.count - a.count);

    return {
      weekNumber,
      year,
      completed,
      uncompleted,
      total: completed + uncompleted,
      incompleteReasonsAnalysis: reasonsAnalysis,
    };
  }

  async getMonthlyTaskStats(userId: string, year?: number) {
    const currentYear = year || new Date().getFullYear();
    
    // Lấy tất cả báo cáo của user trong năm với task details
    const reports = await this.prisma.report.findMany({
      where: {
        userId,
        year: currentYear,
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
    });

    // Khởi tạo dữ liệu cho 12 tháng
    const stats = Array.from({ length: 12 }, (_, i) => ({
      month: i + 1,
      completed: 0,
      uncompleted: 0,
      total: 0,
      incompleteReasons: new Map<string, { 
        count: number; 
        tasks: Array<{ taskName: string }>;
      }>(),
    }));

    reports.forEach((report) => {
      const month = report.createdAt.getMonth(); // 0-based
      report.tasks.forEach((task) => {
        if (task.isCompleted) {
          stats[month].completed += 1;
        } else {
          stats[month].uncompleted += 1;
          const reason = task.reasonNotDone?.trim() || 'Không có lý do';
          const reasonsMap = stats[month].incompleteReasons;
          if (!reasonsMap.has(reason)) {
            reasonsMap.set(reason, { count: 0, tasks: [] });
          }
          const reasonData = reasonsMap.get(reason)!;
          reasonData.count += 1;
          reasonData.tasks.push({ taskName: task.taskName });
        }
        stats[month].total += 1;
      });
    });

    // Convert reasons map to array for each month
    const processedStats = stats.map((monthData) => ({
      month: monthData.month,
      completed: monthData.completed,
      uncompleted: monthData.uncompleted,
      total: monthData.total,
      topIncompleteReasons: Array.from(monthData.incompleteReasons.entries())
        .map(([reason, data]) => ({
          reason,
          count: data.count,
          percentage: monthData.uncompleted > 0 
            ? Math.round((data.count / monthData.uncompleted) * 100) 
            : 0,
          sampleTasks: data.tasks.slice(0, 3), // Show up to 3 sample tasks with names
        }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 5), // Top 5 reasons per month
    }));

    return {
      year: currentYear,
      stats: processedStats,
    };
  }

  async getYearlyTaskStats(userId: string) {
    // Lấy tất cả báo cáo của user với task details
    const reports = await this.prisma.report.findMany({
      where: { userId },
      include: { 
        tasks: {
          select: {
            taskName: true,
            isCompleted: true,
            reasonNotDone: true,
          },
        },
      },
    });

    // Gom nhóm theo năm
    const yearlyMap = new Map<
      number,
      { 
        completed: number; 
        uncompleted: number; 
        total: number;
        incompleteReasons: Map<string, { 
          count: number; 
          tasks: Array<{ taskName: string }>;
        }>;
      }
    >();

    reports.forEach((report) => {
      const year = report.year;
      if (!yearlyMap.has(year)) {
        yearlyMap.set(year, { 
          completed: 0, 
          uncompleted: 0, 
          total: 0,
          incompleteReasons: new Map(),
        });
      }
      
      const yearData = yearlyMap.get(year)!;
      report.tasks.forEach((task) => {
        if (task.isCompleted) {
          yearData.completed += 1;
        } else {
          yearData.uncompleted += 1;
          const reason = task.reasonNotDone?.trim() || 'Không có lý do';
          if (!yearData.incompleteReasons.has(reason)) {
            yearData.incompleteReasons.set(reason, { count: 0, tasks: [] });
          }
          const reasonData = yearData.incompleteReasons.get(reason)!;
          reasonData.count += 1;
          reasonData.tasks.push({ taskName: task.taskName });
        }
        yearData.total += 1;
      });
    });

    const stats = Array.from(yearlyMap.entries())
      .map(([year, data]) => ({
        year,
        completed: data.completed,
        uncompleted: data.uncompleted,
        total: data.total,
        topIncompleteReasons: Array.from(data.incompleteReasons.entries())
          .map(([reason, reasonData]) => ({
            reason,
            count: reasonData.count,
            percentage: data.uncompleted > 0 
              ? Math.round((reasonData.count / data.uncompleted) * 100) 
              : 0,
            sampleTasks: reasonData.tasks.slice(0, 5), // Show up to 5 sample tasks with names
          }))
          .sort((a, b) => b.count - a.count)
          .slice(0, 10), // Top 10 reasons per year
      }))
      .sort((a, b) => a.year - b.year);

    return { stats };
  }

  // Enhanced method to get detailed incomplete reasons analysis
  async getIncompleteReasonsAnalysis(userId: string, filters: {
    weekNumber?: number;
    year?: number;
    startDate?: Date;
    endDate?: Date;
  }) {
    const whereClause: any = { userId };

    if (filters.weekNumber && filters.year) {
      whereClause.weekNumber = filters.weekNumber;
      whereClause.year = filters.year;
    } else if (filters.startDate && filters.endDate) {
      whereClause.createdAt = {
        gte: filters.startDate,
        lte: filters.endDate,
      };
    }

    const reports = await this.prisma.report.findMany({
      where: whereClause,
      include: {
        tasks: {
          where: {
            isCompleted: false,
          },
          select: {
            taskName: true,
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
    });

    const reasonsAnalysis = new Map<string, {
      count: number;
      tasks: Array<{
        taskName: string;
        weekNumber: number;
        year: number;
        daysWorked: string[];
      }>;
    }>();

    reports.forEach((report) => {
      report.tasks.forEach((task) => {
        const reason = task.reasonNotDone?.trim() || 'Không có lý do';
        
        if (!reasonsAnalysis.has(reason)) {
          reasonsAnalysis.set(reason, { count: 0, tasks: [] });
        }

        const reasonData = reasonsAnalysis.get(reason)!;
        reasonData.count += 1;

        // Get days worked for this task
        const daysWorked = [];
        if (task.monday) daysWorked.push('Thứ 2');
        if (task.tuesday) daysWorked.push('Thứ 3');
        if (task.wednesday) daysWorked.push('Thứ 4');
        if (task.thursday) daysWorked.push('Thứ 5');
        if (task.friday) daysWorked.push('Thứ 6');
        if (task.saturday) daysWorked.push('Thứ 7');
        if (task.sunday) daysWorked.push('Chủ nhật');

        reasonData.tasks.push({
          taskName: task.taskName,
          weekNumber: report.weekNumber,
          year: report.year,
          daysWorked,
        });
      });
    });

    const totalIncompleteTasks = Array.from(reasonsAnalysis.values())
      .reduce((sum, data) => sum + data.count, 0);

    const analysis = Array.from(reasonsAnalysis.entries())
      .map(([reason, data]) => ({
        reason,
        count: data.count,
        percentage: totalIncompleteTasks > 0 
          ? Math.round((data.count / totalIncompleteTasks) * 100) 
          : 0,
        tasks: data.tasks.slice(0, 10), // Limit to 10 sample tasks with names
      }))
      .sort((a, b) => b.count - a.count);

    return {
      totalIncompleteTasks,
      totalReports: reports.length,
      filters,
      reasonsAnalysis: analysis,
    };
  }
}

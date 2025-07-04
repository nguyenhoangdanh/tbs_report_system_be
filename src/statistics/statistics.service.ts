import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { HierarchyReportsService } from '../hierarchy-reports/hierarchy-reports.service';
import { getCurrentWeek, calculateDaysOverdue } from '../common/utils/week-utils';

@Injectable()
export class StatisticsService {
  private readonly logger = new Logger(StatisticsService.name);

  constructor(
    private prisma: PrismaService,
    private hierarchyReportsService: HierarchyReportsService,
  ) {}

  private calculateIntegerPercentage(numerator: number, denominator: number): number {
    if (denominator === 0) return 0;
    const percentage = (numerator / denominator) * 100;
    return Math.round(percentage * 100) / 100; // Round to 2 decimal places
  }

  // Helper method for integer percentage (when we specifically want whole numbers for UI)
  // private calculateIntegerPercentage(numerator: number, denominator: number): number {
  //   if (denominator === 0) return 0;
  //   return Math.round((numerator / denominator) * 100);
  // }

  // User-specific statistics (keep in StatisticsService)
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

    // Get TOTAL reports count (all reports user has ever created)
    const totalReports = await this.prisma.report.count({
      where: { userId },
    });

    // Get completed reports count (all completed reports)
    const completedReports = await this.prisma.report.count({
      where: {
        userId,
        isCompleted: true,
      },
    });

    // Calculate completion rate based on all reports
    const completionRate = this.calculateIntegerPercentage(completedReports, totalReports);

    // Get this month's reports (current calendar month)
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
    if (currentWeekReport && currentWeekReport.tasks.length > 0) {
      const incompleteTasks = currentWeekReport.tasks.filter(task => !task.isCompleted);
      
      if (incompleteTasks.length > 0) {
        const reasonsMap = new Map<string, { count: number; tasks: string[] }>();
        
        incompleteTasks.forEach(task => {
          const reason = task.reasonNotDone?.trim() || 'Không có lý do';
          if (!reasonsMap.has(reason)) {
            reasonsMap.set(reason, { count: 0, tasks: [] });
          }
          const reasonData = reasonsMap.get(reason)!;
          reasonData.count += 1;
          reasonData.tasks.push(task.taskName);
        });

        const topReasons = Array.from(reasonsMap.entries())
          .map(([reason, data]) => ({
            reason,
            count: data.count,
            percentage: this.calculateIntegerPercentage(data.count, incompleteTasks.length),
            tasks: data.tasks,
          }))
          .sort((a, b) => b.count - a.count)
          .slice(0, 5);

        incompleteTasksAnalysis = {
          totalIncompleteTasks: incompleteTasks.length,
          topReasons,
        };
      }
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
        totalReports, // This now correctly counts ALL reports the user has created
        completedReports, // This counts ALL completed reports
        thisMonthReports, // This counts reports created in current calendar month
        completionRate, // Percentage of completed reports out of all reports
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
        percentage: this.calculateIntegerPercentage(data.count, allIncompleteTasks.length),
        sampleTasks: data.tasks.slice(0, 5),
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

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
            updatedAt: true,
          },
        },
      },
      orderBy: {
        updatedAt: 'desc',
      },
      take: 5,
    });

    const activities = recentReports.map((report) => {
      const totalTasks = report.tasks.length;
      const completedTasks = report.tasks.filter(task => task.isCompleted).length;
      const incompleteTasks = report.tasks.filter(task => !task.isCompleted);

      // Get top incomplete reasons for this report
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
          completionRate: this.calculateIntegerPercentage(completedTasks, totalTasks),
          topIncompleteReasons: topReasons,
        },
      };
    });

    return activities;
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
          completed++;
        } else {
          uncompleted++;
          const reason = task.reasonNotDone?.trim() || 'Không có lý do';
          if (!incompleteReasons.has(reason)) {
            incompleteReasons.set(reason, { count: 0, tasks: [] });
          }
          const reasonData = incompleteReasons.get(reason)!;
          reasonData.count += 1;
          reasonData.tasks.push({
            taskName: task.taskName,
            reason: reason,
          });
        }
      });
    });

    const reasonsAnalysis = Array.from(incompleteReasons.entries())
      .map(([reason, data]) => ({
        reason,
        count: data.count,
        percentage: this.calculateIntegerPercentage(data.count, uncompleted),
        sampleTasks: data.tasks.slice(0, 3),
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
    const monthlyData = Array.from({ length: 12 }, (_, index) => ({
      month: index + 1,
      year: currentYear,
      completed: 0,
      uncompleted: 0,
      total: 0,
      incompleteReasons: new Map<string, number>(),
    }));

    // Phân tích dữ liệu theo tháng
    reports.forEach((report) => {
      const reportMonth = new Date(report.createdAt).getMonth(); // 0-11
      const monthData = monthlyData[reportMonth];

      report.tasks.forEach((task) => {
        monthData.total++;
        if (task.isCompleted) {
          monthData.completed++;
        } else {
          monthData.uncompleted++;
          const reason = task.reasonNotDone?.trim() || 'Không có lý do';
          monthData.incompleteReasons.set(
            reason,
            (monthData.incompleteReasons.get(reason) || 0) + 1
          );
        }
      });
    });

    // Chuyển đổi Map thành array cho response
    const result = monthlyData.map((data) => ({
      month: data.month,
      year: data.year,
      completed: data.completed,
      uncompleted: data.uncompleted,
      total: data.total,
      completionRate: this.calculateIntegerPercentage(data.completed, data.total),
      topIncompleteReasons: Array.from(data.incompleteReasons.entries())
        .map(([reason, count]) => ({ reason, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 5),
    }));

    return {
      year: currentYear,
      monthlyStats: result,
      summary: {
        totalTasks: result.reduce((sum, month) => sum + month.total, 0),
        totalCompleted: result.reduce((sum, month) => sum + month.completed, 0),
        averageCompletionRate: result.length > 0
          ? Math.round(result.reduce((sum, month) => sum + month.completionRate, 0) / result.length)
          : 0,
      },
    };
  }

  async getYearlyTaskStats(userId: string) {
    const currentYear = new Date().getFullYear();
    const years = [currentYear - 2, currentYear - 1, currentYear];

    const yearlyData = await Promise.all(
      years.map(async (year) => {
        const reports = await this.prisma.report.findMany({
          where: {
            userId,
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
        const incompleteReasons = new Map<string, number>();

        reports.forEach((report) => {
          report.tasks.forEach((task) => {
            if (task.isCompleted) {
              completed++;
            } else {
              uncompleted++;
              const reason = task.reasonNotDone?.trim() || 'Không có lý do';
              incompleteReasons.set(reason, (incompleteReasons.get(reason) || 0) + 1);
            }
          });
        });

        const total = completed + uncompleted;

        return {
          year,
          completed,
          uncompleted,
          total,
          completionRate: this.calculateIntegerPercentage(completed, total),
          topIncompleteReasons: Array.from(incompleteReasons.entries())
            .map(([reason, count]) => ({ reason, count }))
            .sort((a, b) => b.count - a.count)
            .slice(0, 5),
        };
      })
    );

    return {
      yearlyStats: yearlyData,
      summary: {
        totalYears: years.length,
        averageCompletionRate: yearlyData.length > 0
          ? Math.round(yearlyData.reduce((sum, year) => sum + year.completionRate, 0) / yearlyData.length)
          : 0,
        bestYear: yearlyData.reduce((best, current) =>
          current.completionRate > best.completionRate ? current : best
        ),
        worstYear: yearlyData.reduce((worst, current) =>
          current.completionRate < worst.completionRate ? current : worst
        ),
      },
    };
  }

  async getIncompleteReasonsAnalysis(userId: string, filters: any) {
    const whereClause: any = { userId };

    // Apply filters
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
          where: { isCompleted: false },
          select: {
            taskName: true,
            reasonNotDone: true,
          },
        },
      },
      orderBy: [{ year: 'desc' }, { weekNumber: 'desc' }],
    });

    const reasonsMap = new Map<string, {
      count: number;
      tasks: Array<{
        taskName: string;
        weekNumber: number;
        year: number;
      }>;
    }>();

    reports.forEach((report) => {
      report.tasks.forEach((task) => {
        const reason = task.reasonNotDone?.trim() || 'Không có lý do';
        if (!reasonsMap.has(reason)) {
          reasonsMap.set(reason, { count: 0, tasks: [] });
        }
        const reasonData = reasonsMap.get(reason)!;
        reasonData.count += 1;
        reasonData.tasks.push({
          taskName: task.taskName,
          weekNumber: report.weekNumber,
          year: report.year,
        });
      });
    });

    const totalIncompleteTasks = Array.from(reasonsMap.values())
      .reduce((sum, data) => sum + data.count, 0);

    const reasonsAnalysis = Array.from(reasonsMap.entries())
      .map(([reason, data]) => ({
        reason,
        count: data.count,
        percentage: this.calculateIntegerPercentage(data.count, totalIncompleteTasks),
        sampleTasks: data.tasks.slice(0, 10),
      }))
      .sort((a, b) => b.count - a.count);

    return {
      filters,
      totalIncompleteTasks,
      totalReports: reports.length,
      reasonsAnalysis,
      summary: {
        mostCommonReason: reasonsAnalysis[0]?.reason || 'N/A',
        diversityIndex: reasonsMap.size,
        averageReasonsPerReport: reports.length > 0 
          ? Math.round(reasonsMap.size / reports.length * 100) / 100 
          : 0,
      },
    };
  }

  // Delegate admin stats to HierarchyReportsService
  async getAdminDashboardStats(user: any, filters: any) {
    return this.hierarchyReportsService.getMyHierarchyView(user, filters.weekNumber, filters.year);
  }

  async getOverview() {
    try {
      const { weekNumber, year } = getCurrentWeek();
      
      // Get basic overview stats for current week only
      const totalUsers = await this.prisma.user.count({
        where: { isActive: true }
      });
      
      // Reports for current week
      const totalReports = await this.prisma.report.count({
        where: { weekNumber, year }
      });
      
      const completedReports = await this.prisma.report.count({
        where: { weekNumber, year, isCompleted: true }
      });

      // Fixed percentage calculations
      const submissionRate = this.calculateIntegerPercentage(totalReports, totalUsers);
      const completionRate = this.calculateIntegerPercentage(completedReports, totalReports);

      return {
        weekNumber,
        year,
        totalUsers,
        totalReports, // Reports for current week only
        completedReports, // Completed reports for current week only
        submissionRate,
        completionRate,
        summary: {
          usersWithoutReports: totalUsers - totalReports,
          incompleteReports: totalReports - completedReports,
        }
      };
    } catch (error) {
      this.logger.error('Error in getOverview:', error);
      throw error;
    }
  }

  async getCompletionRate(filters: any) {
    try {
      const { weekNumber: currentWeek, year: currentYear } = getCurrentWeek();
      const targetWeek = filters.week || currentWeek;
      const targetYear = filters.year || currentYear;

      const whereClause: any = {
        weekNumber: targetWeek,
        year: targetYear,
      };

      if (filters.departmentId) {
        whereClause.user = {
          jobPosition: {
            departmentId: filters.departmentId
          }
        };
      }

      const totalReports = await this.prisma.report.count({ where: whereClause });
      const completedReports = await this.prisma.report.count({
        where: { ...whereClause, isCompleted: true }
      });

      // Fixed percentage calculation
      const completionRate = this.calculateIntegerPercentage(completedReports, totalReports);

      return {
        weekNumber: targetWeek,
        year: targetYear,
        totalReports,
        completedReports,
        completionRate,
        filters,
      };
    } catch (error) {
      this.logger.error('Error in getCompletionRate:', error);
      throw error;
    }
  }

  async getMissingReports(filters: any) {
    try {
      const { weekNumber: currentWeek, year: currentYear } = getCurrentWeek();
      const targetWeek = filters.week || currentWeek;
      const targetYear = filters.year || currentYear;

      // Get all active users
      const allUsers = await this.prisma.user.findMany({
        where: { isActive: true },
        select: {
          id: true,
          employeeCode: true,
          firstName: true,
          lastName: true,
          email: true,
        }
      });

      // Get users who have reports for the specific week
      const usersWithReports = await this.prisma.report.findMany({
        where: {
          weekNumber: targetWeek,
          year: targetYear,
        },
        select: {
          userId: true,
        }
      });

      const userIdsWithReports = new Set(usersWithReports.map(r => r.userId));
      const missingUsers = allUsers.filter(user => !userIdsWithReports.has(user.id));

      return {
        weekNumber: targetWeek,
        year: targetYear,
        totalUsers: allUsers.length,
        usersWithReports: usersWithReports.length,
        missingReports: missingUsers.length,
        missingUsers: missingUsers.map(user => ({
          ...user,
          fullName: `${user.firstName} ${user.lastName}`,
          daysOverdue: this.calculateDaysOverdue(targetWeek, targetYear),
        })),
      };
    } catch (error) {
      this.logger.error('Error in getMissingReports:', error);
      throw error;
    }
  }

  async getSummaryReport(filters: { week?: number; year?: number }) {
    try {
      const { weekNumber: currentWeek, year: currentYear } = getCurrentWeek();
      const targetWeek = filters.week || currentWeek;
      const targetYear = filters.year || currentYear;

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

      // Get overview
      const overview = await this.getOverview();

      return {
        weekNumber: targetWeek,
        year: targetYear,
        overview,
        completionRate,
        missingReports: {
          count: missingReports.missingReports,
          users: missingReports.missingUsers.slice(0, 10), // Limit to 10 for summary
        },
        summary: {
          totalUsers: overview.totalUsers,
          submissionRate: overview.submissionRate,
          completionRate: completionRate.completionRate,
          actionRequired: missingReports.missingReports > 0 || 
                          overview.summary.incompleteReports > 0,
        }
      };
    } catch (error) {
      this.logger.error('Error in getSummaryReport:', error);
      throw error;
    }
  }

  // Helper method to calculate days overdue - use the utility function
  private calculateDaysOverdue(weekNumber: number, year: number): number {
    return calculateDaysOverdue(weekNumber, year);
  }
}

import { Injectable } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';

@Injectable()
export class StatisticsService {
  constructor(private prisma: PrismaService) {}

  async getOverview() {
    const [totalUsers, totalDepartments, totalOffices, currentWeekReports] =
      await Promise.all([
        this.prisma.user.count({ where: { isActive: true } }),
        this.prisma.department.count(),
        this.prisma.office.count(),
        this.getCurrentWeekReportsCount(),
      ]);

    const currentWeek = this.getCurrentWeek();
    const currentYear = new Date().getFullYear();

    return {
      totalUsers,
      totalDepartments,
      totalOffices,
      currentWeek: {
        week: currentWeek,
        year: currentYear,
        submittedReports: currentWeekReports.submitted,
        pendingReports: currentWeekReports.pending,
        completionRate:
          totalUsers > 0
            ? (currentWeekReports.submitted / totalUsers) * 100
            : 0,
      },
    };
  }

  async getCompletionRate(filters: {
    week?: number;
    year?: number;
    departmentId?: string;
  }) {
    const week = filters.week || this.getCurrentWeek();
    const year = filters.year || new Date().getFullYear();

    const departments = await this.prisma.department.findMany({
      where: filters.departmentId ? { id: filters.departmentId } : {},
      include: {
        office: true,
        jobPositions: {
          include: {
            users: {
              where: { isActive: true },
              include: {
                reports: {
                  where: {
                    weekNumber: week,
                    year: year,
                  },
                },
              },
            },
          },
        },
      },
    });

    return departments.map((department) => {
      const users = department.jobPositions.flatMap((jp) => jp.users);
      const totalUsers = users.length;
      const submittedReports = users.filter(
        (user) => user.reports.length > 0,
      ).length;
      const completedReports = users.filter((user) =>
        user.reports.some((report) => report.isCompleted),
      ).length;

      return {
        department: {
          id: department.id,
          name: department.name,
          office: department.office,
        },
        week,
        year,
        totalUsers,
        submittedReports,
        completedReports,
        submissionRate:
          totalUsers > 0 ? (submittedReports / totalUsers) * 100 : 0,
        completionRate:
          totalUsers > 0 ? (completedReports / totalUsers) * 100 : 0,
      };
    });
  }

  async getMissingReports(filters: { week?: number; year?: number }) {
    const week = filters.week || this.getCurrentWeek();
    const year = filters.year || new Date().getFullYear();

    const usersWithoutReports = await this.prisma.user.findMany({
      where: {
        isActive: true,
        reports: {
          none: {
            weekNumber: week,
            year: year,
          },
        },
      },
      include: {
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
      orderBy: [
        { jobPosition: { department: { name: 'asc' } } },
        { lastName: 'asc' },
        { firstName: 'asc' },
      ],
    });

    return {
      week,
      year,
      totalMissing: usersWithoutReports.length,
      users: usersWithoutReports.map((user) => ({
        id: user.id,
        email: user.email,
        fullName: `${user.firstName} ${user.lastName}`,
        jobPosition: user.jobPosition,
      })),
    };
  }

  async getSummaryReport(filters: { week?: number; year?: number }) {
    const week = filters.week || this.getCurrentWeek();
    const year = filters.year || new Date().getFullYear();

    const [completionRates, missingReports, taskStatistics] = await Promise.all(
      [
        this.getCompletionRate({ week, year }),
        this.getMissingReports({ week, year }),
        this.getTaskStatistics(week, year),
      ],
    );

    return {
      week,
      year,
      summary: {
        totalDepartments: completionRates.length,
        totalUsers: completionRates.reduce(
          (sum, dept) => sum + dept.totalUsers,
          0,
        ),
        totalSubmitted: completionRates.reduce(
          (sum, dept) => sum + dept.submittedReports,
          0,
        ),
        totalCompleted: completionRates.reduce(
          (sum, dept) => sum + dept.completedReports,
          0,
        ),
        totalMissing: missingReports.totalMissing,
        overallSubmissionRate: this.calculateOverallRate(
          completionRates,
          'submissionRate',
        ),
        overallCompletionRate: this.calculateOverallRate(
          completionRates,
          'completionRate',
        ),
      },
      departmentBreakdown: completionRates,
      missingReports: missingReports.users,
      taskStatistics,
    };
  }

  private async getCurrentWeekReportsCount() {
    const week = this.getCurrentWeek();
    const year = new Date().getFullYear();

    const [submitted, total] = await Promise.all([
      this.prisma.report.count({
        where: {
          weekNumber: week,
          year: year,
        },
      }),
      this.prisma.user.count({
        where: { isActive: true },
      }),
    ]);

    return {
      submitted,
      pending: total - submitted,
    };
  }

  private async getTaskStatistics(week: number, year: number) {
    const reports = await this.prisma.report.findMany({
      where: {
        weekNumber: week,
        year: year,
      },
      include: {
        tasks: true,
      },
    });

    const taskStats = new Map<string, { total: number; completed: number }>();

    reports.forEach((report) => {
      report.tasks.forEach((task) => {
        const current = taskStats.get(task.taskName) || {
          total: 0,
          completed: 0,
        };
        current.total++;
        if (task.isCompleted) current.completed++;
        taskStats.set(task.taskName, current);
      });
    });

    return Array.from(taskStats.entries()).map(([taskName, stats]) => ({
      taskName,
      totalAssigned: stats.total,
      completed: stats.completed,
      completionRate:
        stats.total > 0 ? (stats.completed / stats.total) * 100 : 0,
    }));
  }

  private getCurrentWeek(): number {
    const now = new Date();
    const firstDayOfYear = new Date(now.getFullYear(), 0, 1);
    const pastDaysOfYear =
      (now.getTime() - firstDayOfYear.getTime()) / 86400000;
    return Math.ceil((pastDaysOfYear + firstDayOfYear.getDay() + 1) / 7);
  }

  private calculateOverallRate(rates: any[], rateType: string): number {
    const totalUsers = rates.reduce((sum, dept) => sum + dept.totalUsers, 0);
    if (totalUsers === 0) return 0;

    const weightedSum = rates.reduce(
      (sum, dept) => sum + dept[rateType] * dept.totalUsers,
      0,
    );

    return weightedSum / totalUsers;
  }
}

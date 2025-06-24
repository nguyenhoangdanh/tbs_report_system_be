import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { CreateWeeklyReportDto, UpdateReportDto } from './dto/report.dto';
import { getCurrentWeek } from '../common/utils/date.utils';

@Injectable()
export class ReportsService {
  constructor(private prisma: PrismaService) {}

  async createWeeklyReport(
    userId: string,
    createReportDto: CreateWeeklyReportDto,
  ) {
    const { weekNumber, year, tasks } = createReportDto;

    // Validate week/year combination
    const { weekNumber: currentWeek, year: currentYear } = getCurrentWeek();
    const isValidWeek = this.isValidWeekForCreation(
      weekNumber,
      year,
      currentWeek,
      currentYear,
    );

    if (!isValidWeek) {
      throw new BadRequestException(
        'Chỉ có thể tạo báo cáo cho tuần trong khoảng thời gian cho phép',
      );
    }

    // Check if report already exists
    const existingReport = await this.prisma.report.findUnique({
      where: {
        weekNumber_year_userId: {
          weekNumber,
          year,
          userId,
        },
      },
    });

    if (existingReport) {
      throw new ConflictException('Báo cáo cho tuần này đã tồn tại');
    }

    // Validate: require reasonNotDone if not completed
    for (const task of tasks) {
      if (
        !task.isCompleted &&
        (!task.reasonNotDone || !task.reasonNotDone.trim())
      ) {
        throw new BadRequestException(
          'Lý do chưa hoàn thành là bắt buộc cho các công việc chưa hoàn thành',
        );
      }
    }

    // Create report with tasks
    const report = await this.prisma.report.create({
      data: {
        weekNumber,
        year,
        userId,
        isCompleted: this.checkIfReportCompleted(tasks),
        tasks: {
          create: tasks.map((task) => ({
            taskName: task.taskName,
            monday: task.monday || false,
            tuesday: task.tuesday || false,
            wednesday: task.wednesday || false,
            thursday: task.thursday || false,
            friday: task.friday || false,
            saturday: task.saturday || false,
            sunday: task.sunday || false,
            isCompleted: task.isCompleted || false,
            reasonNotDone: task.reasonNotDone,
          })),
        },
      },
      include: {
        tasks: true,
        user: {
          include: {
            office: true,
            jobPosition: {
              include: {
                department: {
                  include: {
                    office: true,
                  },
                },
                position: true,
              },
            },
          },
        },
      },
    });

    return report;
  }

  async updateReport(
    userId: string,
    reportId: string,
    updateReportDto: UpdateReportDto,
  ) {
    // Check if report exists and belongs to user
    const existingReport = await this.prisma.report.findFirst({
      where: { id: reportId, userId },
      include: { tasks: true },
    });

    if (!existingReport) {
      throw new NotFoundException('Report not found');
    }

    // Check if report is locked
    if (existingReport.isLocked) {
      throw new ForbiddenException('Cannot update locked report');
    }

    // Validate week edit permissions
    const { weekNumber: currentWeek, year: currentYear } = getCurrentWeek();
    const isValidForEdit = this.isValidWeekForEdit(
      existingReport.weekNumber,
      existingReport.year,
      currentWeek,
      currentYear,
    );
    if (!isValidForEdit) {
      throw new ForbiddenException(
        'Can only edit reports for current week, previous week, or next week',
      );
    }

    // Use transaction for atomic updates
    return this.prisma.$transaction(async (prisma) => {
      // Delete existing tasks if new tasks are provided
      if (updateReportDto.tasks) {
        // Validate: require reasonNotDone if not completed
        for (const task of updateReportDto.tasks) {
          if (
            !task.isCompleted &&
            (!task.reasonNotDone || !task.reasonNotDone.trim())
          ) {
            throw new BadRequestException(
              'Lý do chưa hoàn thành là bắt buộc cho các công việc chưa hoàn thành',
            );
          }
        }
        await prisma.reportTask.deleteMany({
          where: { reportId },
        });

        // Create new tasks
        if (updateReportDto.tasks.length > 0) {
          await prisma.reportTask.createMany({
            data: updateReportDto.tasks.map((task) => ({
              ...task,
              reportId,
            })),
          });
        }
      }

      // Update report with only provided fields (PATCH behavior)
      const updateData: any = {};
      if (updateReportDto.isCompleted !== undefined) {
        updateData.isCompleted = updateReportDto.isCompleted;
      }

      // Update the report
      const updatedReport = await prisma.report.update({
        where: { id: reportId },
        data: updateData,
        include: {
          tasks: true,
          user: {
            select: {
              id: true,
              employeeCode: true,
              firstName: true,
              lastName: true,
              email: true,
              role: true,
              jobPosition: {
                include: {
                  department: {
                    include: { office: true },
                  },
                  position: true,
                },
              },
              office: true,
            },
          },
        },
      });

      return updatedReport;
    });
  }

  async getMyReports(userId: string, page: number = 1, limit: number = 10) {
    const skip = (page - 1) * limit;

    const [reports, total] = await Promise.all([
      this.prisma.report.findMany({
        where: { userId },
        include: {
          tasks: true,
          user: {
            include: {
              jobPosition: {
                include: {
                  department: {
                    include: {
                      office: true,
                    },
                  },
                  position: true,
                },
              },
              office: true,
            },
          },
        },
        orderBy: [{ year: 'desc' }, { weekNumber: 'desc' }],
        skip,
        take: limit,
      }),
      this.prisma.report.count({
        where: { userId },
      }),
    ]);

    return {
      data: reports,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async getCurrentWeekReport(userId: string) {
    const { weekNumber, year } = getCurrentWeek();

    const report = await this.prisma.report.findUnique({
      where: {
        weekNumber_year_userId: {
          weekNumber,
          year,
          userId,
        },
      },
      include: {
        tasks: true,
        user: {
          include: {
            jobPosition: {
              include: {
                department: {
                  include: {
                    office: true,
                  },
                },
                position: true,
              },
            },
            office: true,
          },
        },
      },
    });

    return report;
  }

  async getReportById(id: string, userId: string) {
    const report = await this.prisma.report.findFirst({
      where: {
        id,
        userId, // Ensure user can only access their own reports
      },
      include: {
        tasks: true,
        user: {
          include: {
            jobPosition: {
              include: {
                department: {
                  include: {
                    office: true,
                  },
                },
                position: true,
              },
            },
            office: true,
          },
        },
      },
    });

    if (!report) {
      throw new NotFoundException('Không tìm thấy báo cáo');
    }

    return report;
  }

  async getReportByWeek(userId: string, weekNumber: number, year: number) {
    const report = await this.prisma.report.findUnique({
      where: {
        weekNumber_year_userId: {
          weekNumber,
          year,
          userId,
        },
      },
      include: {
        tasks: {
          orderBy: {
            createdAt: 'asc', // Ensure consistent task order
          },
        },
        user: {
          include: {
            jobPosition: {
              include: {
                department: {
                  include: {
                    office: true,
                  },
                },
                position: true,
              },
            },
            office: true,
          },
        },
      },
    });

    if (!report) {
      throw new NotFoundException(
        `Không tìm thấy báo cáo cho tuần ${weekNumber}/${year}`,
      );
    }

    return report;
  }

  // New method to delete individual task
  async deleteTask(userId: string, taskId: string) {
    // First, find the task and verify ownership
    const task = await this.prisma.reportTask.findFirst({
      where: {
        id: taskId,
        report: { userId }, // Ensure the task belongs to a report owned by the user
      },
      include: {
        report: true,
      },
    });

    if (!task) {
      throw new NotFoundException('Task not found or access denied');
    }

    // Check if the report is locked
    if (task.report.isLocked) {
      throw new ForbiddenException('Cannot delete task from locked report');
    }

    // Validate week edit permissions
    const { weekNumber: currentWeek, year: currentYear } = getCurrentWeek();
    const isValidForEdit = this.isValidWeekForEdit(
      task.report.weekNumber,
      task.report.year,
      currentWeek,
      currentYear,
    );
    if (!isValidForEdit) {
      throw new ForbiddenException(
        'Can only edit reports for current week, previous week, or next week',
      );
    }

    // Delete the task
    await this.prisma.reportTask.delete({
      where: { id: taskId },
    });

    return { message: 'Task deleted successfully' };
  }

  async deleteReport(reportId: string, userId: string): Promise<void> {
    // Find the report
    const report = await this.prisma.report.findUnique({
      where: { id: reportId },
      include: { user: true },
    });

    if (!report) {
      throw new NotFoundException('Báo cáo không tồn tại');
    }

    // Check ownership
    if (report.userId !== userId) {
      throw new ForbiddenException('Bạn không có quyền xóa báo cáo này');
    }

    // Check if report is locked
    if (report.isLocked) {
      throw new ForbiddenException('Không thể xóa báo cáo đã bị khóa');
    }

    // Check if week is still deletable
    const { weekNumber: currentWeek, year: currentYear } = getCurrentWeek();
    const isDeletableWeek = this.isValidWeekForEdit(
      report.weekNumber,
      report.year,
      currentWeek,
      currentYear,
    );

    if (!isDeletableWeek) {
      throw new ForbiddenException(
        'Chỉ có thể xóa báo cáo của tuần hiện tại và 1 tuần trước đó',
      );
    }

    // Delete the report (tasks will be deleted automatically due to cascade)
    await this.prisma.report.delete({
      where: { id: reportId },
    });
  }

  private isValidWeekForCreation(
    weekNumber: number,
    year: number,
    currentWeek: number,
    currentYear: number,
  ): boolean {
    // Can create for current week or next week
    const isCurrentWeek = weekNumber === currentWeek && year === currentYear;
    const isNextWeek = this.isNextWeek(
      weekNumber,
      year,
      currentWeek,
      currentYear,
    );

    return isCurrentWeek || isNextWeek;
  }

  private isValidWeekForEdit(
    weekNumber: number,
    year: number,
    currentWeek: number,
    currentYear: number,
  ): boolean {
    // Can edit current week, next week, or previous week
    const isCurrentWeek = weekNumber === currentWeek && year === currentYear;
    const isNextWeek = this.isNextWeek(
      weekNumber,
      year,
      currentWeek,
      currentYear,
    );
    const isPreviousWeek = this.isPreviousWeek(
      weekNumber,
      year,
      currentWeek,
      currentYear,
    );

    return isCurrentWeek || isNextWeek || isPreviousWeek;
  }

  private isNextWeek(
    weekNumber: number,
    year: number,
    currentWeek: number,
    currentYear: number,
  ): boolean {
    // Check if it's the next week
    if (year === currentYear) {
      return weekNumber === currentWeek + 1;
    }

    // Handle year transition (last week of year to first week of next year)
    if (year === currentYear + 1 && currentWeek >= 52 && weekNumber === 1) {
      return true;
    }

    return false;
  }

  private isPreviousWeek(
    weekNumber: number,
    year: number,
    currentWeek: number,
    currentYear: number,
  ): boolean {
    // Check if it's the previous week
    if (year === currentYear) {
      return weekNumber === currentWeek - 1;
    }

    // Handle year transition (first week of year to last week of previous year)
    if (year === currentYear - 1 && currentWeek === 1 && weekNumber >= 52) {
      return true;
    }

    return false;
  }

  private checkIfReportCompleted(tasks: any[]): boolean {
    if (!tasks || tasks.length === 0) {
      return false;
    }

    // Report is considered completed if all tasks are completed
    return tasks.every((task) => task.isCompleted === true);
  }

  // Admin methods
  async getAllReports(
    page: number = 1,
    limit: number = 10,
    departmentId?: string,
    weekNumber?: number,
    year?: number,
  ) {
    const skip = (page - 1) * limit;
    const where: any = {};

    if (departmentId) {
      where.user = {
        jobPosition: {
          departmentId,
        },
      };
    }

    if (weekNumber && year) {
      where.weekNumber = weekNumber;
      where.year = year;
    }

    const [reports, total] = await Promise.all([
      this.prisma.report.findMany({
        where,
        include: {
          tasks: true,
          user: {
            include: {
              jobPosition: {
                include: {
                  department: {
                    include: {
                      office: true,
                    },
                  },
                  position: true,
                },
              },
              office: true,
            },
          },
        },
        orderBy: [
          { year: 'desc' },
          { weekNumber: 'desc' },
          { createdAt: 'desc' },
        ],
        skip,
        take: limit,
      }),
      this.prisma.report.count({ where }),
    ]);

    return {
      data: reports,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async getReportStats(weekNumber?: number, year?: number) {
    const where: any = {};

    if (weekNumber && year) {
      where.weekNumber = weekNumber;
      where.year = year;
    }

    const [totalReports, completedReports, pendingReports] = await Promise.all([
      this.prisma.report.count({ where }),
      this.prisma.report.count({
        where: { ...where, isCompleted: true },
      }),
      this.prisma.report.count({
        where: { ...where, isCompleted: false },
      }),
    ]);

    return {
      totalReports,
      completedReports,
      pendingReports,
      completionRate:
        totalReports > 0
          ? Math.round((completedReports / totalReports) * 100)
          : 0,
    };
  }

  // Method for scheduled tasks
  async lockReportsForCurrentWeek() {
    const { weekNumber, year } = getCurrentWeek();

    // Lock reports from previous week (current week - 1)
    let prevWeekNumber = weekNumber - 1;
    let prevYear = year;

    if (prevWeekNumber === 0) {
      prevWeekNumber = 52; // Last week of previous year
      prevYear = year - 1;
    }

    const result = await this.prisma.report.updateMany({
      where: {
        weekNumber: prevWeekNumber,
        year: prevYear,
        isLocked: false,
      },
      data: {
        isLocked: true,
      },
    });
    return result;
  }

  async lockReportsByWeek(weekNumber: number, year: number) {
    const result = await this.prisma.report.updateMany({
      where: {
        weekNumber,
        year,
        isLocked: false,
      },
      data: {
        isLocked: true,
      },
    });

    return result;
  }

  // New method to update individual task
  async updateTask(userId: string, taskId: string, updateTaskDto: any) {
    // Find the task and verify ownership
    const task = await this.prisma.reportTask.findFirst({
      where: {
        id: taskId,
        report: { userId },
      },
      include: {
        report: true,
      },
    });

    if (!task) {
      throw new NotFoundException('Task not found or access denied');
    }

    // Check if the report is locked
    if (task.report.isLocked) {
      throw new ForbiddenException('Cannot update task in locked report');
    }

    // Validate week edit permissions
    const { weekNumber: currentWeek, year: currentYear } = getCurrentWeek();
    const isValidForEdit = this.isValidWeekForEdit(
      task.report.weekNumber,
      task.report.year,
      currentWeek,
      currentYear,
    );
    if (!isValidForEdit) {
      throw new ForbiddenException(
        'Can only edit reports for current week, previous week, or next week',
      );
    }

    // Validate: require reasonNotDone if not completed
    if (
      updateTaskDto.isCompleted === false &&
      (!updateTaskDto.reasonNotDone || !updateTaskDto.reasonNotDone.trim())
    ) {
      throw new BadRequestException(
        'Lý do chưa hoàn thành là bắt buộc cho các công việc chưa hoàn thành',
      );
    }

    // Only allow updating allowed fields
    const allowedFields = [
      'taskName',
      'monday',
      'tuesday',
      'wednesday',
      'thursday',
      'friday',
      'saturday',
      'sunday',
      'isCompleted',
      'reasonNotDone',
    ];
    const updateData: any = {};
    for (const key of allowedFields) {
      if (updateTaskDto[key] !== undefined) {
        updateData[key] = updateTaskDto[key];
      }
    }

    // Update the task
    const updatedTask = await this.prisma.reportTask.update({
      where: { id: taskId },
      data: updateData,
    });

    return updatedTask;
  }
}

import { 
  Injectable, 
  NotFoundException, 
  BadRequestException, 
  ForbiddenException, 
  ConflictException 
} from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { CreateReportDto } from './dto/create-report.dto';
import { UpdateReportDto } from './dto/update-report.dto';
import { Role } from '@prisma/client';

@Injectable()
export class ReportsService {
  constructor(private prisma: PrismaService) {}

  async create(userId: string, createReportDto: CreateReportDto) {
    const { weekNumber, year } = createReportDto;

    // Check if report already exists for this week
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
      throw new ConflictException('Report for this week already exists');
    }

    // Check if it's past the deadline (10 AM Saturday)
    const now = new Date();
    const currentWeek = this.getCurrentWeekNumber();
    const currentYear = now.getFullYear();

    if (year === currentYear && weekNumber === currentWeek) {
      const dayOfWeek = now.getDay(); // 0 = Sunday, 6 = Saturday
      const hour = now.getHours();

      if (dayOfWeek === 6 && hour >= 10) {
        throw new BadRequestException('Cannot create report after 10 AM on Saturday');
      }
    }

    // Create report with default tasks
    const report = await this.prisma.report.create({
      data: {
        weekNumber,
        year,
        userId,
      },
      include: {
        user: {
          include: {
            jobPosition: {
              include: {
                position: true,
                department: true,
              },
            },
          },
        },
        tasks: true,
      },
    });

    return report;
  }

  async findMyReports(userId: string) {
    return this.prisma.report.findMany({
      where: { userId },
      include: {
        user: {
          include: {
            jobPosition: {
              include: {
                position: true,
                department: true,
              },
            },
          },
        },
        tasks: true,
      },
      orderBy: [{ year: 'desc' }, { weekNumber: 'desc' }],
    });
  }

  async findMyReport(userId: string, weekNumber: number, year: number) {
    const report = await this.prisma.report.findUnique({
      where: {
        weekNumber_year_userId: {
          weekNumber,
          year,
          userId,
        },
      },
      include: {
        user: {
          include: {
            jobPosition: {
              include: {
                position: true,
                department: true,
              },
            },
          },
        },
        tasks: true,
      },
    });

    if (!report) {
      throw new NotFoundException('Report not found');
    }

    return report;
  }

  async update(userId: string, reportId: string, updateReportDto: UpdateReportDto) {
    const report = await this.prisma.report.findUnique({
      where: { id: reportId },
    });

    if (!report) {
      throw new NotFoundException('Report not found');
    }

    if (report.userId !== userId) {
      throw new ForbiddenException('You can only update your own reports');
    }

    if (report.isLocked) {
      throw new BadRequestException('Cannot update locked report');
    }

    // Update tasks if provided
    if (updateReportDto.tasks && updateReportDto.tasks.length > 0) {
      for (const task of updateReportDto.tasks) {
        if (task.id) {
          await this.prisma.reportTask.update({
            where: { id: task.id },
            data: {
              monday: task.monday,
              tuesday: task.tuesday,
              wednesday: task.wednesday,
              thursday: task.thursday,
              friday: task.friday,
              saturday: task.saturday,
              sunday: task.sunday,
              isCompleted: task.isCompleted,
              reasonNotDone: task.reasonNotDone,
            },
          });
        }
      }
    }

    // Update report completion status
    const updatedReport = await this.prisma.report.update({
      where: { id: reportId },
      data: {
        isCompleted: updateReportDto.isCompleted,
      },
      include: {
        user: {
          include: {
            jobPosition: {
              include: {
                position: true,
                department: true,
              },
            },
          },
        },
        tasks: true,
      },
    });

    return updatedReport;
  }

  async remove(userId: string, reportId: string) {
    const report = await this.prisma.report.findUnique({
      where: { id: reportId },
    });

    if (!report) {
      throw new NotFoundException('Report not found');
    }

    if (report.userId !== userId) {
      throw new ForbiddenException('You can only delete your own reports');
    }

    if (report.isLocked) {
      throw new BadRequestException('Cannot delete locked report');
    }

    return this.prisma.report.delete({
      where: { id: reportId },
    });
  }

  async findReportsByDepartment(departmentId: string, weekNumber?: number, year?: number) {
    const currentWeek = this.getCurrentWeekNumber();
    const currentYear = new Date().getFullYear();

    return this.prisma.report.findMany({
      where: {
        ...(weekNumber && { weekNumber }),
        ...(year && { year }),
        ...(!weekNumber && { weekNumber: currentWeek }),
        ...(!year && { year: currentYear }),
        user: {
          jobPosition: {
            departmentId,
          },
        },
      },
      include: {
        user: {
          include: {
            jobPosition: {
              include: {
                position: true,
                department: true,
              },
            },
          },
        },
        tasks: true,
      },
      orderBy: [
        { user: { jobPosition: { department: { name: 'asc' } } } },
        { user: { lastName: 'asc' } },
        { user: { firstName: 'asc' } },
      ],
    });
  }

  async findReportsByOffice(officeId: string, weekNumber?: number, year?: number) {
    const currentWeek = this.getCurrentWeekNumber();
    const currentYear = new Date().getFullYear();

    return this.prisma.report.findMany({
      where: {
        ...(weekNumber && { weekNumber }),
        ...(year && { year }),
        ...(!weekNumber && { weekNumber: currentWeek }),
        ...(!year && { year: currentYear }),
        user: {
          officeId,
        },
      },
      include: {
        user: {
          include: {
            jobPosition: {
              include: {
                position: true,
                department: true,
              },
            },
          },
        },
        tasks: true,
      },
      orderBy: [
        { user: { jobPosition: { department: { name: 'asc' } } } },
        { user: { lastName: 'asc' } },
        { user: { firstName: 'asc' } },
      ],
    });
  }

  async getReportsStatistics(weekNumber?: number, year?: number) {
    const currentWeek = this.getCurrentWeekNumber();
    const currentYear = new Date().getFullYear();
    const targetWeek = weekNumber || currentWeek;
    const targetYear = year || currentYear;

    // Get departments with users who have reports
    const departments = await this.prisma.department.findMany({
      include: {
        office: true,
        jobPositions: {
          include: {
            users: {
              include: {
                reports: {
                  where: {
                    weekNumber: targetWeek,
                    year: targetYear,
                  },
                },
              },
            },
          },
        },
      },
    });

    return departments.map(dept => {
      const allUsers = dept.jobPositions.flatMap(jp => jp.users);
      const totalDeptUsers = allUsers.length;
      const usersWithReportsInDept = allUsers.filter(user => user.reports.length > 0).length;
      const completedReports = allUsers.reduce((acc, user) => {
        return acc + user.reports.filter(report => report.isCompleted).length;
      }, 0);

      return {
        departmentId: dept.id,
        departmentName: dept.name,
        office: dept.office.name,
        totalUsers: totalDeptUsers,
        submittedReports: usersWithReportsInDept,
        completedReports,
        submissionRate: totalDeptUsers > 0 ? (usersWithReportsInDept / totalDeptUsers) * 100 : 0,
        completionRate: totalDeptUsers > 0 ? (completedReports / totalDeptUsers) * 100 : 0,
      };
    });
  }

  async getUsersWithoutReports(weekNumber?: number, year?: number) {
    const currentWeek = this.getCurrentWeekNumber();
    const currentYear = new Date().getFullYear();
    const targetWeek = weekNumber || currentWeek;
    const targetYear = year || currentYear;

    return this.prisma.user.findMany({
      where: {
        isActive: true,
        reports: {
          none: {
            weekNumber: targetWeek,
            year: targetYear,
          },
        },
      },
      include: {
        jobPosition: {
          include: {
            position: true,
            department: true,
          },
        },
      },
    });
  }

  private getCurrentWeekNumber(): number {
    const now = new Date();
    const firstDayOfYear = new Date(now.getFullYear(), 0, 1);
    const pastDaysOfYear = (now.getTime() - firstDayOfYear.getTime()) / 86400000;
    return Math.ceil((pastDaysOfYear + firstDayOfYear.getDay() + 1) / 7);
  }

  async lockReportsForCurrentWeek() {
    const now = new Date();
    const currentWeek = this.getCurrentWeekNumber();
    const currentYear = now.getFullYear();

    // Lock all reports for the current week
    const result = await this.prisma.report.updateMany({
      where: {
        weekNumber: currentWeek,
        year: currentYear,
        isLocked: false,
      },
      data: {
        isLocked: true,
      },
    });

    console.log(`🔒 Locked ${result.count} reports for week ${currentWeek}, ${currentYear}`);
    return result;
  }

  async findAllReports(weekNumber?: number, year?: number) {
    const currentWeek = this.getCurrentWeekNumber();
    const currentYear = new Date().getFullYear();

    return this.prisma.report.findMany({
      where: {
        ...(weekNumber && { weekNumber }),
        ...(year && { year }),
        ...(!weekNumber && { weekNumber: currentWeek }),
        ...(!year && { year: currentYear }),
      },
      include: {
        user: {
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
        },
        tasks: true,
      },
      orderBy: [
        { user: { jobPosition: { department: { name: 'asc' } } } },
        { user: { lastName: 'asc' } },
        { user: { firstName: 'asc' } },
      ],
    });
  }
}

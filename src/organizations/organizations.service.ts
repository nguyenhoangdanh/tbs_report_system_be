import { Injectable } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';

@Injectable()
export class OrganizationsService {
  constructor(private prisma: PrismaService) {}

  async getAllOffices() {
    return this.prisma.office.findMany({
      orderBy: { name: 'asc' },
      select: {
        id: true,
        name: true,
        type: true,
        description: true,
      },
    });
  }

  async getAllDepartments() {
    return this.prisma.department.findMany({
      include: {
        office: {
          select: {
            id: true,
            name: true,
            type: true,
          },
        },
      },
      orderBy: [{ office: { name: 'asc' } }, { name: 'asc' }],
    });
  }

  async getAllPositions() {
    return this.prisma.position.findMany({
      orderBy: { name: 'asc' },
      select: {
        id: true,
        name: true,
        description: true,
      },
    });
  }

  async getAllJobPositions() {
    return this.prisma.jobPosition.findMany({
      where: { isActive: true },
      include: {
        position: {
          select: {
            id: true,
            name: true,
          },
        },
        department: {
          select: {
            id: true,
            name: true,
            officeId: true,
            office: {
              select: {
                id: true,
                name: true,
                type: true,
              },
            },
          },
        },
      },
      orderBy: [
        { department: { office: { name: 'asc' } } },
        { department: { name: 'asc' } },
        { position: { name: 'asc' } },
        { jobName: 'asc' },
      ],
    });
  }
}

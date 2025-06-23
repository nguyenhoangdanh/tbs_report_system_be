import { PrismaClient, Role, OfficeType } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Starting seed...');

  // Clear existing data
  await prisma.reportTask.deleteMany();
  await prisma.report.deleteMany();
  await prisma.user.deleteMany();
  await prisma.jobPosition.deleteMany();
  await prisma.position.deleteMany();
  await prisma.department.deleteMany();
  await prisma.office.deleteMany();

  // Hash password for all users
  const hashedPassword = await bcrypt.hash('123456', 10);

  // 1. Create Offices
  const headOffice = await prisma.office.create({
    data: {
      name: 'Văn phòng điều hành tổng',
      type: OfficeType.HEAD_OFFICE,
      description: 'Văn phòng chính của công ty',
    },
  });

  const factory1 = await prisma.office.create({
    data: {
      name: 'Nhà máy sản xuất 1',
      type: OfficeType.FACTORY_OFFICE,
      description: 'Nhà máy sản xuất khu vực miền Bắc',
    },
  });

  const factory2 = await prisma.office.create({
    data: {
      name: 'Nhà máy sản xuất 2',
      type: OfficeType.FACTORY_OFFICE,
      description: 'Nhà máy sản xuất khu vực miền Trung',
    },
  });

  const factory3 = await prisma.office.create({
    data: {
      name: 'Nhà máy sản xuất 3',
      type: OfficeType.FACTORY_OFFICE,
      description: 'Nhà máy sản xuất khu vực miền Nam',
    },
  });

  // 2. Create Departments
  const departments = [];

  // Head Office departments
  const headOfficeDepts = [
    { name: 'Phòng Nhân sự', description: 'Quản lý nhân lực toàn công ty' },
    { name: 'Phòng Tài chính', description: 'Quản lý tài chính và kế toán' },
    { name: 'Phòng CNTT', description: 'Công nghệ thông tin và hệ thống' },
    { name: 'Phòng Kinh doanh', description: 'Bán hàng và marketing' },
    { name: 'Ban Giám đốc', description: 'Lãnh đạo cao cấp công ty' },
  ];

  for (const dept of headOfficeDepts) {
    const department = await prisma.department.create({
      data: {
        name: dept.name,
        description: dept.description,
        officeId: headOffice.id,
      },
    });
    departments.push(department);
  }

  // Factory departments
  const factoryDepts = [
    { name: 'Phòng Sản xuất', description: 'Quản lý dây chuyền sản xuất' },
    { name: 'Phòng Kỹ thuật', description: 'Bảo trì và kỹ thuật thiết bị' },
    { name: 'Phòng Chất lượng', description: 'Kiểm soát chất lượng sản phẩm' },
    { name: 'Phòng Kho vận', description: 'Quản lý kho bãi và vận chuyển' },
  ];

  for (const factory of [factory1, factory2, factory3]) {
    for (const dept of factoryDepts) {
      const department = await prisma.department.create({
        data: {
          name: dept.name,
          description: dept.description,
          officeId: factory.id,
        },
      });
      departments.push(department);
    }
  }

  // 3. Create Positions
  const positions = [];
  const positionData = [
    { name: 'Giám đốc', description: 'Lãnh đạo cao nhất' },
    { name: 'Phó Giám đốc', description: 'Lãnh đạo cấp cao' },
    { name: 'Trưởng phòng', description: 'Quản lý phòng ban' },
    { name: 'Phó trưởng phòng', description: 'Hỗ trợ trưởng phòng' },
    { name: 'Trưởng ca', description: 'Quản lý ca làm việc' },
    { name: 'Trợ lý Line', description: 'Hỗ trợ dây chuyền sản xuất' },
    { name: 'Nhân viên', description: 'Nhân viên thực hiện công việc' },
    { name: 'Thực tập sinh', description: 'Sinh viên thực tập' },
  ];

  for (const pos of positionData) {
    const position = await prisma.position.create({
      data: {
        name: pos.name,
        description: pos.description,
      },
    });
    positions.push(position);
  }

  // 4. Create Job Positions
  const jobPositions = [];

  // Define job names for each department type
  const jobMapping = {
    'Ban Giám đốc': ['Điều hành công ty', 'Quản lý chiến lược'],
    'Phòng Nhân sự': ['Tuyển dụng', 'Đào tạo nhân viên', 'Quản lý lương'],
    'Phòng Tài chính': [
      'Kế toán tổng hợp',
      'Quản lý ngân quỹ',
      'Kiểm toán nội bộ',
    ],
    'Phòng CNTT': [
      'Phát triển phần mềm',
      'Quản lý hệ thống',
      'Hỗ trợ kỹ thuật',
    ],
    'Phòng Kinh doanh': ['Bán hàng', 'Marketing', 'Chăm sóc khách hàng'],
    'Phòng Sản xuất': [
      'Vận hành máy móc',
      'Kiểm tra sản phẩm',
      'Quản lý dây chuyền',
    ],
    'Phòng Kỹ thuật': [
      'Bảo trì thiết bị',
      'Sửa chữa máy móc',
      'Lắp đặt thiết bị',
    ],
    'Phòng Chất lượng': [
      'Kiểm tra chất lượng',
      'Thử nghiệm sản phẩm',
      'Đánh giá quy trình',
    ],
    'Phòng Kho vận': ['Quản lý kho', 'Vận chuyển hàng hóa', 'Kiểm kê tồn kho'],
  };

  for (const department of departments) {
    const jobs = jobMapping[department.name] || ['Công việc chung'];

    for (const jobName of jobs) {
      // Create job positions for different levels
      const relevantPositions = positions.filter((pos) => {
        if (department.name === 'Ban Giám đốc') {
          return ['Giám đốc', 'Phó Giám đốc'].includes(pos.name);
        }
        return !['Giám đốc', 'Phó Giám đốc'].includes(pos.name);
      });

      for (const position of relevantPositions) {
        const code = `${position.name.substring(0, 2).toUpperCase()}_${department.name.replace('Phòng ', '').substring(0, 4).toUpperCase()}_${jobName.substring(0, 4).toUpperCase()}`;

        const jobPosition = await prisma.jobPosition.create({
          data: {
            jobName,
            code,
            description: `${position.name} - ${jobName} tại ${department.name}`,
            positionId: position.id,
            departmentId: department.id,
          },
        });
        jobPositions.push(jobPosition);
      }
    }
  }

  // 5. Create Users
  const users = [];

  // Create superadmin (CEO)
  const ceoJobPosition = jobPositions.find(
    (jp) =>
      jp.code.startsWith('GI_') &&
      departments.find((d) => d.id === jp.departmentId)?.name ===
        'Ban Giám đốc',
  );

  const superadmin = await prisma.user.create({
    data: {
      employeeCode: 'CEO001',
      email: 'ceo@company.com',
      password: hashedPassword,
      firstName: 'Nguyễn',
      lastName: 'Văn CEO',
      cardId: '012345678901',
      role: Role.SUPERADMIN,
      jobPositionId: ceoJobPosition!.id,
      officeId: headOffice.id,
    },
  });
  users.push(superadmin);

  // Create admins (one for each office)
  const offices = [headOffice, factory1, factory2, factory3];
  for (let i = 0; i < offices.length; i++) {
    const office = offices[i];
    const adminDept = departments.find((d) => d.officeId === office.id);
    const adminJobPosition = jobPositions.find(
      (jp) => jp.departmentId === adminDept?.id && jp.code.includes('TR_'),
    );

    if (adminJobPosition) {
      const admin = await prisma.user.create({
        data: {
          employeeCode: `ADM${String(i + 1).padStart(3, '0')}`,
          email: `admin${i + 1}@company.com`,
          password: hashedPassword,
          firstName: 'Trần',
          lastName: `Văn Admin${i + 1}`,
          cardId: `01234567890${i + 2}`,
          role: Role.ADMIN,
          jobPositionId: adminJobPosition.id,
          officeId: office.id,
        },
      });
      users.push(admin);
    }
  }

  // Create regular users
  for (let i = 0; i < 20; i++) {
    const randomOffice = offices[Math.floor(Math.random() * offices.length)];
    const officeDepts = departments.filter(
      (d) => d.officeId === randomOffice.id,
    );
    const randomDept =
      officeDepts[Math.floor(Math.random() * officeDepts.length)];
    const deptJobPositions = jobPositions.filter(
      (jp) => jp.departmentId === randomDept.id && !jp.code.includes('GI_'),
    );
    const randomJobPosition =
      deptJobPositions[Math.floor(Math.random() * deptJobPositions.length)];

    if (randomJobPosition) {
      const user = await prisma.user.create({
        data: {
          employeeCode: `EMP${String(i + 1).padStart(3, '0')}`,
          email: `user${i + 1}@company.com`,
          password: hashedPassword,
          firstName: ['Nguyễn', 'Trần', 'Lê', 'Phạm', 'Hoàng'][
            Math.floor(Math.random() * 5)
          ],
          lastName: `Văn User${i + 1}`,
          cardId:
            i % 3 === 0
              ? `${String(Math.floor(Math.random() * 900000000000) + 100000000000)}`
              : null, // Some users have cardId, some don't
          role: Role.USER,
          jobPositionId: randomJobPosition.id,
          officeId: randomOffice.id,
        },
      });
      users.push(user);
    }
  }

  // 6. Create Sample Reports and Tasks
  const currentYear = new Date().getFullYear();
  const currentWeek = getWeekNumber(new Date());

  // Standard task list for weekly reports
  const standardTasks = [
    'Hoàn thành công việc được giao',
    'Tham gia họp phòng ban',
    'Cập nhật tiến độ dự án',
    'Kiểm tra và báo cáo chất lượng',
    'Hỗ trợ đồng nghiệp khi cần',
    'Học tập và nâng cao kỹ năng',
    'Tuân thủ quy định an toàn',
    'Báo cáo sự cố (nếu có)',
    'Tham gia đào tạo',
    'Đề xuất cải tiến quy trình',
    'Hoàn thành báo cáo tuần',
  ];

  // Create reports for the last 4 weeks for some users
  const sampleUsers = users.slice(0, 10); // Take first 10 users for sample reports

  for (const user of sampleUsers) {
    for (let weekOffset = 3; weekOffset >= 0; weekOffset--) {
      const weekNum = Math.max(1, currentWeek - weekOffset);
      const year = weekNum <= currentWeek ? currentYear : currentYear - 1;

      const report = await prisma.report.create({
        data: {
          weekNumber: weekNum,
          year: year,
          userId: user.id,
          isCompleted: weekOffset > 0 ? Math.random() > 0.3 : false,
          isLocked: weekOffset > 1,
        },
      });

      // Create tasks for each report
      for (const taskName of standardTasks) {
        await prisma.reportTask.create({
          data: {
            reportId: report.id,
            taskName,
            monday: Math.random() > 0.2,
            tuesday: Math.random() > 0.2,
            wednesday: Math.random() > 0.2,
            thursday: Math.random() > 0.2,
            friday: Math.random() > 0.2,
            saturday: Math.random() > 0.5,
            sunday: Math.random() > 0.7,
            isCompleted: Math.random() > 0.3,
            reasonNotDone:
              Math.random() > 0.7 ? 'Chưa có thời gian hoàn thành' : null,
          },
        });
      }
    }
  }

  console.log('✅ Seed completed successfully!');
  console.log(`📊 Created:`);
  console.log(`  - ${offices.length} offices`);
  console.log(`  - ${departments.length} departments`);
  console.log(`  - ${positions.length} positions`);
  console.log(`  - ${jobPositions.length} job positions`);
  console.log(`  - ${users.length} users`);
  console.log(`📧 Login credentials:`);
  console.log(`  - Superadmin: CEO001 / 123456 (email: ceo@company.com)`);
  console.log(`  - Admin: ADM001 / 123456 (email: admin1@company.com)`);
  console.log(`  - User: EMP001 / 123456 (email: user1@company.com)`);
}

function getWeekNumber(date: Date): number {
  const firstDayOfYear = new Date(date.getFullYear(), 0, 1);
  const pastDaysOfYear = (date.getTime() - firstDayOfYear.getTime()) / 86400000;
  return Math.ceil((pastDaysOfYear + firstDayOfYear.getDay() + 1) / 7);
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

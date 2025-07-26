import { PrismaClient, Role, OfficeType } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: process.env.DATABASE_URL,
    },
  },
  log: ['error', 'warn'],
});

async function createDefaultAdmin() {
  try {
    console.log('👤 Creating default admin account...');
    
    // Check if admin already exists
    const existingAdmin = await prisma.user.findFirst({
      where: {
        OR: [
          { employeeCode: 'ADMIN001' },
          { email: 'admin@tbsgroup.vn' },
          { role: Role.SUPERADMIN },
        ],
      },
    });

    if (existingAdmin) {
      console.log('⚠️  Admin account already exists:');
      console.log(`   Employee Code: ${existingAdmin.employeeCode}`);
      console.log(`   Email: ${existingAdmin.email}`);
      console.log(`   Role: ${existingAdmin.role}`);
      return existingAdmin;
    }

    // Create office first
    const office = await prisma.office.upsert({
      where: { name: 'VP Điều Hành' },
      update: {},
      create: {
        name: 'VP Điều Hành',
        type: OfficeType.HEAD_OFFICE,
        description: 'Văn phòng điều hành chính',
      },
    });

    // Create department
    const department = await prisma.department.upsert({
      where: {
        name_officeId: {
          name: 'Ban Giám Đốc',
          officeId: office.id,
        },
      },
      update: {},
      create: {
        name: 'Ban Giám Đốc',
        description: 'Ban Giám Đốc Điều Hành',
        officeId: office.id,
      },
    });

    // Create position
    const position = await prisma.position.upsert({
      where: { name: 'TGĐ' },
      update: {},
      create: {
        name: 'TGĐ',
        description: 'Tổng Giám Đốc',
        level: 0,
        priority: 0,
        isManagement: true,
        isReportable: false, // CEO không cần nộp báo cáo
        canViewHierarchy: true,
      },
    });

    // Create job position
    const jobPosition = await prisma.jobPosition.upsert({
      where: {
        positionId_jobName_departmentId: {
          positionId: position.id,
          jobName: 'Tổng Giám Đốc',
          departmentId: department.id,
        },
      },
      update: {},
      create: {
        jobName: 'Tổng Giám Đốc',
        code: 'TGD_BGD',
        description: 'Tổng Giám Đốc - Ban Giám Đốc',
        positionId: position.id,
        departmentId: department.id,
        officeId: office.id,
      },
    });

    // Hash password
    const hashedPassword = await bcrypt.hash('admin123456', 10);

    // Create admin user
    const admin = await prisma.user.create({
      data: {
        employeeCode: 'ADMIN001',
        email: 'admin@tbsgroup.vn',
        password: hashedPassword,
        firstName: 'Admin',
        lastName: 'System',
        phone: '0123456789',
        role: Role.SUPERADMIN,
        isActive: true,
        jobPositionId: jobPosition.id,
        officeId: office.id,
      },
    });

    console.log('✅ Default admin account created successfully:');
    console.log(`   Employee Code: ${admin.employeeCode}`);
    console.log(`   Email: ${admin.email}`);
    console.log(`   Password: admin123456`);
    console.log(`   Role: ${admin.role}`);
    console.log(`   Name: ${admin.firstName} ${admin.lastName}`);

    return admin;

  } catch (error) {
    console.error('❌ Failed to create admin account:', error.message);
    throw error;
  }
}

async function createSampleData() {
  try {
    console.log('📊 Creating sample organizational data...');

    // Create additional office
    const factory = await prisma.office.upsert({
      where: { name: 'Nhà máy sản xuất' },
      update: {},
      create: {
        name: 'Nhà máy sản xuất',
        type: OfficeType.FACTORY_OFFICE,
        description: 'Nhà máy sản xuất chính',
      },
    });

    // Create sample positions
    const positions = [
      { name: 'GĐ', description: 'Giám Đốc', level: 1, isManagement: true, canViewHierarchy: true, isReportable: true },
      { name: 'PGĐ', description: 'Phó Giám Đốc', level: 2, isManagement: true, canViewHierarchy: true, isReportable: true },
      { name: 'TP', description: 'Trưởng Phòng', level: 3, isManagement: true, canViewHierarchy: true, isReportable: true },
      { name: 'NV', description: 'Nhân viên', level: 10, isManagement: false, canViewHierarchy: false, isReportable: true },
    ];

    for (const pos of positions) {
      await prisma.position.upsert({
        where: { name: pos.name },
        update: {},
        create: {
          name: pos.name,
          description: pos.description,
          level: pos.level,
          priority: 0,
          isManagement: pos.isManagement,
          isReportable: pos.isReportable,
          canViewHierarchy: pos.canViewHierarchy,
        },
      });
    }

    console.log('✅ Sample data created successfully');

  } catch (error) {
    console.error('❌ Failed to create sample data:', error.message);
    throw error;
  }
}

async function main() {
  try {
    console.log('🌱 Starting database seeding...');
    console.log('===============================');

    // Test connection
    await prisma.$connect();
    console.log('✅ Database connected');

    // Create admin account
    await createDefaultAdmin();

    // Create sample organizational data
    await createSampleData();

    console.log('\n🎉 Database seeding completed successfully!');
    console.log('\n📋 Summary:');
    console.log('   ✅ Default admin account created');
    console.log('   ✅ Basic organizational structure created');
    console.log('   ✅ Sample positions created');
    
    console.log('\n🔐 Admin Login Credentials:');
    console.log('   Email: admin@tbsgroup.vn');
    console.log('   Password: admin123456');
    console.log('   Employee Code: ADMIN001');

  } catch (error) {
    console.error('\n❌ Seeding failed:', error.message);
    console.error('Stack trace:', error.stack);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();

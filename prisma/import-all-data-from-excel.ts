import { PrismaClient, Role, OfficeType } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import * as XLSX from 'xlsx';
import * as path from 'path';

// Get database URL with fallback
const getDatabaseUrl = () => {
  const dbUrl = process.env.DATABASE_URL;
  if (dbUrl) {
    console.log('📡 Using DATABASE_URL from environment');
    console.log(`📍 Environment: ${process.env.NODE_ENV || 'unknown'}`);
    return dbUrl;
  }
  
  // Fallback for local development
  const fallbackUrl = 'postgresql://postgres:password@localhost:5433/weekly_report_dev';
  console.log('📡 Using fallback DATABASE_URL for local development');
  return fallbackUrl;
};

// Initialize PrismaClient with explicit database URL
const prisma = new PrismaClient({
  datasources: {
    db: {
      url: getDatabaseUrl()
    }
  },
  log: ['error', 'warn']
});

interface ExcelRow {
  msnv: string;    // Mã số nhân viên (A)
  hoTen: string;   // Họ và tên (B)
  cd: string;      // Chức danh (C)
  vt: string;      // Vị trí công việc (D)
  pb: string;      // Phòng ban (E)
  tt: string;      // Trực thuộc (F)
  phone?: string;   // Phone (G)
}

interface ProcessedData {
  offices: Set<string>;
  departments: Map<string, { name: string; office: string }>;
  positions: Set<string>;
  jobPositions: Map<string, { cd: string; vt: string; pb: string; tt: string }>;
  users: ExcelRow[];
}

async function testConnection(): Promise<boolean> {
  try {
    console.log('🔍 Testing database connection...');
    await prisma.$connect();
    await prisma.$queryRaw`SELECT 1 as test`;
    console.log('✅ Database connection successful');
    return true;
  } catch (error) {
    console.error('❌ Database connection failed:', error.message);
    return false;
  }
}

async function processExcelData(): Promise<ProcessedData> {
  console.log('📊 Processing Excel data...');
  
  const excelPath = path.join(__dirname, 'data.xlsx');
  
  try {
    const workbook = XLSX.readFile(excelPath);
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const rows: any[] = XLSX.utils.sheet_to_json(sheet, { header: 1 });

    const processed: ProcessedData = {
      offices: new Set<string>(),
      departments: new Map<string, { name: string; office: string }>(),
      positions: new Set<string>(),
      jobPositions: new Map<string, { cd: string; vt: string; pb: string; tt: string }>(),
      users: []
    };

    // Skip header row (first row is header)
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      if (!row || !row[0] || !row[1] || !row[2] || !row[3] || !row[4] || !row[5]) {
        console.warn(`⚠️  Row ${i + 1}: Missing required data, skipping...`);
        continue;
      }

      const msnv = String(row[0]).trim(); // MSNV (A)
      const hoTen = String(row[1]).trim(); // HỌ VÀ TÊN (B)
      const cd = String(row[2]).trim(); // CD (C)
      const vt = String(row[3]).trim(); // VTCV (D)
      const pb = String(row[4]).trim(); // PHÒNG BAN (E)
      const tt = String(row[5]).trim(); // TRỰC THUỘC (F)
      const phone = row[6] ? String(row[6]).trim() : undefined; // PHONE (G)

      if (!msnv || !hoTen || !cd || !vt || !pb || !tt) {
        console.warn(`⚠️  Row ${i + 1}: Empty values detected, skipping...`);
        continue;
      }

      // Collect unique offices
      processed.offices.add(tt);

      // Collect unique departments (unique by name + office)
      const deptKey = `${pb}__${tt}`;
      if (!processed.departments.has(deptKey)) {
        processed.departments.set(deptKey, { name: pb, office: tt });
      }

      // Collect unique positions
      processed.positions.add(cd);

      // Collect unique job positions (unique by all 4 fields)
      const jobKey = `${cd}__${vt}__${pb}__${tt}`;
      if (!processed.jobPositions.has(jobKey)) {
        processed.jobPositions.set(jobKey, { cd, vt, pb, tt });
      }

      // Store for user creation
      processed.users.push({ msnv, hoTen, cd, vt, pb, tt, phone });
    }

    console.log(`📈 Data summary:`);
    console.log(`   - Offices: ${processed.offices.size}`);
    console.log(`   - Departments: ${processed.departments.size}`);
    console.log(`   - Positions: ${processed.positions.size}`);
    console.log(`   - Job Positions: ${processed.jobPositions.size}`);
    console.log(`   - Users to create: ${processed.users.length}`);

    return processed;
  } catch (error) {
    console.error('❌ Failed to read Excel file:', error.message);
    throw error;
  }
}

async function createOffices(offices: Set<string>): Promise<Map<string, any>> {
  console.log('\n🏢 Creating/updating offices...');
  const officeMap = new Map<string, any>();

  for (const officeName of offices) {
    try {
      // Determine office type based on name
      const officeType = officeName.includes('VP') || officeName.includes('Văn phòng') 
        ? OfficeType.HEAD_OFFICE 
        : OfficeType.FACTORY_OFFICE;

      const office = await prisma.office.upsert({
        where: { name: officeName },
        update: {
          type: officeType,
          description: `${officeName} - ${officeType === OfficeType.HEAD_OFFICE ? 'Văn phòng điều hành' : 'Nhà máy sản xuất'}`,
        },
        create: {
          name: officeName,
          type: officeType,
          description: `${officeName} - ${officeType === OfficeType.HEAD_OFFICE ? 'Văn phòng điều hành' : 'Nhà máy sản xuất'}`,
        },
      });

      officeMap.set(officeName, office);
      console.log(`   ✅ ${officeName} (${officeType})`);
    } catch (error) {
      console.error(`   ❌ Failed to create office ${officeName}:`, error.message);
    }
  }

  return officeMap;
}

async function createDepartments(
  departments: Map<string, { name: string; office: string }>, 
  officeMap: Map<string, any>
): Promise<Map<string, any>> {
  console.log('\n🏬 Creating/updating departments...');
  const departmentMap = new Map<string, any>();

  for (const [deptKey, dept] of departments) {
    try {
      const office = officeMap.get(dept.office);
      if (!office) {
        console.warn(`   ⚠️  Office not found for department: ${dept.name} (${dept.office})`);
        continue;
      }

      const department = await prisma.department.upsert({
        where: {
          name_officeId: {
            name: dept.name,
            officeId: office.id,
          }
        },
        update: {
          description: `Phòng ban ${dept.name} thuộc ${dept.office}`,
        },
        create: {
          name: dept.name,
          description: `Phòng ban ${dept.name} thuộc ${dept.office}`,
          officeId: office.id,
        },
      });

      departmentMap.set(deptKey, department);
      console.log(`   ✅ ${dept.name} (${dept.office})`);
    } catch (error) {
      console.error(`   ❌ Failed to create department ${dept.name}:`, error.message);
    }
  }

  return departmentMap;
}

async function createPositions(positions: Set<string>): Promise<Map<string, any>> {
  console.log('\n👔 Creating/updating positions...');
  const positionMap = new Map<string, any>();

  for (const positionName of positions) {
    try {
      const position = await prisma.position.upsert({
        where: { name: positionName },
        update: {
          description: `Chức danh ${positionName}`,
        },
        create: {
          name: positionName,
          description: `Chức danh ${positionName}`,
        },
      });

      positionMap.set(positionName, position);
      console.log(`   ✅ ${positionName}`);
    } catch (error) {
      console.error(`   ❌ Failed to create position ${positionName}:`, error.message);
    }
  }

  return positionMap;
}

async function createJobPositions(
  jobPositions: Map<string, { cd: string; vt: string; pb: string; tt: string }>,
  positionMap: Map<string, any>,
  departmentMap: Map<string, any>
): Promise<Map<string, any>> {
  console.log('\n💼 Creating/updating job positions...');
  const jobPositionMap = new Map<string, any>();

  for (const [jobKey, jp] of jobPositions) {
    try {
      const position = positionMap.get(jp.cd);
      const department = departmentMap.get(`${jp.pb}__${jp.tt}`);

      if (!position) {
        console.warn(`   ⚠️  Position not found: ${jp.cd} for job ${jp.vt}`);
        continue;
      }

      if (!department) {
        console.warn(`   ⚠️  Department not found: ${jp.pb} (${jp.tt}) for job ${jp.vt}`);
        continue;
      }

      // Generate unique code
      const code = `${jp.cd.replace(/\s+/g, '').toUpperCase()}_${jp.vt.replace(/\s+/g, '').toUpperCase()}_${jp.pb.replace(/\s+/g, '').toUpperCase()}`;

      const jobPosition = await prisma.jobPosition.upsert({
        where: {
          positionId_jobName_departmentId: {
            positionId: position.id,
            jobName: jp.vt,
            departmentId: department.id,
          }
        },
        update: {
          code: code,
          description: `${jp.cd} - ${jp.vt} tại ${jp.pb} (${jp.tt})`,
        },
        create: {
          jobName: jp.vt,
          code: code,
          description: `${jp.cd} - ${jp.vt} tại ${jp.pb} (${jp.tt})`,
          positionId: position.id,
          departmentId: department.id,
        },
      });

      jobPositionMap.set(jobKey, jobPosition);
      console.log(`   ✅ ${jp.vt} (${jp.cd} - ${jp.pb})`);
    } catch (error) {
      console.error(`   ❌ Failed to create job position ${jp.vt}:`, error.message);
    }
  }

  return jobPositionMap;
}

async function createUsers(
  users: ExcelRow[],
  jobPositionMap: Map<string, any>,
  officeMap: Map<string, any>
): Promise<void> {
  console.log('\n👥 Creating users...');
  
  const hashedPassword = await bcrypt.hash('123456', 10);
  let successCount = 0;
  let errorCount = 0;
  let skipCount = 0;

  for (let i = 0; i < users.length; i++) {
    const userData = users[i];
    
    try {
      // Use real data from Excel
      const employeeCode = userData.msnv;
      const fullName = userData.hoTen;
      const phone = userData.phone || '';
      const email = `${employeeCode.toLowerCase()}@company.com`;

      // Check if user already exists
      const existingUser = await prisma.user.findFirst({
        where: {
          OR: [
            { employeeCode },
            ...(phone ? [{ phone }] : []),
            { email }
          ]
        }
      });

      if (existingUser) {
        console.warn(`   ⚠️  User already exists: ${employeeCode} - ${fullName}`);
        skipCount++;
        continue;
      }

      // Find job position and office
      const jobKey = `${userData.cd}__${userData.vt}__${userData.pb}__${userData.tt}`;
      const jobPosition = jobPositionMap.get(jobKey);
      const office = officeMap.get(userData.tt);

      if (!jobPosition) {
        console.warn(`   ⚠️  Job position not found for user: ${employeeCode} - ${fullName} (${jobKey})`);
        errorCount++;
        continue;
      }

      if (!office) {
        console.warn(`   ⚠️  Office not found for user: ${employeeCode} - ${fullName} (${userData.tt})`);
        errorCount++;
        continue;
      }

      // Split fullName to firstName and lastName
      const nameParts = fullName.split(' ');
      const firstName = nameParts[0];
      const lastName = nameParts.slice(1).join(' ') || '';

      // Create user
      await prisma.user.create({
        data: {
          employeeCode,
          email,
          password: hashedPassword,
          firstName,
          lastName,
          phone,
          role: Role.USER,
          jobPositionId: jobPosition.id,
          officeId: office.id,
        },
      });

      successCount++;
      console.log(`   ✅ ${employeeCode} - ${fullName} (${userData.vt})`);

    } catch (error) {
      console.error(`   ❌ Error creating user ${userData.msnv} - ${userData.hoTen}:`, error.message);
      errorCount++;
    }
  }

  console.log('\n📊 Users creation summary:');
  console.log(`   ✅ Success: ${successCount}`);
  console.log(`   ⚠️  Skipped (already exists): ${skipCount}`);
  console.log(`   ❌ Failed: ${errorCount}`);
}

async function main() {
  console.log('🚀 Starting complete data import from Excel...\n');
  console.log(`📡 Database URL: ${getDatabaseUrl().replace(/\/\/.*@/, '//***:***@')}`);

  try {
    // Test database connection first
    const connected = await testConnection();
    if (!connected) {
      console.error('❌ Cannot connect to database. Please check your connection.');
      process.exit(1);
    }

    // Step 1: Process Excel data
    const processedData = await processExcelData();

    // Step 2: Create offices first
    const officeMap = await createOffices(processedData.offices);

    // Step 3: Create departments (depends on offices)
    const departmentMap = await createDepartments(processedData.departments, officeMap);

    // Step 4: Create positions
    const positionMap = await createPositions(processedData.positions);

    // Step 5: Create job positions (depends on positions and departments)
    const jobPositionMap = await createJobPositions(
      processedData.jobPositions, 
      positionMap, 
      departmentMap
    );

    // Step 6: Create users (depends on job positions and offices)
    await createUsers(processedData.users, jobPositionMap, officeMap);

    console.log('\n🎉 Complete data import finished successfully!');
    console.log('\n📋 Final summary:');
    console.log(`   🏢 Offices: ${processedData.offices.size}`);
    console.log(`   🏬 Departments: ${processedData.departments.size}`);
    console.log(`   👔 Positions: ${processedData.positions.size}`);
    console.log(`   💼 Job Positions: ${processedData.jobPositions.size}`);
    console.log(`   👥 Users: ${processedData.users.length} processed`);

  } catch (error) {
    console.error('❌ Import failed:', error);
    process.exit(1);
  }
}

main()
  .catch((e) => {
    console.error('❌ Import failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

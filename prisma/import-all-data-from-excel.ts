import { PrismaClient, Role, OfficeType } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import * as XLSX from 'xlsx';
import * as path from 'path';
import * as fs from 'fs';

// Get database URL with proper environment detection
const getDatabaseUrl = () => {
  const dbUrl = process.env.DATABASE_URL;
  const nodeEnv = process.env.NODE_ENV || 'development';
  
  console.log('🔍 Environment detection:', {
    NODE_ENV: nodeEnv,
    hasDbUrl: !!dbUrl,
    dbHost: dbUrl ? new URL(dbUrl).hostname : 'unknown',
    timestamp: new Date().toISOString()
  });
  
  if (dbUrl) {
    console.log('📡 Using DATABASE_URL from environment');
    console.log(`📍 Environment: ${nodeEnv}`);
    
    // Log masked URL for debugging
    const maskedUrl = dbUrl.replace(/\/\/([^:]+):([^@]+)@/, '//***:***@');
    console.log(`🔗 Database: ${maskedUrl}`);
    
    return dbUrl;
  }
  
  // Only fallback to local in development
  if (nodeEnv === 'development' || nodeEnv === 'local') {
    const fallbackUrl = 'postgresql://postgres:password@localhost:5433/weekly_report_dev';
    console.log('📡 Using fallback DATABASE_URL for local development');
    console.log(`🔗 Fallback: ${fallbackUrl}`);
    return fallbackUrl;
  }
  
  // In production without DATABASE_URL, this is an error
  console.error('❌ No DATABASE_URL configured in production environment');
  console.error('💡 Please set DATABASE_URL environment variable');
  throw new Error('DATABASE_URL is required in production');
};

// Initialize PrismaClient with proper database URL detection
const prisma = new PrismaClient({
  datasources: {
    db: {
      url: getDatabaseUrl()
    }
  },
  log: process.env.NODE_ENV === 'production' ? ['error', 'warn'] : ['error', 'warn', 'info']
});

interface ExcelRow {
  msnv: string;    // Mã số nhân viên (A)
  hoTen: string;   // Họ và tên (B)
  cd: string;      // Chức danh (C)
  vt: string;      // Vị trí công việc (D)
  pb: string;      // Phòng ban (E)
  tt: string;      // Trực thuộc (F)
  phone?: string;  // Phone (G)
  email?: string;  // Email (H)
  role?: string;   // Role (I)
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
    
    // Add connection timeout for production
    const connectionPromise = prisma.$connect();
    const timeoutPromise = new Promise((_, reject) => 
      setTimeout(() => reject(new Error('Connection timeout after 15 seconds')), 15000)
    );
    
    await Promise.race([connectionPromise, timeoutPromise]);
    
    // Test with a simple query
    const queryPromise = prisma.$queryRaw`SELECT 1 as test, current_database() as db_name, current_user as user_name`;
    const queryTimeoutPromise = new Promise((_, reject) => 
      setTimeout(() => reject(new Error('Query timeout after 10 seconds')), 10000)
    );
    
    const result = await Promise.race([queryPromise, queryTimeoutPromise]) as any[];
    
    console.log('✅ Database connection successful');
    console.log('📊 Connection info:', {
      database: result[0]?.db_name,
      user: result[0]?.user_name,
      environment: process.env.NODE_ENV || 'development'
    });
    
    return true;
  } catch (error) {
    console.error('❌ Database connection failed:', error.message);
    
    if (process.env.NODE_ENV === 'production') {
      console.error('🔍 Production debugging info:', {
        hasDbUrl: !!process.env.DATABASE_URL,
        nodeEnv: process.env.NODE_ENV,
        errorType: error.constructor.name,
        errorMessage: error.message
      });
    }
    
    return false;
  }
}

// Function to determine role based on position
function determineRole(cd: string, vt: string, pb: string): Role {
  const position = cd.toLowerCase();
  const jobTitle = vt.toLowerCase();
  const department = pb.toLowerCase();
  
  // SUPERADMIN - CEO
  if (position.includes('ceo') || position.includes('tgđ')) {
    return Role.ADMIN;
  }
  
  // OFFICE_MANAGER - Trưởng các đơn vị
  if (position.includes('trưởng') || position.includes('gđ') || position.includes('giám đốc')) {
    return Role.OFFICE_MANAGER;
  }
  
  // OFFICE_ADMIN - Phó trưởng, trưởng ca
  if (position.includes('pgđ') || position.includes('t.team') || position.includes('tca') || position.includes('tp') || position.includes('t.line') || position.includes('đt') || position.includes('tt')) {
    return Role.OFFICE_ADMIN;
  }
  
  // Default USER - Công nhân, nhân viên sản xuất
  return Role.USER;
}

// Function to generate proper email
function generateEmail(msnv: string, hoTen: string): string {
  // Remove diacritics and normalize name
  const normalizedName = hoTen
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // Remove diacritics
    .replace(/đ/g, 'd')
    .replace(/[^a-z\s]/g, '') // Remove special characters
    .trim();
  
  const nameParts = normalizedName.split(/\s+/);
  
  if (nameParts.length >= 2) {
    // Get first name (first part) and last name (last part)
    const firstName = nameParts[0];
    const lastName = nameParts[nameParts.length - 1];
    
    // Create email: lastName + firstLettersOfMiddleNames + firstLetterOfFirstName@tbsgroup.vn
    // Example: Nguyễn Hoàng Danh => danh + h + n => danhhn@tbsgroup.vn (WRONG!)
    // Correct: Nguyễn Hoàng Danh => danh + n + h => danhnh@tbsgroup.vn (RIGHT!)
    
    const middleNames = nameParts.slice(1, -1); // Get middle names: ["hoang"]
    const firstLettersOfMiddle = middleNames.map(part => part.charAt(0)).join(''); // "h"
    const firstLetterOfFirstName = firstName.charAt(0); // "n"
    
    // Fixed formula: lastName + firstLetterOfFirstName + firstLettersOfMiddle
    return `${lastName}${firstLetterOfFirstName}${firstLettersOfMiddle}@tbsgroup.vn`;
  } else {
    // Fallback to employee code
    return `${msnv.toLowerCase()}@tbsgroup.vn`;
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

      const msnv = String(row[0]).trim();
      const hoTen = String(row[1]).trim();
      const cd = String(row[2]).trim();
      const vt = String(row[3]).trim();
      const pb = String(row[4]).trim();
      const tt = String(row[5]).trim();
      const phone = row[6] ? String(row[6]).trim() : undefined;
      const email = row[7] ? String(row[7]).trim() : generateEmail(msnv, hoTen);
      const role = row[8] ? String(row[8]).trim() : undefined;

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

      // Store for user creation with proper email and role
      processed.users.push({ msnv, hoTen, cd, vt, pb, tt, phone, email, role });
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
      let officeType: OfficeType;
      let description: string;
      
      if (officeName.includes('VP') || officeName.includes('Văn phòng') || 
          officeName.includes('VPĐH') || officeName.includes('Điều hành')) {
        officeType = OfficeType.HEAD_OFFICE;
        description = `Văn phòng điều hành ${officeName}`;
      } else {
        officeType = OfficeType.FACTORY_OFFICE;
        description = `Văn phòng điều hành ${officeName}`;
      }

      const office = await prisma.office.upsert({
        where: { name: officeName },
        update: {
          type: officeType,
          description: description,
        },
        create: {
          name: officeName,
          type: officeType,
          description: description,
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

      const description = `${dept.name} - ${dept.office}`;

      const department = await prisma.department.upsert({
        where: {
          name_officeId: {
            name: dept.name,
            officeId: office.id,
          }
        },
        update: {
          description: description,
        },
        create: {
          name: dept.name,
          description: description,
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
      let description: string;
      const pos = positionName.toLowerCase();
      
      if (pos === 'nv' || pos === 'nhân viên') {
        description = 'Nhân viên';
      } else if (pos === 'tp' || pos === 'trưởng phòng') {
        description = 'Trưởng phòng';
      } else if (pos === 'pgđ' || pos === 'phó giám đốc') {
        description = 'Phó giám đốc';
      } else if (pos === 't.team' || pos === 'trưởng team') {
        description = 'Trưởng Team';
      } else if (pos === 'gđ' || pos === 'giám đốc') {
        description = 'Giám Đốc';
      } else if (pos === 't.line' || pos === 'trưởng line') {
        description = 'Trưởng Line';
      } else if (pos === 'tl' || pos === 'trợ lý') {
        description = 'Trợ lý';
      } else if (pos === 'đt' || pos === 'đội trưởng') {
        description = 'Đội trưởng';
      } else if (pos === 'tca' || pos === 'trưởng ca') {
        description = 'Trưởng ca';
      } else if (pos === 'tt' || pos === 'tổ trưởng') {
        description = 'Tổ trưởng';
      } else if (pos === 'tgđ' || pos === 'tổng giám đốc') {
        description = 'Tổng Giám Đốc';
      } else {
        description = positionName;
      }

      const position = await prisma.position.upsert({
        where: { name: positionName },
        update: {
          description: description,
        },
        create: {
          name: positionName,
          description: description,
        },
      });

      positionMap.set(positionName, position);
      console.log(`   ✅ ${positionName} → ${description}`);
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

      const code = `${jp.cd.replace(/\s+/g, '').toUpperCase()}_${jp.vt.replace(/\s+/g, '').toUpperCase()}_${jp.pb.replace(/\s+/g, '').toUpperCase()}`;
      const description = `${jp.cd} - ${jp.vt} tại phòng ban ${jp.pb} (${jp.tt})`;

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
          description: description,
        },
        create: {
          jobName: jp.vt,
          code: code,
          description: description,
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
      const employeeCode = userData.msnv;
      const fullName = userData.hoTen;
      const phone = userData.phone || '';
      
      const email = userData.email || generateEmail(userData.msnv, userData.hoTen);
      
      const userRole = userData.role ? 
        (Role[userData.role as keyof typeof Role] || determineRole(userData.cd, userData.vt, userData.pb)) :
        determineRole(userData.cd, userData.vt, userData.pb);

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

      // Create user with proper email and role
      await prisma.user.create({
        data: {
          employeeCode,
          email,
          password: hashedPassword,
          firstName,
          lastName,
          phone,
          role: userRole,
          jobPositionId: jobPosition.id,
          officeId: office.id,
        },
      });

      successCount++;
      console.log(`   ✅ ${employeeCode} - ${fullName} (${userData.vt}) [${userRole}] - ${email}`);

    } catch (error) {
      console.error(`   ❌ Error creating user ${userData.msnv} - ${userData.hoTen}:`, error.message);
      errorCount++;
    }
  }

  console.log('\n📊 Users creation summary:');
  console.log(`   ✅ Success: ${successCount}`);
  console.log(`   ⚠️  Skipped (already exists): ${skipCount}`);
  console.log(`   ❌ Failed: ${errorCount}`);
  
  // Show role distribution
  console.log('\n👥 Role Distribution:');
  const roleStats = await prisma.user.groupBy({
    by: ['role'],
    _count: { role: true },
  });
  
  roleStats.forEach(stat => {
    console.log(`   ${stat.role}: ${stat._count.role} users`);
  });

  // Show email examples
  console.log('\n📧 Email Examples:');
  const sampleUsers = await prisma.user.findMany({
    take: 5,
    select: {
      firstName: true,
      lastName: true,
      email: true,
    }
  });
  
  sampleUsers.forEach(user => {
    console.log(`   ${user.firstName} ${user.lastName} → ${user.email}`);
  });
}

async function main() {
  console.log('🚀 Starting complete data import from Excel...\n');
  
  const nodeEnv = process.env.NODE_ENV || 'development';
  const dbUrl = process.env.DATABASE_URL;
  
  console.log('🔍 Runtime environment:', {
    NODE_ENV: nodeEnv,
    hasDbUrl: !!dbUrl,
    currentDir: process.cwd(),
    scriptPath: __filename
  });
  
  if (dbUrl) {
    const maskedUrl = dbUrl.replace(/\/\/([^:]+):([^@]+)@/, '//***:***@');
    console.log(`📡 Database URL: ${maskedUrl}`);
    
    if (dbUrl.includes('flycast') || dbUrl.includes('fly.dev')) {
      console.log('🌐 Detected: Production environment (Fly.io)');
    } else if (dbUrl.includes('localhost') || dbUrl.includes('127.0.0.1')) {
      console.log('🏠 Detected: Local environment');
    } else {
      console.log('🔍 Detected: External database');
    }
  } else {
    console.log('❌ No DATABASE_URL configured');
  }

  try {
    // Test database connection first
    console.log('\n🔄 Step 1: Testing database connection...');
    const connected = await testConnection();
    if (!connected) {
      console.error('❌ Cannot connect to database. Import aborted.');
      
      if (nodeEnv === 'production') {
        console.error('\n💡 Production troubleshooting:');
        console.error('   1. Check if DATABASE_URL secret is set correctly');
        console.error('   2. Verify database is running: flyctl status -a weekly-report-backend-db');
        console.error('   3. Test connection: flyctl ssh console -C "npx prisma db pull"');
        console.error('   4. Check database logs: flyctl logs -a weekly-report-backend-db');
      }
      
      process.exit(1);
    }

    // Check if Excel file exists
    const excelPath = path.join(__dirname, 'data.xlsx');
    console.log(`\n🔄 Step 2: Checking Excel file at: ${excelPath}`);
    
    try {
      if (!fs.existsSync(excelPath)) {
        console.error('❌ Excel file not found at:', excelPath);
        console.error('💡 Expected file: prisma/data.xlsx');
        
        console.log('📁 Current directory contents:');
        try {
          const files = fs.readdirSync(__dirname);
          files.forEach(file => console.log(`   ${file}`));
        } catch (err) {
          console.error('❌ Cannot list directory contents:', err.message);
        }
        
        process.exit(1);
      }
      
      const stats = fs.statSync(excelPath);
      console.log('✅ Excel file found');
      console.log(`📊 File size: ${(stats.size / 1024).toFixed(2)} KB`);
      console.log(`📅 Last modified: ${stats.mtime.toISOString()}`);
    } catch (error) {
      console.error('❌ Error checking Excel file:', error.message);
      process.exit(1);
    }

    // Process Excel data
    console.log('\n🔄 Step 3: Processing Excel data...');
    const processedData = await processExcelData();

    // Create database entities step by step
    console.log('\n🔄 Step 4: Creating database entities...');
    
    const officeMap = await createOffices(processedData.offices);
    const departmentMap = await createDepartments(processedData.departments, officeMap);
    const positionMap = await createPositions(processedData.positions);
    const jobPositionMap = await createJobPositions(
      processedData.jobPositions, 
      positionMap, 
      departmentMap
    );
    
    await createUsers(processedData.users, jobPositionMap, officeMap);

    console.log('\n🎉 Complete data import finished successfully!');
    console.log('\n📋 Final summary:');
    console.log(`   🏢 Offices: ${processedData.offices.size}`);
    console.log(`   🏬 Departments: ${processedData.departments.size}`);
    console.log(`   👔 Positions: ${processedData.positions.size}`);
    console.log(`   💼 Job Positions: ${processedData.jobPositions.size}`);
    console.log(`   👥 Users: ${processedData.users.length} processed`);
    
    console.log('\n🔧 Environment summary:');
    console.log(`   Environment: ${nodeEnv}`);
    console.log(`   Database: ${dbUrl ? 'Connected' : 'Fallback'}`);
    console.log(`   Excel file: Found and processed`);

  } catch (error) {
    console.error('\n❌ Import failed:', error.message);
    console.error('Stack trace:', error.stack);
    
    if (nodeEnv === 'production') {
      console.error('\n🔍 Production error details:', {
        environment: nodeEnv,
        hasDbUrl: !!process.env.DATABASE_URL,
        errorType: error.constructor.name,
        timestamp: new Date().toISOString()
      });
    }
    
    process.exit(1);
  }
}

main()
  .catch((e) => {
    console.error('❌ Critical import error:', e.message);
    console.error('Stack:', e.stack);
    process.exit(1);
  })
  .finally(async () => {
    try {
      await prisma.$disconnect();
      console.log('🔄 Database connection closed');
    } catch (error) {
      console.error('❌ Error closing database connection:', error.message);
    }
  });

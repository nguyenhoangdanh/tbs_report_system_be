import { PrismaClient, Role, OfficeType } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import * as XLSX from 'xlsx';
import * as path from 'path';

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

  // 1. Read Excel and collect unique offices, departments, positions, job positions
  const excelPath = path.join(__dirname, 'users.xlsx');
  const workbook = XLSX.readFile(excelPath);
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const rows: any[] = XLSX.utils.sheet_to_json(sheet, { header: 1 });

  // Sets to collect unique values
  const officeSet = new Set<string>();
  const departmentSet = new Set<string>();
  const positionSet = new Set<string>();
  const jobPositionSet = new Set<string>();

  // Arrays to store unique objects
  const officesSeed: any[] = [];
  const departmentSeed: any[] = [];
  const positionSeed: any[] = [];
  const jobPositionSeed: any[] = [];

  // Skip header row (assume first row is header)
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row || !row[0] || !row[1]) continue;

    const cd = String(row[2]).trim(); // CD
    const vt = String(row[3]).trim(); // VTCV
    const pb = String(row[4]).trim(); // PHÒNG BAN
    const tt = String(row[5]).trim(); // TRỰC THUỘC

    // Offices
    if (tt && !officeSet.has(tt)) {
      officeSet.add(tt);
      officesSeed.push({
        name: tt,
        type:
          tt === 'VPĐH TH' ? OfficeType.HEAD_OFFICE : OfficeType.FACTORY_OFFICE,
        description: tt,
      });
    }

    // Departments (unique by name + office)
    const deptKey = `${pb}__${tt}`;
    if (pb && tt && !departmentSet.has(deptKey)) {
      departmentSet.add(deptKey);
      departmentSeed.push({ name: pb, office: tt });
    }

    // Positions
    if (cd && !positionSet.has(cd)) {
      positionSet.add(cd);
      positionSeed.push({ name: cd, description: cd });
    }

    // JobPositions (unique by cd, vt, pb, tt)
    const jobKey = `${cd}__${vt}__${pb}__${tt}`;
    if (cd && vt && pb && tt && !jobPositionSet.has(jobKey)) {
      jobPositionSet.add(jobKey);
      jobPositionSeed.push({ cd, vt, pb, tt });
    }
  }

  // 2. Seed Offices
  const officeMap: Record<string, any> = {};
  for (const o of officesSeed) {
    // Ensure correct type assignment: only 'VPĐH TH' is HEAD_OFFICE, all others FACTORY_OFFICE
    const officeType =
      o.name === 'VPĐH TH' ? OfficeType.HEAD_OFFICE : OfficeType.FACTORY_OFFICE;
    // Avoid duplicate create/find
    if (officeMap[o.name]) continue;
    let office = await prisma.office.findUnique({ where: { name: o.name } });
    if (!office) {
      office = await prisma.office.create({ data: { ...o, type: officeType } });
    }
    officeMap[o.name] = office;
  }

  // 3. Seed Departments
  const departmentMap: Record<string, any> = {};
  for (const d of departmentSeed) {
    const key = `${d.name}__${d.office}`;
    // Avoid duplicate department in departmentMap
    if (departmentMap[key]) continue;
    if (!officeMap[d.office]) {
      console.warn(`Office not found for department: ${d.name}__${d.office}`);
      continue;
    }
    // Check if department already exists
    let department = await prisma.department.findFirst({
      where: { name: d.name, officeId: officeMap[d.office].id },
    });
    if (!department) {
      department = await prisma.department.create({
        data: {
          name: d.name,
          officeId: officeMap[d.office].id,
        },
      });
    }
    departmentMap[key] = department;
  }

  // 4. Seed Positions
  const positionMap: Record<string, any> = {};
  for (const p of positionSeed) {
    if (positionMap[p.name]) continue;
    let position = await prisma.position.findUnique({
      where: { name: p.name },
    });
    if (!position) {
      position = await prisma.position.create({ data: p });
    }
    positionMap[p.name] = position;
  }

  // 5. Seed Job Positions
  const jobPositionMap: Record<string, any> = {};
  for (const jp of jobPositionSeed) {
    const deptKey = `${jp.pb}__${jp.tt}`;
    const position = positionMap[jp.cd];
    const department = departmentMap[deptKey];
    if (!position) {
      console.warn(
        `Position not found: ${jp.cd} for jobPosition (${jp.vt}, ${jp.pb}, ${jp.tt})`,
      );
      continue;
    }
    if (!department) {
      console.warn(
        `Department not found: ${jp.pb}__${jp.tt} for jobPosition (${jp.cd}, ${jp.vt})`,
      );
      continue;
    }
    const code = `${jp.cd}_${jp.vt.replace(/\s/g, '').toUpperCase()}_${jp.pb.replace(/\s/g, '').toUpperCase()}`;
    // Avoid duplicate jobPosition in jobPositionMap
    if (jobPositionMap[code]) continue;
    // Check if jobPosition already exists
    let jobPosition = await prisma.jobPosition.findFirst({
      where: {
        jobName: jp.vt,
        positionId: position.id,
        departmentId: department.id,
      },
    });
    if (!jobPosition) {
      jobPosition = await prisma.jobPosition.create({
        data: {
          jobName: jp.vt,
          code,
          positionId: position.id,
          departmentId: department.id,
          description: `${jp.cd} - ${jp.vt} tại ${jp.pb} (${jp.tt})`,
        },
      });
    }
    jobPositionMap[code] = jobPosition;
  }

  // 6. Create demo users (optional, or skip if only import from Excel)
  // Example: create a superadmin user in VPĐH TH
  // Check duplicate superadmin
  let superadmin = await prisma.user.findUnique({
    where: { employeeCode: 'CEO001' },
  });
  if (!superadmin) {
    const superadminJobPosition = Object.values(jobPositionMap)[0];
    superadmin = await prisma.user.create({
      data: {
        employeeCode: 'CEO001',
        email: 'ceo@company.com',
        password: hashedPassword,
        firstName: 'Nguyễn',
        lastName: 'Văn CEO',
        cardId: '012345678901',
        role: Role.SUPERADMIN,
        jobPositionId: superadminJobPosition.id,
        officeId: officeMap['VPĐH TH'].id,
      },
    });
  }

  // Example: create an admin for each office
  for (const [officeName, office] of Object.entries(officeMap)) {
    const adminCode = `ADM_${officeName}`;
    const admin = await prisma.user.findUnique({
      where: { employeeCode: adminCode },
    });
    if (admin) continue;
    // Find a job position in this office (pick first available)
    const dept = Object.values(departmentMap).find(
      (d) => d.officeId === office.id,
    );
    if (!dept) continue;
    const jobPos = Object.values(jobPositionMap).find(
      (jp) => jp.departmentId === dept.id,
    );
    if (!jobPos) continue;
    await prisma.user.create({
      data: {
        employeeCode: adminCode,
        email: `admin_${officeName}@company.com`,
        password: hashedPassword,
        firstName: 'Trần',
        lastName: `Văn Admin ${officeName}`,
        cardId: null,
        role: Role.ADMIN,
        jobPositionId: jobPos.id,
        officeId: office.id,
      },
    });
  }

  console.log('✅ Seed completed with base data from Excel!');
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

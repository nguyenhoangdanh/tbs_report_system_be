import { PrismaClient, Role } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import * as XLSX from 'xlsx';
import * as path from 'path';

const prisma = new PrismaClient();

async function main() {
  // Path to your Excel file
  const excelPath = path.join(__dirname, 'users.xlsx');
  const workbook = XLSX.readFile(excelPath);
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const rows: any[] = XLSX.utils.sheet_to_json(sheet, { header: 1 });

  // Skip header rows (first 1 rows in your screenshot)
  // Your screenshot: row 1 is header, row 2 là data đầu tiên (index 1)
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    // Kiểm tra row hợp lệ: MSNV (A), HỌ VÀ TÊN (B), CD (C), VTCV (D), PHÒNG BAN (E), TRỰC THUỘC (F), CCCD (G)
    if (!row || !row[0] || !row[1]) continue; // MSNV và HỌ VÀ TÊN phải có

    // Map columns
    const employeeCode = String(row[0]).trim(); // MSNV (A)
    const fullName = String(row[1]).trim(); // HỌ VÀ TÊN (B)
    const cd = String(row[2]).trim(); // CD (C)
    const vt = String(row[3]).trim(); // VTCV (D)
    const pb = String(row[4]).trim(); // PHÒNG BAN (E)
    const tt = String(row[5]).trim(); // TRỰC THUỘC (F)
    const cardId = row[6] ? String(row[6]).trim() : null; // CCCD (G)

    // Split fullName to firstName, lastName (simple split, adjust as needed)
    const [lastName, ...firstNameArr] = fullName.split(' ');
    const firstName = firstNameArr.join(' ') || lastName;
    const lastNameFinal = firstNameArr.length ? lastName : '';

    // Check duplicate by employeeCode or cardId or email
    const email = `user${employeeCode}@company.com`;
    const existedUser = await prisma.user.findFirst({
      where: {
        OR: [{ employeeCode }, { cardId: cardId || undefined }, { email }],
      },
    });
    if (existedUser) {
      console.warn(`Duplicate user skipped: ${employeeCode} - ${fullName}`);
      continue;
    }

    // Find office
    const office = await prisma.office.findFirst({ where: { name: tt } });
    if (!office) {
      console.warn(`Office not found: ${tt} for user ${employeeCode}`);
      continue;
    }

    // Find department
    const department = await prisma.department.findFirst({
      where: { name: pb, officeId: office.id },
    });
    if (!department) {
      console.warn(
        `Department not found: ${pb} (${tt}) for user ${employeeCode}`,
      );
      continue;
    }

    // Find position
    const position = await prisma.position.findFirst({ where: { name: cd } });
    if (!position) {
      console.warn(`Position not found: ${cd} for user ${employeeCode}`);
      continue;
    }

    // Find job position
    const jobPosition = await prisma.jobPosition.findFirst({
      where: {
        jobName: vt,
        positionId: position.id,
        departmentId: department.id,
      },
    });
    if (!jobPosition) {
      console.warn(
        `JobPosition not found: ${cd}, ${vt}, ${pb}, ${tt} for user ${employeeCode}`,
      );
      continue;
    }

    // Hash password (default: 123456)
    const password = await bcrypt.hash('123456', 10);

    // Create user
    await prisma.user.create({
      data: {
        employeeCode,
        email,
        password,
        firstName,
        lastName: lastNameFinal,
        cardId,
        role: Role.USER,
        jobPositionId: jobPosition.id,
        officeId: office.id,
      },
    });

    console.log(`Created user: ${employeeCode} - ${fullName}`);
  }

  console.log('✅ Import completed!');
}

main()
  .catch((e) => {
    console.error('❌ Import failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

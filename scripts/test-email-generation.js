// Test email generation logic

function generateEmail(msnv, hoTen) {
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
    
    // Create email: lastName + firstLetterOfFirstName + firstLettersOfMiddle@tbsgroup.vn
    const middleNames = nameParts.slice(1, -1); // Get middle names
    const firstLettersOfMiddle = middleNames.map(part => part.charAt(0)).join('');
    const firstLetterOfFirstName = firstName.charAt(0);
    
    // Fixed formula: lastName + firstLetterOfFirstName + firstLettersOfMiddle
    return `${lastName}${firstLetterOfFirstName}${firstLettersOfMiddle}@tbsgroup.vn`;
  } else {
    // Fallback to employee code
    return `${msnv.toLowerCase()}@tbsgroup.vn`;
  }
}

// Test cases
const testCases = [
  { msnv: "552502356", name: "Nguyễn Hoàng Danh", expected: "danhnh@tbsgroup.vn" },
  { msnv: "123456", name: "Trần Thị Ngọc Huyền", expected: "huyenttn@tbsgroup.vn" },
  { msnv: "789012", name: "Lê Văn Nam", expected: "namvl@tbsgroup.vn" },
  { msnv: "345678", name: "Phạm Minh Tuấn", expected: "tuanpm@tbsgroup.vn" },
  { msnv: "901234", name: "Võ Thị Lan Anh", expected: "anhvtl@tbsgroup.vn" },
  { msnv: "567890", name: "Đặng Quốc Bảo", expected: "baodq@tbsgroup.vn" },
  { msnv: "111222", name: "Hồ Xuân Mai", expected: "maihx@tbsgroup.vn" },
  { msnv: "333444", name: "Bùi Thành Long", expected: "longbt@tbsgroup.vn" },
  { msnv: "555666", name: "Dương", expected: "555666@tbsgroup.vn" }, // Single name fallback
];

console.log("🧪 Testing Email Generation Logic");
console.log("=================================");

let passCount = 0;
let failCount = 0;

testCases.forEach((testCase, index) => {
  const result = generateEmail(testCase.msnv, testCase.name);
  const isCorrect = result === testCase.expected;
  
  if (isCorrect) {
    console.log(`✅ Test ${index + 1}: ${testCase.name} -> ${result}`);
    passCount++;
  } else {
    console.log(`❌ Test ${index + 1}: ${testCase.name}`);
    console.log(`   Expected: ${testCase.expected}`);
    console.log(`   Got:      ${result}`);
    failCount++;
  }
});

console.log("\n📊 Test Results:");
console.log(`✅ Passed: ${passCount}`);
console.log(`❌ Failed: ${failCount}`);
console.log(`📈 Success rate: ${((passCount / testCases.length) * 100).toFixed(1)}%`);

if (failCount === 0) {
  console.log("\n🎉 All tests passed! Email generation logic is correct.");
} else {
  console.log("\n⚠️ Some tests failed. Please fix the logic.");
}

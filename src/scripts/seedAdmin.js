require('dotenv').config();
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const dataService = require('../services/dataService');

/**
 * Chay 1 lan de tao tai khoan Admin dau tien:
 *   ADMIN_NAME="Nguyen Van A" ADMIN_EMAIL=admin@workline.vn ADMIN_PASSWORD=matkhau123 node src/scripts/seedAdmin.js
 * hoac dat 3 bien do trong file .env roi chay: npm run seed:admin
 */
async function main() {
  const name = process.env.ADMIN_NAME;
  const email = process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_PASSWORD;

  if (!name || !email || !password) {
    console.error('Vui lòng đặt ADMIN_NAME, ADMIN_EMAIL, ADMIN_PASSWORD trong .env hoặc biến môi trường.');
    process.exit(1);
  }

  const existing = await dataService.findMemberByEmail(email);
  if (existing) {
    console.log('Tài khoản với email này đã tồn tại, bỏ qua.');
    process.exit(0);
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const admin = {
    id: uuidv4(),
    name,
    email,
    role: 'admin',
    passwordHash,
    createdBy: null,
    createdByName: null,
    createdAt: new Date().toISOString(),
  };

  await dataService.addMember(admin);
  console.log(`Đã tạo Admin: ${email}`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

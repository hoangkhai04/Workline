const { readDb, writeDb } = require('../config/googleDrive');

async function getAllMembers() {
  const db = await readDb();
  return db.members || [];
}

async function findMemberByEmail(email) {
  const members = await getAllMembers();
  return members.find((m) => m.email.toLowerCase() === email.toLowerCase()) || null;
}

async function findMemberById(id) {
  const members = await getAllMembers();
  return members.find((m) => m.id === id) || null;
}

async function addMember(member) {
  const db = await readDb();
  db.members = db.members || [];
  db.members.push(member);
  await writeDb(db);
  return member;
}

async function updateMember(id, updates) {
  const db = await readDb();
  db.members = db.members || [];
  const idx = db.members.findIndex((m) => m.id === id);
  if (idx === -1) return null;
  db.members[idx] = { ...db.members[idx], ...updates };
  await writeDb(db);
  return db.members[idx];
}

async function saveResetToken(entry) {
  const db = await readDb();
  db.resetTokens = db.resetTokens || [];
  // Xoa token cu cua cung 1 member truoc khi them token moi
  db.resetTokens = db.resetTokens.filter((t) => t.memberId !== entry.memberId);
  db.resetTokens.push(entry);
  await writeDb(db);
  return entry;
}

async function findResetToken(token) {
  const db = await readDb();
  return (db.resetTokens || []).find((t) => t.token === token) || null;
}

async function deleteResetToken(token) {
  const db = await readDb();
  db.resetTokens = (db.resetTokens || []).filter((t) => t.token !== token);
  await writeDb(db);
}

// ===== OTP dat lai mat khau (ma 6 so) =====
// Moi member chi co 1 OTP con hieu luc: { memberId, hash, salt, expiresAt, sentAt, attempts }
async function saveResetOtp(entry) {
  const db = await readDb();
  db.resetOtps = (db.resetOtps || []).filter((o) => o.memberId !== entry.memberId);
  db.resetOtps.push(entry);
  await writeDb(db);
  return entry;
}

async function findResetOtp(memberId) {
  const db = await readDb();
  return (db.resetOtps || []).find((o) => o.memberId === memberId) || null;
}

async function updateResetOtp(memberId, updates) {
  const db = await readDb();
  db.resetOtps = db.resetOtps || [];
  const idx = db.resetOtps.findIndex((o) => o.memberId === memberId);
  if (idx === -1) return null;
  db.resetOtps[idx] = { ...db.resetOtps[idx], ...updates };
  await writeDb(db);
  return db.resetOtps[idx];
}

async function deleteResetOtp(memberId) {
  const db = await readDb();
  db.resetOtps = (db.resetOtps || []).filter((o) => o.memberId !== memberId);
  await writeDb(db);
}

module.exports = {
  getAllMembers,
  findMemberByEmail,
  findMemberById,
  addMember,
  updateMember,
  saveResetToken,
  findResetToken,
  deleteResetToken,
  saveResetOtp,
  findResetOtp,
  updateResetOtp,
  deleteResetOtp,
};

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
  getAllTasks,
  findTaskById,
  upsertTask,
  deleteTask,
};
// ===== Task =====
// Khoa tuan tu: cac thao tac ghi task lan luot, tranh 2 yeu cau cung doc-ghi file Drive mot luc
let taskLock = Promise.resolve();
function withTaskLock(fn) {
  const run = taskLock.then(fn, fn);
  taskLock = run.catch(() => {});
  return run;
}

async function getAllTasks() {
  const db = await readDb();
  return db.tasks || [];
}

async function findTaskById(id) {
  const tasks = await getAllTasks();
  return tasks.find((t) => t.id === id) || null;
}

// Them moi (server sinh ma TASK-001, 002...) hoac cap nhat neu id da ton tai
async function upsertTask(task) {
  return withTaskLock(async () => {
    const db = await readDb();
    db.tasks = db.tasks || [];
    const idx = db.tasks.findIndex((t) => t.id === task.id);
    if (idx === -1) {
      const max = db.tasks.reduce((m, t) => {
        const n = parseInt(String(t.code || '').replace(/\D/g, ''), 10);
        return Number.isFinite(n) && n > m ? n : m;
      }, 0);
      const created = { ...task, code: 'TASK-' + String(max + 1).padStart(3, '0') };
      db.tasks.unshift(created);
      await writeDb(db);
      return created;
    }
    // Ma task va nguoi tao khong doi sau khi da tao
    const updated = { ...task, code: db.tasks[idx].code, creator: db.tasks[idx].creator };
    db.tasks[idx] = updated;
    await writeDb(db);
    return updated;
  });
}

async function deleteTask(id) {
  return withTaskLock(async () => {
    const db = await readDb();
    db.tasks = (db.tasks || []).filter((t) => t.id !== id);
    await writeDb(db);
  });
}
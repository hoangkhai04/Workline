const { readDb, writeDb } = require('../config/googleDrive');

// ===== Khoa ghi toan cuc =====
// TOAN BO thao tac doc-sua-ghi (members, reset tokens, OTP, notifications, tasks,
// push subscriptions) deu phai di qua CUNG MOT hang doi nay. Ly do: readDb()/writeDb()
// doc/ghi de len TOAN BO 1 file JSON duy nhat tren Google Drive, khong co optimistic
// lock / ETag. Neu 2 request ghi khac nhau (vi du: "xoa thong bao" va "cap nhat ho so")
// cung doc truoc khi cai truoc kip ghi xong, request ghi sau se de len ban cu va lam
// "song lai" du lieu vua bi request truoc xoa/sua. Dung 1 khoa duy nhat cho MOI ham
// ghi se dam bao khong co 2 thao tac doc-sua-ghi nao chong len nhau trong cung 1
// tien trinh Node. (Luu y: neu server chay nhieu instance/process song song thi khoa
// nay khong con tac dung nua - can chuyen sang database that co giao dich/lock that.)
let dbLock = Promise.resolve();
function withDbLock(fn) {
  const run = dbLock.then(fn, fn);
  dbLock = run.catch(() => {});
  return run;
}

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
  return withDbLock(async () => {
    const db = await readDb();
    db.members = db.members || [];
    db.members.push(member);
    await writeDb(db);
    return member;
  });
}

async function updateMember(id, updates) {
  return withDbLock(async () => {
    const db = await readDb();
    db.members = db.members || [];
    const idx = db.members.findIndex((m) => m.id === id);
    if (idx === -1) return null;
    db.members[idx] = { ...db.members[idx], ...updates };
    await writeDb(db);
    return db.members[idx];
  });
}

// Xoa thanh vien khoi Google Drive DB. Tra ve true neu co xoa (tim thay va da xoa),
// false neu khong tim thay id do (de route co the tra 404 chinh xac).
async function deleteMember(id) {
  return withDbLock(async () => {
    const db = await readDb();
    db.members = db.members || [];
    const before = db.members.length;
    db.members = db.members.filter((m) => m.id !== id);
    const removed = db.members.length !== before;
    if (removed) await writeDb(db);
    return removed;
  });
}

async function saveResetToken(entry) {
  return withDbLock(async () => {
    const db = await readDb();
    db.resetTokens = db.resetTokens || [];
    // Xoa token cu cua cung 1 member truoc khi them token moi
    db.resetTokens = db.resetTokens.filter((t) => t.memberId !== entry.memberId);
    db.resetTokens.push(entry);
    await writeDb(db);
    return entry;
  });
}

async function findResetToken(token) {
  const db = await readDb();
  return (db.resetTokens || []).find((t) => t.token === token) || null;
}

async function deleteResetToken(token) {
  return withDbLock(async () => {
    const db = await readDb();
    db.resetTokens = (db.resetTokens || []).filter((t) => t.token !== token);
    await writeDb(db);
  });
}

// ===== OTP dat lai mat khau (ma 6 so) =====
// Moi member chi co 1 OTP con hieu luc: { memberId, hash, salt, expiresAt, sentAt, attempts }
async function saveResetOtp(entry) {
  return withDbLock(async () => {
    const db = await readDb();
    db.resetOtps = (db.resetOtps || []).filter((o) => o.memberId !== entry.memberId);
    db.resetOtps.push(entry);
    await writeDb(db);
    return entry;
  });
}

async function findResetOtp(memberId) {
  const db = await readDb();
  return (db.resetOtps || []).find((o) => o.memberId === memberId) || null;
}

async function updateResetOtp(memberId, updates) {
  return withDbLock(async () => {
    const db = await readDb();
    db.resetOtps = db.resetOtps || [];
    const idx = db.resetOtps.findIndex((o) => o.memberId === memberId);
    if (idx === -1) return null;
    db.resetOtps[idx] = { ...db.resetOtps[idx], ...updates };
    await writeDb(db);
    return db.resetOtps[idx];
  });
}

async function deleteResetOtp(memberId) {
  return withDbLock(async () => {
    const db = await readDb();
    db.resetOtps = (db.resetOtps || []).filter((o) => o.memberId !== memberId);
    await writeDb(db);
  });
}

// ===== Thong bao =====
const MAX_NOTIFICATIONS = 2000;

function isNotificationFor(n, member) {
  const to = String(n.to || '').toLowerCase();
  if (to === 'all') return true;
  if (to === 'leader' || to === 'leader@workline.vn') {
    return member.role === 'leader';
  }
  return to === String(member.id).toLowerCase() || (!!member.email && to === member.email.toLowerCase());
}

function cleanNotification(n, requester) {
  return {
    id: String(n.id).slice(0, 100),
    to: String(n.to).slice(0, 200),
    toName: String(n.toName || '').slice(0, 200),
    subject: String(n.subject || '').slice(0, 300),
    body: String(n.body || '').slice(0, 5000),
    time: String(n.time || new Date().toISOString()),
    read: !!n.read,
    taskId: n.taskId ? String(n.taskId).slice(0, 100) : null,
    from: requester.id,
  };
}

async function saveNotifications(requester, list) {
  return withDbLock(async () => {
    const db = await readDb();
    db.notifications = db.notifications || [];
    const created = [];
    let changed = false;
    for (const n of list) {
      const existing = db.notifications.find((x) => x.id === String(n.id));
      if (!existing) {
        const clean = cleanNotification(n, requester);
        db.notifications.unshift(clean);
        created.push(clean);
        changed = true;
      } else if (n.read && !existing.read && isNotificationFor(existing, requester)) {
        existing.read = true;
        changed = true;
      }
    }
    if (db.notifications.length > MAX_NOTIFICATIONS) db.notifications.length = MAX_NOTIFICATIONS;
    if (changed) await writeDb(db);
    return created;
  });
}

// Lay danh sach thong bao gui cho member nay
async function getNotificationsFor(member) {
  const db = await readDb();
  return (db.notifications || []).filter((n) => isNotificationFor(n, member));
}

// Chi xoa duoc thong bao gui cho chinh minh
async function deleteNotifications(requester, ids) {
  return withDbLock(async () => {
    const db = await readDb();
    const before = (db.notifications || []).length;
    db.notifications = (db.notifications || []).filter(
      (n) => !(ids.includes(n.id) && isNotificationFor(n, requester))
    );
    if (db.notifications.length !== before) await writeDb(db);
  });
}

// ===== Push subscription =====
async function savePushSubscription(memberId, sub) {
  return withDbLock(async () => {
    const db = await readDb();
    db.pushSubscriptions = (db.pushSubscriptions || []).filter((s) => s.endpoint !== sub.endpoint);
    db.pushSubscriptions.push({
      memberId,
      endpoint: sub.endpoint,
      keys: { p256dh: sub.keys.p256dh, auth: sub.keys.auth },
      createdAt: new Date().toISOString(),
    });
    await writeDb(db);
  });
}

async function removePushSubscription(endpoint) {
  return withDbLock(async () => {
    const db = await readDb();
    db.pushSubscriptions = (db.pushSubscriptions || []).filter((s) => s.endpoint !== endpoint);
    await writeDb(db);
  });
}

async function getPushSubscriptionsFor(memberId) {
  const db = await readDb();
  return (db.pushSubscriptions || []).filter((s) => s.memberId === memberId);
}

// ===== Task =====
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
  return withDbLock(async () => {
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
  return withDbLock(async () => {
    const db = await readDb();
    db.tasks = (db.tasks || []).filter((t) => t.id !== id);
    await writeDb(db);
  });
}

module.exports = {
  getAllMembers,
  findMemberByEmail,
  findMemberById,
  addMember,
  updateMember,
  deleteMember,
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
  getNotificationsFor,
  saveNotifications,
  deleteNotifications,
  savePushSubscription,
  removePushSubscription,
  getPushSubscriptionsFor,
};
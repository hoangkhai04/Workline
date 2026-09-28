const { v4: uuidv4 } = require('uuid');

const dataService = require('./dataService');
const push = require('./push');

const CHECK_INTERVAL_MS = 5 * 60 * 1000; // 5 phut/lan
const TZ = 'Asia/Ho_Chi_Minh';
const SYSTEM_REQUESTER = { id: 'system', name: 'Hệ thống' };

function vnParts(date) {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  });
  const p = Object.fromEntries(fmt.formatToParts(date).map((x) => [x.type, x.value]));
  return { dateStr: `${p.year}-${p.month}-${p.day}`, hh: p.hour, mm: p.minute };
}

function normDeadline(deadline) {
  if (!deadline) return '';
  return deadline.length === 10 ? deadline + 'T23:59' : deadline.slice(0, 16);
}

function deadlineDateStr(deadline) {
  return normDeadline(deadline).slice(0, 10);
}

function deadlineTimeStr(deadline) {
  return normDeadline(deadline).slice(11, 16);
}

function deadlineToVNms(deadline) {
  const s = normDeadline(deadline);
  if (!s) return NaN;
  return new Date(s + ':00+07:00').getTime();
}

function subtractDays(dateStr, days) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() - days);
  const yy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(dt.getUTCDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

function fmtDateVN(dateStr) {
  const [y, m, d] = dateStr.split('-');
  return `${d}/${m}/${y}`;
}

async function runCheck() {
  const [members, tasks, sentKeys] = await Promise.all([
    dataService.getAllMembers(),
    dataService.getAllTasks(),
    dataService.getReminderLogKeys(),
  ]);

  const now = new Date();
  const { dateStr: todayStr, hh, mm } = vnParts(now);
  const nowMin = Number(hh) * 60 + Number(mm);
  const windowMin = Math.ceil(CHECK_INTERVAL_MS / 60000);
  const newKeys = [];

  // Nhac hen can push; con tinh vi pham qua han (ben duoi) van chay ke ca khi chua bat push
  for (const member of (push.enabled ? members : [])) {
    const settings = member.reminderSettings;
    if (!settings) continue;

    const myTasks = tasks.filter(
      (t) => t.status !== 'hoan_thanh' && Array.isArray(t.assignees) && t.assignees.includes(member.id)
    );
    if (myTasks.length === 0) continue;

    // ===== 1) Nhac hang ngay (gom theo ngay het han) =====
    const dailyRules = Array.isArray(settings.dailyRules) ? settings.dailyRules : [];
    for (const rule of dailyRules) {
      const [rh, rm] = rule.time.split(':').map(Number);
      const ruleMin = rh * 60 + rm;
      if (!(nowMin >= ruleMin && nowMin < ruleMin + windowMin)) continue;

      const targetDeadlineDateStr = subtractDays(todayStr, -rule.daysBefore);
      const groupKey = `daily:${member.id}:${rule.daysBefore}:${rule.time}:${targetDeadlineDateStr}`;
      if (sentKeys.has(groupKey)) continue;

      const dueTasks = myTasks.filter((t) => deadlineDateStr(t.deadline) === targetDeadlineDateStr);
      if (dueTasks.length > 0) {
        const body = `Bạn có ${dueTasks.length} công việc cần hoàn thành vào ngày ${fmtDateVN(targetDeadlineDateStr)}.`;
        try {
          await push.sendToMember(member, {
            title: 'Workline - Nhắc hẹn công việc',
            body,
            tag: 'reminder-' + groupKey,
          });
        } catch (err) {
          console.error('[reminder] Gửi nhắc hằng ngày lỗi:', err);
        }
      }
      newKeys.push(groupKey);
    }

    // ===== 2) Nhac truoc han theo gio (tung task rieng, thanh vien tu chon so gio) =====
    const hourRules = Array.isArray(settings.hourRules) ? settings.hourRules : [];
    if (hourRules.length > 0) {
      for (const t of myTasks) {
        const deadlineMs = deadlineToVNms(t.deadline);
        if (!Number.isFinite(deadlineMs)) continue;
        for (const rule of hourRules) {
          const targetMs = deadlineMs - rule.hoursBefore * 3600000;
          const key = `hour:${member.id}:${t.id}:${rule.hoursBefore}:${t.deadline}`;
          if (sentKeys.has(key)) continue;
          if (now.getTime() >= targetMs && now.getTime() < targetMs + CHECK_INTERVAL_MS) {
            try {
              await push.sendToMember(member, {
                title: 'Workline - Sắp đến hạn',
                body: `Công việc "${t.title}" cần hoàn thành trong ${rule.hoursBefore} giờ nữa (hạn: ${deadlineTimeStr(t.deadline)} ngày ${fmtDateVN(deadlineDateStr(t.deadline))}).`,
                tag: 'reminder-' + key,
              });
            } catch (err) {
              console.error('[reminder] Gửi nhắc trước hạn lỗi:', err);
            }
            newKeys.push(key);
          }
        }
      }
    }
  }

  if (newKeys.length > 0) {
    await dataService.appendReminderLogKeys(newKeys);
  }

  await checkOverdueViolations(members, tasks);
}

// Tu dong tinh VI PHAM khi task QUA HAN (tieu chi QH-01 "Tre han / qua han cong viec"):
//  - Task chua hoan thanh ma da qua han chot, HOAC da hoan thanh nhung tre han (completedAt > deadline).
//  - Ap dung cho tung thanh vien duoc giao (assignees), moi (task, thanh vien) toi da 1 vi pham.
//  - Ghi thang vao member.violations (status "xac_nhan", nguoi lap "He thong (tu dong)") nen hien ngay
//    trong muc Vi pham & tinh vao diem chuyen can; dong thoi gui thong bao trong app + push cho dung thanh vien.
//  - Chi tinh cho task co han chot SAU thoi diem bat tinh nang (dat AUTO_VIOLATION_BACKFILL=true de tinh ca task cu).
const AUTO_VIOLATION_BACKFILL = String(process.env.AUTO_VIOLATION_BACKFILL || '').toLowerCase() === 'true';

async function checkOverdueViolations(members, tasks) {
  const since = AUTO_VIOLATION_BACKFILL ? 0 : await dataService.ensureAutoViolationSince();
  const nowMs = Date.now();

  for (const task of tasks) {
    const deadlineMs = deadlineToVNms(task.deadline);
    if (!Number.isFinite(deadlineMs) || deadlineMs < since) continue;

    const isDone = task.status === 'hoan_thanh';
    if (isDone) {
      const completedMs = Date.parse(task.completedAt || '');
      if (!Number.isFinite(completedMs) || completedMs <= deadlineMs) continue; // xong dung han / khong ro
    } else if (nowMs <= deadlineMs) {
      continue; // chua toi han
    }

    const assignees = Array.isArray(task.assignees) ? task.assignees : [];
    for (const memberId of assignees) {
      const member = members.find((m) => m.id === memberId);
      if (!member) continue;

      const key = `overdue:${task.id}:${memberId}`;
      const dl = `${deadlineTimeStr(task.deadline)} ngày ${fmtDateVN(deadlineDateStr(task.deadline))}`;
      const taskLabel = task.code ? `${task.code} - ${task.title}` : task.title;

      try {
        const violation = await dataService.addAutoViolation({
          memberId,
          key,
          // Da co vi pham QH-01 cho cung task (vd Admin/Leader lap tay) -> khong tao trung
          isDuplicate: (m) =>
            (m.violations || []).some((v) => v.taskId === task.id && v.categoryCode === 'QH-01'),
          build: (existingCount) => ({
            id: 'v' + uuidv4(),
            date: vnParts(new Date()).dateStr,
            note: `Quá hạn công việc: ${taskLabel}`.slice(0, 500),
            taskId: task.id,
            code: `VP-${100000 + existingCount + 1}`,
            categoryCode: 'QH-01',
            categoryGroup: 'Tiến độ & Hạn chót',
            categoryLabel: 'Trễ hạn / quá hạn công việc',
            severity: 'trungbinh',
            status: 'xac_nhan',
            reportedByName: 'Hệ thống (tự động)',
            directContact: false,
            description: `Hệ thống tự động ghi nhận: công việc "${task.title}" có hạn chót ${dl} nhưng ${
              isDone ? 'được hoàn thành trễ hạn' : 'chưa hoàn thành'
            }.`,
            auto: true,
          }),
        });
        if (!violation) continue;

        const notif = {
          id: violation.id,
          to: member.id,
          toName: member.name,
          subject: 'Bạn đã vi phạm',
          body: isDone
            ? `Bạn đã vi phạm vì hoàn thành task "${task.title}" trễ hạn (hạn: ${dl}).`
            : `Bạn đã vi phạm vì chưa hoàn thành task "${task.title}" đúng hạn (hạn: ${dl}).`,
          time: new Date().toISOString(),
          taskId: task.id,
        };
        const created = await dataService.saveNotifications(SYSTEM_REQUESTER, [notif]);
        await push.pushForNotifications(SYSTEM_REQUESTER, created);
      } catch (err) {
        console.error('[violation] Ghi nhận vi phạm quá hạn lỗi:', err);
      }
    }
  }
}

function startReminderScheduler() {
  if (!push.enabled) {
    console.warn('[reminder] Push chưa bật (thiếu VAPID) — chỉ chạy kiểm tra vi phạm quá hạn, không gửi nhắc hẹn/push.');
  }
  runCheck().catch((err) => console.error('[reminder] Lỗi lần kiểm tra đầu tiên:', err));
  setInterval(() => {
    runCheck().catch((err) => console.error('[reminder] Lỗi kiểm tra nhắc hẹn:', err));
  }, CHECK_INTERVAL_MS);
  console.log('[reminder] Đã bật lịch kiểm tra nhắc hẹn + vi phạm quá hạn (mỗi 5 phút).');
}

module.exports = { startReminderScheduler };
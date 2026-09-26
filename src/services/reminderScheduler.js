const dataService = require('./dataService');
const push = require('./push');

const CHECK_INTERVAL_MS = 5 * 60 * 1000; // 5 phut/lan
const TZ = 'Asia/Ho_Chi_Minh';

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

  for (const member of members) {
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
}

function startReminderScheduler() {
  if (!push.enabled) {
    console.warn('[reminder] Push chưa bật (thiếu VAPID) — tắt lịch nhắc hẹn.');
    return;
  }
  runCheck().catch((err) => console.error('[reminder] Lỗi lần kiểm tra đầu tiên:', err));
  setInterval(() => {
    runCheck().catch((err) => console.error('[reminder] Lỗi kiểm tra nhắc hẹn:', err));
  }, CHECK_INTERVAL_MS);
  console.log('[reminder] Đã bật lịch kiểm tra nhắc hẹn (mỗi 5 phút).');
}

module.exports = { startReminderScheduler };
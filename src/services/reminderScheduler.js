const dataService = require('./dataService');
const push = require('./push');

const CHECK_INTERVAL_MS = 5 * 60 * 1000; // 5 phut/lan
const TZ = 'Asia/Ho_Chi_Minh';
const OFFSET_LABELS = { 60: '1 giờ', 180: '3 giờ', 1440: '1 ngày' };

function vnParts(date) {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  });
  const p = Object.fromEntries(fmt.formatToParts(date).map((x) => [x.type, x.value]));
  return { dateStr: `${p.year}-${p.month}-${p.day}`, hh: p.hour, mm: p.minute };
}

function isWithinDailyWindow(now, dailyTime) {
  const { hh, mm } = vnParts(now);
  const nowMinutes = Number(hh) * 60 + Number(mm);
  const [th, tm] = dailyTime.split(':').map(Number);
  const targetMinutes = th * 60 + tm;
  const windowMin = Math.ceil(CHECK_INTERVAL_MS / 60000);
  return nowMinutes >= targetMinutes && nowMinutes < targetMinutes + windowMin;
}

// deadline luu dang "YYYY-MM-DDTHH:mm" (hoac "YYYY-MM-DD") - la gio Viet Nam nguoi dung da chon,
// nen so sanh truc tiep chuoi/tinh toan thu cong, khong parse qua Date() de tranh lech mui gio server.
function normDeadline(deadline) {
  if (!deadline) return '';
  return deadline.length === 10 ? deadline + 'T23:59' : deadline.slice(0, 16);
}

function deadlineDateStr(deadline) {
  return normDeadline(deadline).slice(0, 10);
}

function deadlineToVNms(deadline) {
  const s = normDeadline(deadline);
  if (!s) return NaN;
  return new Date(s + ':00+07:00').getTime();
}

function fmtDeadlineShort(deadline) {
  const s = normDeadline(deadline);
  const [datePart, timePart] = s.split('T');
  const [y, m, d] = datePart.split('-');
  return `${timePart} ngày ${d}/${m}/${y}`;
}

async function runCheck() {
  const [members, tasks, sentKeys] = await Promise.all([
    dataService.getAllMembers(),
    dataService.getAllTasks(),
    dataService.getReminderLogKeys(),
  ]);

  const now = new Date();
  const newKeys = [];

  for (const member of members) {
    const rs = member.reminderSettings;
    if (!rs) continue;

    const myTasks = tasks.filter(
      (t) => t.status !== 'hoan_thanh' && Array.isArray(t.assignees) && t.assignees.includes(member.id)
    );
    if (myTasks.length === 0) continue;

    // 1) Nhac hang ngay: gom cac task den han trong ngay hom nay
    if (rs.dailyTime && isWithinDailyWindow(now, rs.dailyTime)) {
      const { dateStr: todayStr } = vnParts(now);
      const key = `daily:${member.id}:${todayStr}`;
      if (!sentKeys.has(key)) {
        const dueToday = myTasks.filter((t) => deadlineDateStr(t.deadline) === todayStr);
        if (dueToday.length > 0) {
          const timeLabel =
            dueToday.length === 1
              ? fmtDeadlineShort(dueToday[0].deadline)
              : `hôm nay (${dueToday.length} công việc)`;
          try {
            await push.sendToMember(member, {
              title: 'Workline - Nhắc hẹn công việc',
              body: `Bạn có ${dueToday.length} công việc cần được hoàn thành vào ${timeLabel}.`,
              tag: 'reminder-daily-' + todayStr,
            });
          } catch (err) {
            console.error('[reminder] Gửi nhắc hằng ngày lỗi:', err);
          }
        }
        newKeys.push(key); // danh dau da kiem tra hom nay du co task hay khong, tranh lap
      }
    }

    // 2) Nhac truoc han
    if (Array.isArray(rs.beforeOffsets) && rs.beforeOffsets.length > 0) {
      for (const t of myTasks) {
        const deadlineMs = deadlineToVNms(t.deadline);
        if (!Number.isFinite(deadlineMs)) continue;
        for (const offset of rs.beforeOffsets) {
          const targetMs = deadlineMs - offset * 60000;
          const key = `before:${member.id}:${t.id}:${offset}:${t.deadline}`;
          if (sentKeys.has(key)) continue;
          if (now.getTime() >= targetMs && now.getTime() < targetMs + CHECK_INTERVAL_MS) {
            try {
              await push.sendToMember(member, {
                title: 'Workline - Sắp đến hạn',
                body: `Công việc "${t.title}" cần hoàn thành trong ${OFFSET_LABELS[offset] || offset + ' phút'} nữa (hạn: ${fmtDeadlineShort(t.deadline)}).`,
                tag: 'reminder-before-' + t.id + '-' + offset,
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
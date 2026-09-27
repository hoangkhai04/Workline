const express = require('express');
const { v4: uuidv4 } = require('uuid');

const dataService = require('../services/dataService');
const { requireAuth, requireRole } = require('../middleware/auth');
const { pushForNotifications } = require('../services/push');

const router = express.Router();

// GET /api/violations
//   - Admin/Leader: xem toan bo vi pham cua tat ca thanh vien
//   - Thanh vien thuong: chi xem vi pham cua chinh minh
router.get('/', requireAuth, async (req, res) => {
  try {
    const requester = await dataService.findMemberById(req.user.id);
    if (!requester) return res.status(401).json({ error: 'Vui lòng đăng nhập lại.' });

    const isManager = requester.role === 'admin' || requester.role === 'leader';
    const violations = isManager
      ? await dataService.getAllViolations()
      : await dataService.getViolationsFor(requester.id);

    return res.json({ violations });
  } catch (err) {
    console.error('List violations error:', err);
    return res.status(500).json({ error: 'Không tải được danh sách vi phạm.' });
  }
});

// POST /api/violations - Admin/Leader xac nhan 1 vi pham thu cong cho 1 thanh vien.
// Body: { memberId, reason, taskId? }
// -> Ghi vao bang violations, tao thong bao trong app va gui push ngay cho thanh vien do.
router.post('/', requireAuth, requireRole('admin', 'leader'), async (req, res) => {
  try {
    const requester = await dataService.findMemberById(req.user.id);
    if (!requester) return res.status(401).json({ error: 'Vui lòng đăng nhập lại.' });

    const { memberId, reason, taskId } = req.body || {};
    if (!memberId || typeof reason !== 'string' || !reason.trim()) {
      return res.status(400).json({ error: 'Thiếu thành viên hoặc lý do vi phạm.' });
    }

    const member = await dataService.findMemberById(String(memberId));
    if (!member) return res.status(404).json({ error: 'Không tìm thấy thành viên.' });

    let taskTitle = null;
    if (taskId) {
      const task = await dataService.findTaskById(String(taskId));
      taskTitle = task ? task.title : null;
    }

    const now = new Date().toISOString();
    const violation = {
      id: uuidv4(),
      key: `manual:${uuidv4()}`,
      memberId: member.id,
      memberName: member.name,
      type: 'manual',
      reason: reason.trim().slice(0, 500),
      taskId: taskId ? String(taskId) : null,
      taskTitle,
      confirmedBy: requester.id,
      confirmedByName: requester.name,
      createdAt: now,
    };

    await dataService.addViolation(violation);

    const notif = {
      id: violation.id,
      to: member.id,
      toName: member.name,
      subject: 'Bạn đã vi phạm',
      body: `Bạn đã vi phạm: ${violation.reason}`,
      time: now,
      taskId: violation.taskId,
    };
    const created = await dataService.saveNotifications(requester, [notif]);
    pushForNotifications(requester, created).catch((e) => console.error('Push violation error:', e));

    return res.json({ violation });
  } catch (err) {
    console.error('Create violation error:', err);
    return res.status(500).json({ error: 'Có lỗi xảy ra khi ghi nhận vi phạm.' });
  }
});

module.exports = router;
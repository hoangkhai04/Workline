const express = require('express');

const dataService = require('../services/dataService');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

// GET /api/notifications - thong bao gui cho nguoi dang dang nhap
router.get('/', requireAuth, async (req, res) => {
  try {
    const requester = await dataService.findMemberById(req.user.id);
    if (!requester) return res.status(401).json({ error: 'Vui lòng đăng nhập lại.' });
    const notifications = await dataService.getNotificationsFor(requester);
    return res.json({ notifications });
  } catch (err) {
    console.error('List notifications error:', err);
    return res.status(500).json({ error: 'Không tải được thông báo.' });
  }
});

// POST /api/notifications - gui thong bao moi / danh dau da doc
router.post('/', requireAuth, async (req, res) => {
  try {
    const requester = await dataService.findMemberById(req.user.id);
    if (!requester) return res.status(401).json({ error: 'Vui lòng đăng nhập lại.' });

    const list = req.body && req.body.notifications;
    if (!Array.isArray(list) || list.length > 500) {
      return res.status(400).json({ error: 'Dữ liệu thông báo không hợp lệ.' });
    }
    const valid = list.filter((n) => n && typeof n.id === 'string' && n.id && typeof n.to === 'string' && n.to);
    await dataService.saveNotifications(requester, valid);
    return res.json({ ok: true });
  } catch (err) {
    console.error('Save notifications error:', err);
    return res.status(500).json({ error: 'Có lỗi xảy ra khi lưu thông báo.' });
  }
});

// POST /api/notifications/delete - xoa thong bao cua chinh minh
router.post('/delete', requireAuth, async (req, res) => {
  try {
    const requester = await dataService.findMemberById(req.user.id);
    if (!requester) return res.status(401).json({ error: 'Vui lòng đăng nhập lại.' });

    const ids = req.body && req.body.ids;
    if (!Array.isArray(ids)) return res.status(400).json({ error: 'Dữ liệu không hợp lệ.' });
    await dataService.deleteNotifications(requester, ids.map(String));
    return res.json({ ok: true });
  } catch (err) {
    console.error('Delete notifications error:', err);
    return res.status(500).json({ error: 'Có lỗi xảy ra khi xóa thông báo.' });
  }
});

module.exports = router;
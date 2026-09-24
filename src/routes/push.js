const express = require('express');

const dataService = require('../services/dataService');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

// GET /api/push/public-key - khoa cong khai de trinh duyet dang ky
router.get('/public-key', (req, res) => {
  res.json({ key: process.env.VAPID_PUBLIC_KEY || null });
});

// POST /api/push/subscribe - luu dia chi nhan push cua trinh duyet nay
router.post('/subscribe', requireAuth, async (req, res) => {
  try {
    const sub = req.body || {};
    if (
      typeof sub.endpoint !== 'string' ||
      !sub.endpoint.startsWith('https://') ||
      !sub.keys ||
      typeof sub.keys.p256dh !== 'string' ||
      typeof sub.keys.auth !== 'string'
    ) {
      return res.status(400).json({ error: 'Dữ liệu đăng ký không hợp lệ.' });
    }
    await dataService.savePushSubscription(req.user.id, sub);
    return res.json({ ok: true });
  } catch (err) {
    console.error('Subscribe push error:', err);
    return res.status(500).json({ error: 'Không lưu được đăng ký thông báo.' });
  }
});

module.exports = router;
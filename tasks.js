const express = require('express');

const dataService = require('../services/dataService');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

const isManager = (m) => m && (m.role === 'admin' || m.role === 'leader');

// GET /api/tasks - lay toan bo task
router.get('/', requireAuth, async (req, res) => {
  try {
    const tasks = await dataService.getAllTasks();
    return res.json({ tasks });
  } catch (err) {
    console.error('List tasks error:', err);
    return res.status(500).json({ error: 'Không tải được danh sách task.' });
  }
});

// PUT /api/tasks/:id - tao moi hoac cap nhat task
router.put('/:id', requireAuth, async (req, res) => {
  try {
    const requester = await dataService.findMemberById(req.user.id);
    if (!requester) return res.status(401).json({ error: 'Vui lòng đăng nhập lại.' });

    const body = req.body || {};
    if (typeof body.title !== 'string' || !body.title.trim()) {
      return res.status(400).json({ error: 'Task thiếu tiêu đề.' });
    }

    const existing = await dataService.findTaskById(req.params.id);
    const task = { ...body, id: req.params.id };

    if (!existing) {
      // Tao moi: chi Admin/Leader duoc giao task
      if (!isManager(requester)) {
        return res.status(403).json({ error: 'Chỉ Admin hoặc Leader mới được giao task.' });
      }
      task.creator = requester.id;
    } else {
      // Cap nhat: Admin/Leader, nguoi tao, hoac nguoi duoc giao
      const isAssignee = Array.isArray(existing.assignees) && existing.assignees.includes(requester.id);
      if (!isManager(requester) && existing.creator !== requester.id && !isAssignee) {
        return res.status(403).json({ error: 'Bạn không có quyền sửa task này.' });
      }
    }

    const saved = await dataService.upsertTask(task);
    return res.json({ task: saved });
  } catch (err) {
    console.error('Upsert task error:', err);
    return res.status(500).json({ error: 'Có lỗi xảy ra khi lưu task.' });
  }
});

// DELETE /api/tasks/:id
router.delete('/:id', requireAuth, async (req, res) => {
  try {
    const requester = await dataService.findMemberById(req.user.id);
    if (!requester) return res.status(401).json({ error: 'Vui lòng đăng nhập lại.' });

    const existing = await dataService.findTaskById(req.params.id);
    if (!existing) return res.json({ ok: true });

    if (!isManager(requester) && existing.creator !== requester.id) {
      return res.status(403).json({ error: 'Bạn không có quyền xóa task này.' });
    }

    await dataService.deleteTask(req.params.id);
    return res.json({ ok: true });
  } catch (err) {
    console.error('Delete task error:', err);
    return res.status(500).json({ error: 'Có lỗi xảy ra khi xóa task.' });
  }
});

module.exports = router;
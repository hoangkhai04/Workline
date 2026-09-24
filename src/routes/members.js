const express = require('express');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');

const dataService = require('../services/dataService');
const { sendInviteEmail } = require('../config/mailer');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();

function generateTempPassword() {
  // Mat khau tam de doc, vi du: WL-73f2a9
  return 'WL-' + Math.random().toString(36).slice(2, 8);
}

// GET /api/members - lay danh sach thanh vien (khong tra ve passwordHash)
router.get('/', requireAuth, async (req, res) => {
  try {
    const members = await dataService.getAllMembers();
    const safe = members.map(({ passwordHash, ...rest }) => rest);
    return res.json({ members: safe });
  } catch (err) {
    console.error('List members error:', err);
    return res.status(500).json({ error: 'Không tải được danh sách thành viên.' });
  }
});

// POST /api/members - Admin/Leader them thanh vien moi -> gui email moi voi mat khau tam
router.post('/', requireAuth, requireRole('admin', 'leader'), async (req, res) => {
  try {
    const { name, email, role, displayName, phone, team, code, avatarUrl } = req.body;
    if (!name || !email || !role) {
      return res.status(400).json({ error: 'Vui lòng nhập đủ tên, email và vai trò.' });
    }
    if (role === 'admin' && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Chỉ Quản trị viên mới có quyền cấp vai trò Admin.' });
    }

    const existing = await dataService.findMemberByEmail(email.trim());
    if (existing) {
      return res.status(409).json({ error: 'Email này đã tồn tại trong hệ thống.' });
    }

    const tempPassword = generateTempPassword();
    const passwordHash = await bcrypt.hash(tempPassword, 10);

    const newMember = {
      id: uuidv4(),
      name: name.trim(),
      email: email.trim(),
      role,
      displayName: (displayName || '').trim(),
      phone: (phone || '').trim(),
      team: (team || '').trim(),
      code: (code || '').trim(),
      avatarUrl: avatarUrl || undefined,
      violations: [],
      passwordHash,
      createdBy: req.user.id,
      createdByName: req.user.name,
      createdAt: new Date().toISOString(),
    };

    await dataService.addMember(newMember);

    try {
      await sendInviteEmail({
        to: newMember.email,
        name: newMember.name,
        email: newMember.email,
        tempPassword,
        role: newMember.role,
      });
    } catch (mailErr) {
      console.error('Send invite email failed:', mailErr);
      // Thanh vien van duoc tao, chi bao loi gui mail de admin biet va gui lai thu cong
      const { passwordHash: _drop, ...safeMember } = newMember;
      return res.status(201).json({
        member: safeMember,
        warning: 'Đã tạo thành viên nhưng gửi email mời thất bại. Vui lòng kiểm tra cấu hình email hoặc gửi thông tin thủ công.',
      });
    }

    const { passwordHash: _drop, ...safeMember } = newMember;
    return res.status(201).json({ member: safeMember });
  } catch (err) {
    console.error('Add member error:', err);
    return res.status(500).json({ error: 'Có lỗi xảy ra khi thêm thành viên.' });
  }
});

const VALID_ROLES = ['admin', 'leader', 'member'];

// PUT /api/members/:id - cap nhat thong tin thanh vien (khong doi mat khau qua route nay)
router.put('/:id', requireAuth, requireRole('admin', 'leader'), async (req, res) => {
  try {
    const requester = await dataService.findMemberById(req.user.id);
    if (!requester) return res.status(401).json({ error: 'Vui lòng đăng nhập lại.' });

    const target = await dataService.findMemberById(req.params.id);
    if (!target) return res.status(404).json({ error: 'Không tìm thấy thành viên.' });

    const isSelf = requester.id === target.id;
    const { name, displayName, phone, team, code, avatarUrl, violations, role } = req.body;

    // ----- Kiem tra quyen doi vai tro / sua nguoi khac -----
    if (requester.role === 'leader') {
      if (target.role === 'admin') {
        return res.status(403).json({ error: 'Leader không được chỉnh sửa Quản trị viên.' });
      }
      if (role === 'admin') {
        return res.status(403).json({ error: 'Chỉ Quản trị viên mới có quyền cấp vai trò Admin.' });
      }
    }
    if (role !== undefined) {
      if (!VALID_ROLES.includes(role)) {
        return res.status(400).json({ error: 'Vai trò không hợp lệ.' });
      }
      if (role !== target.role) {
        if (requester.role !== 'admin' && target.role === 'leader') {
          return res.status(403).json({ error: 'Chỉ Quản trị viên mới có quyền xoá vai trò của Leader.' });
        }
        if (isSelf) {
          return res.status(403).json({ error: 'Bạn không thể tự thay đổi vai trò của chính mình.' });
        }
        const isCreatorOfRequester =
          (requester.createdBy && requester.createdBy === target.id) ||
          (target.email || '').toLowerCase() === 'danhhoangkhai03@gmail.com' ||
          target.code === 'WL-100';
        if (target.role === 'admin' && isCreatorOfRequester) {
          return res.status(403).json({ error: 'Không thể thay đổi vai trò của Quản trị viên đã tạo tài khoản của bạn.' });
        }
      }
    }

    // ----- Gom cac truong duoc phep cap nhat -----
    const updates = {};
    if (typeof name === 'string' && name.trim()) updates.name = name.trim();
    if (typeof displayName === 'string') updates.displayName = displayName.trim();
    if (typeof phone === 'string') updates.phone = phone.trim();
    if (typeof team === 'string') updates.team = team.trim();
    if (typeof avatarUrl === 'string') updates.avatarUrl = avatarUrl.trim() || undefined;
    if (role !== undefined) updates.role = role;

    if (typeof code === 'string' && code.trim()) {
      const all = await dataService.getAllMembers();
      const dup = all.find(
        (m) => m.id !== target.id && (m.code || '').toLowerCase() === code.trim().toLowerCase()
      );
      if (dup) return res.status(409).json({ error: `Mã ${code.trim()} đã thuộc về ${dup.name}.` });
      updates.code = code.trim();
    }

    if (Array.isArray(violations)) {
      updates.violations = violations
        .filter((v) => v && v.date && v.note)
        .map((v) => ({
          id: String(v.id || 'v' + Date.now()),
          date: String(v.date),
          note: String(v.note).slice(0, 500),
          ...(v.taskId ? { taskId: String(v.taskId) } : {}),
        }));
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: 'Không có dữ liệu hợp lệ để cập nhật.' });
    }

    const updated = await dataService.updateMember(target.id, updates);
    const { passwordHash, ...safeMember } = updated;
    return res.json({ member: safeMember });
  } catch (err) {
    console.error('Update member error:', err);
    return res.status(500).json({ error: 'Có lỗi xảy ra khi cập nhật thành viên.' });
  }
});

// ===================================================================
// DÁN ĐOẠN NÀY VÀO src/routes/members.js, NGAY TRÊN DÒNG:
//     module.exports = router;
// (dùng lại các biến đã có sẵn trong file: router, dataService, bcrypt,
//  generateTempPassword, sendInviteEmail)
// ===================================================================

// ----- Gui lai email moi (sinh mat khau tam moi) -----
const RESEND_INVITE_COOLDOWN_MS = 60 * 1000; // chong bam lien tuc: toi da 1 lan / 60s / thanh vien
const lastInviteSent = new Map(); // memberId -> timestamp

// POST /api/members/:id/resend-invite
router.post('/:id/resend-invite', requireAuth, requireRole('admin', 'leader'), async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Vui lòng đăng nhập.' });
    }

    // Lay nguoi thuc hien tu du lieu that thay vi tin vao noi dung token
    const requester = await dataService.findMemberById(req.user.id);
    if (!requester || (requester.role !== 'admin' && requester.role !== 'leader')) {
      return res.status(403).json({ error: 'Bạn không có quyền gửi lại email mời.' });
    }

    const target = await dataService.findMemberById(req.params.id);
    if (!target) {
      return res.status(404).json({ error: 'Không tìm thấy thành viên này trên máy chủ.' });
    }

    if (target.id === requester.id) {
      return res.status(400).json({ error: 'Bạn không thể gửi lại email mời cho chính mình.' });
    }
    // Khop voi giao dien: Leader chi thao tac voi thanh vien thuong
    if (requester.role === 'leader' && target.role !== 'member') {
      return res.status(403).json({ error: 'Leader chỉ được gửi lại email mời cho thành viên thường.' });
    }
    // Khong dong vao Admin da tao tai khoan cua minh
    if (requester.createdBy && requester.createdBy === target.id) {
      return res.status(403).json({ error: 'Không thể thao tác với Quản trị viên đã tạo tài khoản của bạn.' });
    }

    const wait = RESEND_INVITE_COOLDOWN_MS - (Date.now() - (lastInviteSent.get(target.id) || 0));
    if (wait > 0) {
      return res.status(429).json({ error: `Vui lòng đợi ${Math.ceil(wait / 1000)} giây trước khi gửi lại.` });
    }

    const tempPassword = generateTempPassword();
    const newHash = await bcrypt.hash(tempPassword, 10);
    const oldHash = target.passwordHash;

    // Luu mat khau moi truoc, gui mail sau; neu gui mail loi thi tra ve mat khau cu
    // de viec gui that bai KHONG lam mat kha nang dang nhap cua thanh vien.
    await dataService.updateMember(target.id, { passwordHash: newHash });

    try {
      await sendInviteEmail({
        to: target.email,
        name: target.name,
        email: target.email,
        tempPassword,
        role: target.role,
      });
    } catch (mailErr) {
      console.error('Resend invite email failed:', mailErr);
      await dataService.updateMember(target.id, { passwordHash: oldHash });
      return res.status(502).json({
        error: 'Gửi email mời thất bại nên mật khẩu của thành viên được giữ nguyên. Vui lòng kiểm tra cấu hình email rồi thử lại.',
      });
    }

    lastInviteSent.set(target.id, Date.now());
    console.log('[resend-invite] da gui lai email moi toi', target.email);
    return res.json({ message: `Đã gửi lại email mời tới ${target.email}.` });
  } catch (err) {
    console.error('Resend-invite error:', err);
    return res.status(500).json({ error: 'Có lỗi xảy ra, vui lòng thử lại sau.' });
  }
});

module.exports = router;

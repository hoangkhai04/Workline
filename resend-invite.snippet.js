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
router.post('/:id/resend-invite', async (req, res) => {
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

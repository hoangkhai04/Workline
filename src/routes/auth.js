const express = require('express');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');

const dataService = require('../services/dataService');
const { sendResetOtpEmail } = require('../config/mailer');
const { signToken } = require('../middleware/auth');

const router = express.Router();

const OTP_TTL_MS = 10 * 60 * 1000; // ma OTP co hieu luc 10 phut
const OTP_RESEND_COOLDOWN_MS = 60 * 1000; // khop OTP_RESEND_SECONDS = 60 o giao dien
const OTP_MAX_ATTEMPTS = 5; // nhap sai qua 5 lan thi phai xin ma moi

const hashOtp = (otp, salt) => crypto.createHmac('sha256', salt).update(otp).digest('hex');
const safeEqualHex = (a, b) => {
  const A = Buffer.from(a, 'hex');
  const B = Buffer.from(b, 'hex');
  return A.length === B.length && crypto.timingSafeEqual(A, B);
};

// POST /api/auth/login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Vui lòng nhập email và mật khẩu.' });
    }

    const member = await dataService.findMemberByEmail(email.trim());
    if (!member) {
      return res.status(401).json({ error: 'Email hoặc mật khẩu không chính xác.' });
    }

    const isValid = await bcrypt.compare(password, member.passwordHash || '');
    if (!isValid) {
      return res.status(401).json({ error: 'Email hoặc mật khẩu không chính xác.' });
    }

    const token = signToken(member);
    const { passwordHash, ...safeMember } = member;
    return res.json({ token, member: safeMember });
  } catch (err) {
    console.error('Login error:', err);
    return res.status(500).json({ error: 'Có lỗi xảy ra, vui lòng thử lại sau.' });
  }
});

// POST /api/auth/forgot-password  { email }  ->  gui ma OTP 6 so qua email
router.post('/forgot-password', async (req, res) => {
  const GENERIC_MSG =
    'Nếu email này tồn tại trong hệ thống, mã OTP đã được gửi tới hộp thư của bạn. Mã có hiệu lực trong 10 phút.';
  try {
    const email = String((req.body && req.body.email) || '').trim();
    if (!email) {
      return res.status(400).json({ error: 'Vui lòng nhập email.' });
    }

    const member = await dataService.findMemberByEmail(email);

    // Luon tra ve thong bao giong nhau de khong lo email nao ton tai trong he thong
    if (!member) {
      return res.json({ message: GENERIC_MSG });
    }

    // Chong spam: neu vua gui ma trong vong 60s thi khong gui them (van tra thong bao chung)
    const existing = await dataService.findResetOtp(member.id);
    if (existing && Date.now() - existing.sentAt < OTP_RESEND_COOLDOWN_MS) {
      return res.json({ message: GENERIC_MSG });
    }

    const otp = String(crypto.randomInt(0, 1000000)).padStart(6, '0');
    const salt = crypto.randomBytes(16).toString('hex');
    const now = Date.now();

    await dataService.saveResetOtp({
      memberId: member.id,
      hash: hashOtp(otp, salt),
      salt,
      expiresAt: now + OTP_TTL_MS,
      sentAt: now,
      attempts: 0,
    });

    try {
      await sendResetOtpEmail({ to: member.email, name: member.name, otp });
    } catch (mailErr) {
      // Gui mail that bai: xoa OTP de nguoi dung co the thu lai ngay
      await dataService.deleteResetOtp(member.id);
      throw mailErr;
    }

    console.log('[forgot-password] da gui ma OTP toi', member.email);
    return res.json({ message: GENERIC_MSG });
  } catch (err) {
    console.error('Forgot-password error:', err);
    return res.status(500).json({ error: 'Không thể gửi email lúc này. Vui lòng thử lại sau.' });
  }
});

// POST /api/auth/reset-password
//   Luong OTP:  { email, otp, newPassword }
//   Luong link cu (giu lai tuong thich): { token, newPassword }
router.post('/reset-password', async (req, res) => {
  try {
    const { token, email, otp, newPassword } = req.body || {};
    if (!newPassword) {
      return res.status(400).json({ error: 'Thiếu mật khẩu mới.' });
    }
    if (newPassword.length < 6) {
      return res.status(400).json({ error: 'Mật khẩu mới phải có ít nhất 6 ký tự.' });
    }

    // ---- Luong OTP 6 so ----
    if (otp) {
      const INVALID = 'Mã OTP không chính xác hoặc đã hết hạn.';
      const code = String(otp).trim();

      const member = email ? await dataService.findMemberByEmail(String(email).trim()) : null;
      const entry = member ? await dataService.findResetOtp(member.id) : null;
      if (!entry) {
        return res.status(400).json({ error: INVALID });
      }
      if (Date.now() > entry.expiresAt) {
        await dataService.deleteResetOtp(member.id);
        return res.status(400).json({ error: INVALID });
      }
      if (entry.attempts >= OTP_MAX_ATTEMPTS) {
        await dataService.deleteResetOtp(member.id);
        return res.status(400).json({ error: 'Bạn đã nhập sai quá nhiều lần. Vui lòng yêu cầu mã mới.' });
      }

      const valid = /^\d{6}$/.test(code) && safeEqualHex(hashOtp(code, entry.salt), entry.hash);
      if (!valid) {
        await dataService.updateResetOtp(member.id, { attempts: entry.attempts + 1 });
        return res.status(400).json({ error: INVALID });
      }

      const passwordHash = await bcrypt.hash(newPassword, 10);
      await dataService.updateMember(member.id, { passwordHash });
      await dataService.deleteResetOtp(member.id);

      return res.json({ message: 'Đặt lại mật khẩu thành công. Bạn có thể đăng nhập ngay.' });
    }

    // ---- Luong link cu ----
    if (!token) {
      return res.status(400).json({ error: 'Thiếu mã OTP hoặc token.' });
    }

    const entry = await dataService.findResetToken(token);
    if (!entry) {
      return res.status(400).json({ error: 'Liên kết không hợp lệ hoặc đã được sử dụng.' });
    }
    if (Date.now() > entry.expiresAt) {
      await dataService.deleteResetToken(token);
      return res.status(400).json({ error: 'Liên kết đã hết hạn. Vui lòng yêu cầu lại.' });
    }

    const passwordHash = await bcrypt.hash(newPassword, 10);
    await dataService.updateMember(entry.memberId, { passwordHash });
    await dataService.deleteResetToken(token);

    return res.json({ message: 'Đặt lại mật khẩu thành công. Bạn có thể đăng nhập ngay.' });
  } catch (err) {
    console.error('Reset-password error:', err);
    return res.status(500).json({ error: 'Có lỗi xảy ra, vui lòng thử lại sau.' });
  }
});

module.exports = router;

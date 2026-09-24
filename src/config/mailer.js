const nodemailer = require('nodemailer');

/**
 * Cau hinh SMTP qua bien moi truong. Vi du voi Gmail:
 *   SMTP_HOST=smtp.gmail.com
 *   SMTP_PORT=465
 *   SMTP_SECURE=true
 *   SMTP_USER=ten.ban@gmail.com
 *   SMTP_PASS=matkhau_ung_dung_16_ky_tu   (App Password, KHONG dung mat khau Gmail thuong)
 *   MAIL_FROM="Workline" <ten.ban@gmail.com>
 *
 * Voi cac dich vu khac (SendGrid, Mailgun, Resend SMTP...) chi can doi HOST/PORT/USER/PASS tuong ung.
 */
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT || 587),
  secure: String(process.env.SMTP_SECURE || 'false') === 'true',
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

const FROM = process.env.MAIL_FROM || process.env.SMTP_USER;
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5500';

async function sendInviteEmail({ to, name, email, tempPassword, role }) {
  const loginUrl = FRONTEND_URL;
  const roleLabel = role === 'admin' ? 'Quản trị viên' : role === 'leader' ? 'Trưởng nhóm' : 'Thành viên';

  await transporter.sendMail({
    from: FROM,
    to,
    subject: 'Tài khoản Workline của bạn đã được tạo',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 480px; margin: auto; color:#1e293b;">
        <h2 style="color:#2563eb;">Chào mừng đến với Workline 👋</h2>
        <p>Xin chào <b>${name}</b>,</p>
        <p>Quản lý của bạn vừa tạo một tài khoản Workline cho bạn với vai trò <b>${roleLabel}</b>.</p>
        <p>Thông tin đăng nhập:</p>
        <ul>
          <li>Email: <b>${email}</b></li>
          <li>Mật khẩu tạm thời: <b>${tempPassword}</b></li>
        </ul>
        <p>Vui lòng đăng nhập và đổi mật khẩu ngay sau khi vào hệ thống.</p>
        <p style="margin-top:24px;">
          <a href="${loginUrl}" style="background:#2563eb;color:#fff;padding:10px 20px;border-radius:8px;text-decoration:none;font-weight:bold;">
            Đăng nhập ngay
          </a>
        </p>
        <p style="font-size:12px;color:#64748b;margin-top:32px;">Nếu bạn không mong đợi email này, vui lòng liên hệ quản lý của bạn.</p>
      </div>
    `,
  });
}

// Gui ma OTP 6 so de dat lai mat khau (thay cho link resetToken)
async function sendResetOtpEmail({ to, name, otp }) {
  await transporter.sendMail({
    from: FROM,
    to,
    subject: 'Mã xác thực đặt lại mật khẩu Workline',
    text: `Mã xác thực của bạn là: ${otp}\nMã có hiệu lực trong 10 phút. Nếu bạn không yêu cầu, hãy bỏ qua email này.`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 480px; margin: auto; color:#1e293b;">
        <h2 style="color:#2563eb;">Mã xác thực đặt lại mật khẩu</h2>
        <p>Xin chào <b>${name || ''}</b>,</p>
        <p>Bạn (hoặc ai đó) vừa yêu cầu đặt lại mật khẩu cho tài khoản Workline này. Nhập mã bên dưới vào trang đăng nhập:</p>
        <p style="font-size:34px;font-weight:700;letter-spacing:10px;margin:24px 0;color:#0f172a;">${otp}</p>
        <p>Mã có hiệu lực trong <b>10 phút</b>. Đừng chia sẻ mã này với bất kỳ ai.</p>
        <p style="font-size:12px;color:#64748b;margin-top:32px;">Nếu bạn không yêu cầu điều này, có thể bỏ qua email.</p>
      </div>
    `,
  });
}

// (Cu) Gui link resetToken - khong con duoc dung boi forgot-password nhung van giu de tuong thich
async function sendResetPasswordEmail({ to, name, resetToken }) {
  const resetUrl = `${FRONTEND_URL}?resetToken=${resetToken}`;

  await transporter.sendMail({
    from: FROM,
    to,
    subject: 'Khôi phục mật khẩu Workline',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 480px; margin: auto; color:#1e293b;">
        <h2 style="color:#2563eb;">Yêu cầu khôi phục mật khẩu</h2>
        <p>Xin chào <b>${name || ''}</b>,</p>
        <p>Bạn (hoặc ai đó) vừa yêu cầu đặt lại mật khẩu cho tài khoản Workline này.</p>
        <p>Bấm vào nút bên dưới để đặt mật khẩu mới. Liên kết có hiệu lực trong 30 phút:</p>
        <p style="margin-top:24px;">
          <a href="${resetUrl}" style="background:#2563eb;color:#fff;padding:10px 20px;border-radius:8px;text-decoration:none;font-weight:bold;">
            Đặt lại mật khẩu
          </a>
        </p>
        <p style="font-size:12px;color:#64748b;margin-top:32px;">Nếu bạn không yêu cầu điều này, có thể bỏ qua email.</p>
      </div>
    `,
  });
}

module.exports = { transporter, sendInviteEmail, sendResetOtpEmail, sendResetPasswordEmail };

async function sendViaBrevo({ to, subject, html, text }) {
  const raw = String(process.env.MAIL_FROM || process.env.SMTP_USER || '').trim();
  const m = raw.match(/^"?([^"<]*)"?\s*<([^>]+)>$/);
  const sender = m
    ? { name: m[1].trim() || 'Workline', email: m[2].trim() }
    : { name: 'Workline', email: raw };

  const recipients = (Array.isArray(to) ? to : [to]).map((e) => ({ email: String(e).trim() }));

  const res = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: {
      'api-key': process.env.BREVO_API_KEY,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({
      sender,
      to: recipients,
      subject,
      htmlContent: html || `<p>${text || ''}</p>`,
      ...(text ? { textContent: text } : {}),
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Brevo ${res.status}: ${body}`);
  }
}

// Giu ten "transporter.sendMail" de cac ham ben duoi khong phai sua
const transporter = { sendMail: (opts) => sendViaBrevo(opts) };
const FROM = process.env.MAIL_FROM || process.env.SMTP_USER;
const FRONTEND_URL = process.env.FRONTEND_URL || 'https://hoangkhai04.github.io';

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

# Workline Server

Backend cho Workline: xác thực đăng nhập, gửi email mời khi Admin/Leader thêm
thành viên, quên/đặt lại mật khẩu qua email, dữ liệu được lưu trên **Google
Drive** (dưới dạng 1 file JSON trong thư mục Drive riêng của bạn).

## 1. Cài đặt

```bash
cd workline-server
npm install
cp .env.example .env
```

Sau đó mở `.env` và điền các giá trị theo hướng dẫn bên dưới.

## 2. Tạo Google Drive Service Account (nơi lưu dữ liệu)

1. Vào https://console.cloud.google.com/ → tạo project mới (hoặc dùng project có sẵn).
2. Vào **APIs & Services → Library**, tìm **Google Drive API** → bấm **Enable**.
3. Vào **APIs & Services → Credentials → Create Credentials → Service Account**.
   - Đặt tên bất kỳ, ví dụ `workline-drive-bot`.
   - Sau khi tạo xong, vào tab **Keys** của Service Account → **Add Key → Create new key → JSON**.
   - File JSON sẽ tự tải về máy — **giữ bí mật file này**.
4. Mở Google Drive của bạn → tạo 1 thư mục mới, ví dụ `Workline Data`.
5. Bấm chuột phải vào thư mục → **Share** → dán **email của Service Account**
   (dạng `xxxx@xxxx.iam.gserviceaccount.com`, có trong file JSON ở trường `client_email`)
   → chọn quyền **Editor**.
6. Mở thư mục đó trên trình duyệt, copy **ID thư mục** trong đường dẫn URL:
   `https://drive.google.com/drive/folders/ĐÂY_LÀ_FOLDER_ID`
7. Trong `.env`:
   - `GOOGLE_DRIVE_FOLDER_ID` = ID thư mục vừa copy.
   - `GOOGLE_SERVICE_ACCOUNT_JSON` = dán **nguyên nội dung** file JSON key vào (dán thành 1 dòng).

> Server sẽ tự tạo file `workline-db.json` trong thư mục đó ở lần chạy đầu tiên.

## 3. Cấu hình gửi email (SMTP)

Cách đơn giản nhất là dùng Gmail:

1. Bật xác minh 2 bước cho tài khoản Gmail: https://myaccount.google.com/security
2. Tạo **App Password**: https://myaccount.google.com/apppasswords → chọn app "Mail" → lấy mã 16 ký tự.
3. Điền vào `.env`:
   ```
   SMTP_HOST=smtp.gmail.com
   SMTP_PORT=465
   SMTP_SECURE=true
   SMTP_USER=ten-cong-ty@gmail.com
   SMTP_PASS=mã_app_password_16_ký_tự
   MAIL_FROM="Workline" <ten-cong-ty@gmail.com>
   ```

Nếu dùng dịch vụ khác (SendGrid, Mailgun, Resend, Zoho...) thì thay `SMTP_HOST/PORT/USER/PASS`
theo hướng dẫn của dịch vụ đó — code không cần đổi gì thêm.

## 4. Tạo tài khoản Admin đầu tiên

Vì dữ liệu ban đầu trống, cần tạo 1 Admin để đăng nhập lần đầu:

```bash
ADMIN_NAME="Tên bạn" ADMIN_EMAIL=admin@congty.vn ADMIN_PASSWORD=mat_khau_manh node src/scripts/seedAdmin.js
```

(hoặc thêm 3 dòng `ADMIN_NAME`, `ADMIN_EMAIL`, `ADMIN_PASSWORD` vào `.env` rồi chạy `npm run seed:admin`)

## 5. Chạy thử ở máy local

```bash
npm run dev
```

Server chạy tại `http://localhost:4000`. Thử bằng curl:

```bash
curl -X POST http://localhost:4000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"danhhoangkhai03@gmail.com","password":"Khaihoangworkline"}'
```

## 6. Đẩy code lên GitHub

```bash
git init
git add .
git commit -m "Workline server: auth, invite email, forgot password, Google Drive storage"
git branch -M main
git remote add origin https://github.com/<ten-ban>/workline-server.git
git push -u origin main
```

> File `.env` đã được thêm vào `.gitignore` nên sẽ **không** bị đẩy lên GitHub — đây là điều bắt buộc vì nó chứa mật khẩu/khoá bí mật.

## 7. Deploy server (để frontend gọi được thật)

Bạn cần deploy server này lên 1 nơi chạy Node.js 24/7, ví dụ (đều có gói miễn phí):

- **Render.com** → New → Web Service → chọn repo GitHub vừa đẩy → Build Command `npm install`, Start Command `npm start` → dán các biến môi trường ở mục **Environment**.
- **Railway.app** → New Project → Deploy from GitHub repo → thêm biến môi trường tương tự.

Sau khi deploy xong, bạn sẽ có 1 URL dạng `https://workline-server.onrender.com`.
Cập nhật lại biến `FRONTEND_URL` trỏ đúng domain nơi bạn host file `index.html`
(để email chứa đúng link đăng nhập / đặt lại mật khẩu).

## 8. Nối với frontend (`index.html`)

Trong file `index.html`, tìm dòng:

```js
const API_BASE_URL = 'http://localhost:4000';
```

Đổi thành URL server thật sau khi deploy, ví dụ:

```js
const API_BASE_URL = 'https://workline-server.onrender.com';
```

## Các API chính

| Method | Endpoint | Mô tả |
|---|---|---|
| POST | `/api/auth/login` | Đăng nhập bằng email + mật khẩu |
| POST | `/api/auth/forgot-password` | Gửi email chứa link đặt lại mật khẩu |
| POST | `/api/auth/reset-password` | Đặt mật khẩu mới bằng token trong email |
| GET | `/api/members` | Lấy danh sách thành viên (cần token) |
| POST | `/api/members` | Admin/Leader thêm thành viên mới → tự sinh mật khẩu tạm + gửi email mời (cần token) |
| PUT | `/api/members/:id` | Cập nhật tên/vai trò thành viên (cần token) |

## Giới hạn hiện tại

- Toàn bộ dữ liệu công việc/nhóm khác của app (task, dự án...) **chưa** được chuyển
  sang Google Drive trong bản này — mới chỉ có phần **thành viên** và **token đặt
  lại mật khẩu**, vì đó là phần liên quan tới 2 tính năng bạn yêu cầu (mời qua
  email + quên mật khẩu). Nếu muốn toàn bộ dữ liệu task/dự án cũng lưu trên
  Drive, có thể mở rộng theo đúng pattern trong `src/services/dataService.js`.
- Đây là dữ liệu dùng chung 1 file JSON trên Drive — phù hợp cho đội nhóm nhỏ.
  Nếu số lượng thành viên/task lớn và nhiều người thao tác đồng thời, nên
  chuyển sang một database thật (PostgreSQL, MongoDB...) để tránh xung đột ghi đè.

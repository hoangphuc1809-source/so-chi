# Sổ Chi

App quản lý chi tiêu cá nhân, chạy trên VPS riêng. Không phụ thuộc npm package nào —
chỉ dùng `node:http`, `node:sqlite`, `node:crypto` có sẵn trong Node 24.

## Tính năng

**Chi tiêu** — nhập tay hoặc quét hóa đơn, phân loại Cá nhân / Tiếp khách / Công tác,
ngân sách theo danh mục, nhật ký theo ngày.

**Hóa đơn** — hạn thanh toán, chu kỳ lặp (tuần/tháng/quý/năm), nhắc trước N ngày,
đánh dấu đã trả tự sinh khoản chi và đẩy hạn sang kỳ kế tiếp, lịch sử thanh toán.

**Thẻ tín dụng** — nhiều thẻ, dư nợ tự cộng từ khoản chi trả bằng thẻ, hạn mức còn lại,
tỷ lệ sử dụng, ghi nhận trả nợ, ngày sao kê và ngày đến hạn.

**Báo cáo** — xu hướng 12 tháng, theo danh mục, theo loại chi, theo phương thức,
theo thứ trong tuần, 5 khoản lớn nhất.

**Đầu tư** — danh mục chứng khoán đọc từ `portfolio-bot` trên máy chủ hermes-gateway:
NAV, dư nợ margin, lãi/lỗ từng mã, tỷ trọng, cảnh báo tập trung. Sổ Chi **không** tự tính
danh mục — số liệu do portfolio-bot tính bằng sổ FIFO rồi đẩy sang.

**Trợ lý** — hỏi đáp về chi tiêu bằng tiếng Việt, chạy trên Gemini. Nguyên tắc thiết kế:
mọi con số do máy chủ tính bằng SQL, Gemini chỉ diễn giải và bị cấm tự tính ra số mới.
Kèm phần "Đáng chú ý" tính thuần bằng SQL nên luôn chính xác.

**Khác** — giao diện sáng/tối, xuất CSV và JSON, nhắc hạn qua Telegram.

## Kiến trúc

```
public/       giao diện, phục vụ trực tiếp bởi Node
src/          nguồn JSX, biên dịch bằng `npm run build` trên máy dev
server/       index.js (router + API), db.js (schema), auth.js (scrypt + JWT), ocr.js
scripts/      remind.js — nhắc hạn, chạy bằng systemd timer
deploy/       unit systemd
```

Dữ liệu nằm trong một file SQLite. Không có Postgres, không có Docker, không có reverse proxy.

## Cài đặt

```bash
git clone https://github.com/hoangphuc1809-source/so-chi.git
cd so-chi
cp .env.example .env      # điền SOCHI_SECRET, tùy chọn GEMINI_API_KEY và Telegram
sudo cp deploy/*.service deploy/*.timer /etc/systemd/system/
sudo systemctl enable --now sochi sochi-remind.timer
```

Tài khoản đầu tiên tạo trực tiếp trên màn hình đăng nhập. Sau đó `ALLOW_REGISTER=0`
sẽ khóa đăng ký thêm.

## Cập nhật

```bash
cd ~/so-chi && git pull && sudo systemctl restart sochi
```

Sửa giao diện thì chạy `npm run build` trên máy dev rồi commit cả `public/app.js`.
VPS không cần cài gì để build.

## Giới hạn tài nguyên

Service đặt `MemoryMax=180M` và `OOMScoreAdjust=500`. Nếu app rò rỉ bộ nhớ,
kernel sẽ giết app này chứ không đụng tới các tiến trình khác trên máy.

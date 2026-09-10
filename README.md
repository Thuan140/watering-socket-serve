# 🌱 Watering Socket Server Gateway

Hệ thống WebSocket & HTTP Gateway siêu nhẹ làm cầu nối thời gian thực 2 chiều giữa **Mobile App** và **Hardware (ESP32)**, không cần Database.

```
Mobile App <---(WebSocket)---> SOCKET SERVER GATEWAY <---(WebSocket)---> Hardware (ESP32)
```

---

## 🌟 Tính Năng Chính

- **Relay 2 chiều tức thì**: Chuyển tiếp lệnh từ Mobile App tới ESP32 và broadcast trạng thái van/tiến trình ngược lại App.
- **Tự động nhận diện thiết bị**: Phân định ESP32 qua `?role=hardware` và Mobile App qua kết nối thông thường.
- **In-Memory Cache (RAM)**: Lưu trạng thái van gần nhất, đẩy ngay cho Mobile App khi vừa mở mà không cần chờ đợi.
- **Lập lịch tưới 24/7 trên Cloud**: Tự động lưu `start_times` khi App cài đặt và kích hoạt tưới đúng giờ hẹn (UTC+7) ngay cả khi điện thoại tắt app/mất mạng.
- **Cảnh báo kết nối**: Báo offline khi ESP32 ngắt kết nối và báo lỗi rõ ràng nếu App gửi lệnh lúc ESP32 chưa online.
- **HTTP Health Check**: Endpoint `/health` phục vụ kiểm tra trạng thái và giám sát uptime/số lượng client.

---

## 🚀 Cài Đặt & Chạy Server (Local)

### 1. Cài đặt & Khởi động
```bash
cd socket-server
npm install
npm start       # Hoặc: npm run dev (tự động reload khi sửa code)
```
*Server mặc định chạy tại cổng `81` (`ws://0.0.0.0:81`).*

### 2. Kiểm tra Health Check
Truy cập `http://localhost:81/health` trên trình duyệt để kiểm tra trạng thái server và số lượng client đang kết nối.

---

## 🔌 Cấu Hình Kết Nối Thiết Bị

- **Bo mạch ESP32**: `ws://<IP_SERVER>:81?role=hardware` (Local) hoặc `wss://<DOMAIN>?role=hardware` (Cloud).
- **Mobile App**: `ws://<IP_SERVER>:81` (Local) hoặc `wss://<DOMAIN>` (Cloud).

---

## ☁️ Deploy Lên Cloud (Render / Railway / VPS)

1. **Start Command**: `node server.js`
2. **Health Check Path**: `/health`
3. **Môi trường**: Server tự động nhận diện cổng qua biến môi trường `process.env.PORT`.


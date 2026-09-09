# WATERING SOCKET SERVER GATEWAY (KHÔNG CẦN DATABASE)

Hệ thống WebSocket Gateway Relay siêu nhẹ, hiệu năng cao, đóng vai trò là trạm trung chuyển dữ liệu thời gian thực 2 chiều giữa **Mobile App (Lưu dữ liệu Local)** và **Hardware (ESP32)**.

```
Mobile App (Lưu DB Local) <---(WebSocket)---> SOCKET SERVER <---(WebSocket)---> Hardware (ESP32)
```

---

## 1. Cách Khởi Động Server Trên Máy Tính

### Bước 1: Cài đặt thư viện (chỉ 1 lần đầu)
```bash
cd "c:\Watering Automation System\socket-server"
npm install
```

### Bước 2: Chạy Socket Server
```bash
npm start
# Hoặc: node server.js
```
*Mặc định Server sẽ lắng nghe tại cổng `81` (`ws://0.0.0.0:81`).*

---

## 2. Cấu Hình Trên Ứng Dụng Mobile (React Native)

Mở App Mobile, vào màn hình **Cấu Hình Hệ Thống (SystemSetting)**:
- Điền địa chỉ WebSocket: `ws://<IP_MÁY_TÍNH_CỦA_BẠN>:81` (Ví dụ: `ws://192.168.100.105:81` hoặc `ws://localhost:81` nếu chạy trên giả lập).
- Bấm **Kiểm Tra & Lưu Địa Chỉ WS**.

---

## 4. Hướng Dẫn Deploy Lên Cloud Để Điều Khiển Qua 4G Từ Xa

Nếu muốn điều khiển hệ thống qua Internet/4G khi ra khỏi nhà, bạn có thể đưa thư mục `socket-server` này lên các dịch vụ Cloud miễn phí:
1. **Render.com** (Web Service, chọn Node.js, lệnh chạy: `node server.js`).
2. **Railway.app** (Deploy từ GitHub trong 1 cú click).
3. **Fly.io** hoặc **VPS cá nhân**.

Sau khi deploy xong, bạn sẽ có một địa chỉ WebSocket online (ví dụ: `wss://my-watering-server.onrender.com`), điền địa chỉ này vào ESP32 và Mobile App là hệ thống có thể điều khiển từ bất kỳ đâu trên thế giới!

require("dotenv").config();
const http = require("http");
const { WebSocketServer, WebSocket } = require("ws");

const PORT = parseInt(process.env.PORT || "81", 10);
const GATEWAY_NAME = process.env.GATEWAY_NAME || "Watering Socket Gateway";

// Khởi tạo HTTP Server (cho phép health check trên Cloud / Render / Railway)
const server = http.createServer((req, res) => {
  if (req.url === "/health" || req.url === "/") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        status: "OK",
        name: "Watering Socket Gateway",
        uptime_sec: Math.floor(process.uptime()),
        hardware_clients: hardwareClients.size,
        mobile_clients: mobileClients.size,
        timestamp: new Date().toISOString(),
      })
    );
  } else {
    res.writeHead(404);
    res.end();
  }
});

// Khởi tạo WebSocket Server
const wss = new WebSocketServer({ server });

// Bộ nhớ RAM lưu trữ trạng thái gần nhất (In-Memory Cache - Không cần Database)
const hardwareClients = new Set();
const mobileClients = new Set();
let lastStatusUpdate = null;
let lastProfile = null;

function getClientIp(req) {
  return req.headers["x-forwarded-for"] || req.socket.remoteAddress || "unknown";
}

function logTimestamp() {
  return new Date().toLocaleTimeString("vi-VN", { hour12: false });
}

wss.on("connection", (ws, req) => {
  const ip = getClientIp(req);
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  const roleParam = url.searchParams.get("role");

  // Nếu client kết nối với ?role=hardware thì đăng ký Hardware ngay
  let clientRole = roleParam === "hardware" ? "HARDWARE" : "MOBILE";
  if (roleParam === "hardware") {
    hardwareClients.add(ws);
    console.log(`🔌 [${logTimestamp()}] [HARDWARE ĐÃ KẾT NỐI] Từ IP: ${ip} (Tổng Hardware: ${hardwareClients.size})`);
  } else {
    mobileClients.add(ws);
    console.log(`📱 [${logTimestamp()}] [MOBILE ĐÃ KẾT NỐI] Từ IP: ${ip} (Tổng Mobile: ${mobileClients.size})`);

    // Gửi thông báo kết nối thành công và nạp trạng thái van gần nhất (nếu có)
    try {
      ws.send(JSON.stringify({ status: "CONNECTED", message: "Connected to Watering Socket Gateway" }));
      if (lastStatusUpdate) {
        ws.send(JSON.stringify(lastStatusUpdate));
      }
    } catch (e) {}
  }

  ws.on("message", (rawMessage) => {
    try {
      const messageStr = rawMessage.toString();
      const data = JSON.parse(messageStr);

      // --- 1. PHÂN BIỆT RÕ RÀNG BẢN TIN PHẦN CỨNG vs LỆNH MOBILE ---
      // Hardware gửi: "event": "status_update" HOẶC kết quả response {"status": "ok", "cmd": "..."} / {"status": "error"}
      const isHardwareResponse =
        data.event === "status_update" ||
        (data.status !== undefined && (data.cmd !== undefined || data.state !== undefined || data.valves_status !== undefined));

      // Mobile gửi: Lệnh chứa "cmd" và KHÔNG CÓ "status" (ví dụ: {"cmd": "get_profile"}, {"cmd": "set_profile", ...})
      const isMobileCommand = data.cmd !== undefined && data.status === undefined;

      // A. NẾU LÀ PHẢN HỒI / TRẠNG THÁI TỪ PHẦN CỨNG (HARDWARE -> SERVER -> MOBILE)
      if (isHardwareResponse || (clientRole === "HARDWARE" && !isMobileCommand)) {
        if (clientRole !== "HARDWARE") {
          mobileClients.delete(ws);
          hardwareClients.add(ws);
          clientRole = "HARDWARE";
          console.log(`🔌 [${logTimestamp()}] Đã xác định client IP ${ip} là HARDWARE ESP32.`);
        }

        // Lưu trạng thái gần nhất vào RAM
        if (data.event === "status_update") {
          lastStatusUpdate = data;
        }
        if (data.cmd === "get_profile" && data.status === "ok") {
          lastProfile = data;
        }

        console.log(`📥 [${logTimestamp()}] [Hardware -> Mobile]:`, data.event ? `event: ${data.event}` : `cmd: ${data.cmd || data.status}`);

        // Broadcast phản hồi này tới TẤT CẢ client Mobile
        for (const mobileWs of mobileClients) {
          if (mobileWs.readyState === WebSocket.OPEN && mobileWs !== ws) {
            mobileWs.send(messageStr);
          }
        }
        return;
      }

      // B. NẾU LÀ LỆNH TỪ MOBILE (MOBILE -> SERVER -> HARDWARE)
      if (isMobileCommand) {
        if (clientRole !== "MOBILE") {
          hardwareClients.delete(ws);
          mobileClients.add(ws);
          clientRole = "MOBILE";
        }

        console.log(`📤 [${logTimestamp()}] [Mobile -> Hardware]: Lệnh "${data.cmd}" |`, JSON.stringify(data));

        if (hardwareClients.size === 0) {
          console.warn(`⚠️ [${logTimestamp()}] Chưa có bo mạch Hardware (ESP32) nào kết nối vào Server.`);
          ws.send(
            JSON.stringify({
              status: "error",
              message: "Chưa có bo mạch ESP32 nào kết nối tới Socket Server. Vui lòng bật nguồn bo mạch!",
            })
          );
          return;
        }

        // Chuyển tiếp lệnh sang cho TẤT CẢ các bo mạch Hardware đang kết nối
        for (const hwWs of hardwareClients) {
          if (hwWs.readyState === WebSocket.OPEN && hwWs !== ws) {
            hwWs.send(messageStr);
          }
        }
      }
    } catch (err) {
      console.error(`❌ [${logTimestamp()}] Lỗi parse JSON:`, err.message);
    }
  });

  ws.on("close", () => {
    if (clientRole === "HARDWARE") {
      hardwareClients.delete(ws);
      console.log(`🔌 [${logTimestamp()}] [HARDWARE ĐÃ NGẮT] IP: ${ip} (Còn lại: ${hardwareClients.size})`);

      // Thông báo cho Mobile biết bo mạch đã mất kết nối
      const offlineNotify = JSON.stringify({
        event: "hardware_status",
        online: false,
        message: "Bo mạch ESP32 đã ngắt kết nối khỏi Server",
      });
      for (const m of mobileClients) {
        if (m.readyState === WebSocket.OPEN) m.send(offlineNotify);
      }
    } else {
      mobileClients.delete(ws);
      console.log(`📱 [${logTimestamp()}] [MOBILE ĐÃ NGẮT] IP: ${ip} (Còn lại: ${mobileClients.size})`);
    }
  });

  ws.on("error", (err) => {
    console.error(`⚠️ [${logTimestamp()}] Lỗi WebSocket [${clientRole} - ${ip}]:`, err.message);
  });
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`\n=============================================================`);
  console.log(`🌱 WATERING SYSTEM - BIDIRECTIONAL SOCKET SERVER GATEWAY`);
  console.log(`=============================================================`);
  console.log(`🚀 WebSocket & HTTP Server đang lắng nghe tại: ws://0.0.0.0:${PORT}`);
  console.log(`🔗 Health Check URL:                        http://localhost:${PORT}/health`);
  console.log(`📋 Sơ đồ kết nối:`);
  console.log(`   📱 Mobile App  <---(ws://IP:${PORT})---> SOCKET SERVER <---(ws://IP:${PORT})---> 🔌 Hardware ESP32`);
  console.log(`=============================================================\n`);
});

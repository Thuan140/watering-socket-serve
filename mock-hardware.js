/**
 * BỘ GIẢ LẬP BO MẠCH PHẦN CỨNG ESP32 (MOCK HARDWARE)
 * Dùng để test hệ thống khi không cắm bo mạch thật.
 * Tự động kết nối tới Socket Server và phản hồi 100% chuẩn Data_Strucrure.md
 */
require("dotenv").config();
const WebSocket = require("ws");
const fs = require("fs");
const path = require("path");

const SERVER_URL = process.env.WS_SERVER_URL || "ws://localhost:81?role=hardware";
const NUM_VALVES = 20;
const FLASH_FILE = path.join(__dirname, "mock_flash_profile.json");

let ws = null;
let valvesStatus = Array(NUM_VALVES).fill(0);
valvesStatus[0] = 1; // Luôn duy trì 1 van mở theo quy định phần cứng

let isAutoRunning = false;
let systemState = "Stop";
let currentStepIndex = 0;
let autoTimer = null;

// Giả lập van 6 và van 13 là loại NC (Normally Closed)
const ncValves = new Set([6, 13]);

function buildRelaysDisplay(relaysList) {
  return "{" + relaysList.map((v) => (ncValves.has(v) ? `${v}(NC)` : `${v}`)).join(",") + "}";
}

let profile = {
  name: "main",
  watering_time_sec: 20,
  relays: Array.from({ length: 20 }, (_, i) => i + 1),
  relays_display: buildRelaysDisplay(Array.from({ length: 20 }, (_, i) => i + 1)),
  override: {},
};

// Nạp profile từ bộ nhớ Flash giả lập nếu có
try {
  if (fs.existsSync(FLASH_FILE)) {
    const saved = JSON.parse(fs.readFileSync(FLASH_FILE, "utf-8"));
    if (saved && Array.isArray(saved.relays)) {
      profile = {
        ...profile,
        ...saved,
        relays_display: buildRelaysDisplay(saved.relays),
      };
      console.log("💾 [Mock ESP32] Đã nạp Profile từ Flash (mock_flash_profile.json):", profile.name, `(${profile.relays.length} van)`);
    }
  }
} catch (e) {
  console.warn("⚠️ [Mock ESP32] Không đọc được file Flash:", e.message);
}

function saveFlashProfile() {
  try {
    fs.writeFileSync(FLASH_FILE, JSON.stringify(profile, null, 2), "utf-8");
    console.log("💾 [Mock ESP32] Đã ghi Profile vào Flash thành công!");
  } catch (e) {
    console.error("❌ [Mock ESP32] Lỗi ghi Flash:", e.message);
  }
}

function connect() {
  console.log(`🔌 [Mock ESP32] Đang kết nối tới Socket Server: ${SERVER_URL}...`);
  ws = new WebSocket(SERVER_URL);

  ws.on("open", () => {
    console.log("✅ [Mock ESP32] ĐÃ KẾT NỐI THÀNH CÔNG VỚI SOCKET SERVER!");
    sendStatus();
  });

  ws.on("message", (data) => {
    try {
      const msg = JSON.parse(data.toString());
      console.log("📥 [Mock ESP32] Nhận lệnh từ Mobile:", msg);

      switch (msg.cmd) {
        case "get_profile": {
          const resp = {
            status: "ok",
            cmd: "get_profile",
            active_slot: 1,
            name: profile.name,
            version: 1,
            mode: "sequential",
            watering_time_sec: profile.watering_time_sec,
            valve_count: profile.relays.length,
            relays: profile.relays,
            relays_display: profile.relays_display,
            override: profile.override,
          };
          ws.send(JSON.stringify(resp));
          console.log("📤 [Mock ESP32] Phản hồi get_profile:", JSON.stringify(resp));
          break;
        }

        case "set_profile": {
          if (msg.name) profile.name = msg.name;
          if (msg.watering_time_sec) profile.watering_time_sec = msg.watering_time_sec;
          if (Array.isArray(msg.relays)) {
            profile.relays = msg.relays;
            profile.relays_display = buildRelaysDisplay(msg.relays);
          }
          if (msg.override) {
            if (Array.isArray(msg.override)) {
              const ovrMap = {};
              msg.override.forEach((o) => {
                ovrMap[o.valve] = o.time_sec;
              });
              profile.override = ovrMap;
            } else {
              profile.override = msg.override;
            }
          } else {
            profile.override = {};
          }

          saveFlashProfile();

          const resp = {
            status: "ok",
            cmd: "set",
            mode: "sequential",
            count: profile.relays.length,
            watering_time_sec: profile.watering_time_sec,
          };
          ws.send(JSON.stringify(resp));
          console.log("📤 [Mock ESP32] Đã lưu Profile vào Flash giả lập:", JSON.stringify(resp));
          break;
        }

        case "toggle_valve": {
          const vId = msg.valve;
          const state = msg.state;
          if (vId >= 1 && vId <= NUM_VALVES) {
            valvesStatus[vId - 1] = state;
            const resp = { status: "ok", cmd: "toggle_valve", valve: vId, state: state };
            ws.send(JSON.stringify(resp));
            sendStatus();
          }
          break;
        }

        case "start_auto": {
          if (autoTimer) {
            clearTimeout(autoTimer);
            autoTimer = null;
          }
          isAutoRunning = true;
          systemState = "Sequential";
          currentStepIndex = 0;
          ws.send(JSON.stringify({ status: "ok", cmd: "run" }));
          runAutoLoop();
          break;
        }

        case "stop_auto": {
          stopAuto();
          ws.send(JSON.stringify({ status: "ok", state: "Stop" }));
          sendStatus();
          break;
        }

        case "open_all": {
          valvesStatus = Array(NUM_VALVES).fill(1);
          ws.send(JSON.stringify({ status: "ok", cmd: "open_all" }));
          sendStatus();
          break;
        }
      }
    } catch (e) {
      console.error("Lỗi Mock ESP32:", e);
    }
  });

  ws.on("close", () => {
    console.warn("⚠️ [Mock ESP32] Mất kết nối. Đang kết nối lại sau 3s...");
    setTimeout(connect, 3000);
  });

  ws.on("error", (err) => {
    console.error("Lỗi socket mock:", err.message);
  });
}

function sendStatus() {
  if (ws && ws.readyState === WebSocket.OPEN) {
    const payload = {
      event: "status_update",
      system_state: systemState,
      auto_running: isAutoRunning,
      valves_status: valvesStatus,
    };
    ws.send(JSON.stringify(payload));
  }
}

function getDurationSec(valveId) {
  if (profile.override) {
    if (Array.isArray(profile.override)) {
      const found = profile.override.find((o) => o.valve === valveId || o.valve === Number(valveId));
      if (found && typeof found.time_sec === "number" && found.time_sec > 0) {
        return found.time_sec;
      }
    } else if (typeof profile.override === "object") {
      const sec = profile.override[valveId] ?? profile.override[String(valveId)];
      if (typeof sec === "number" && sec > 0) {
        return sec;
      }
    }
  }
  const defaultSec = Number(profile.watering_time_sec);
  return !isNaN(defaultSec) && defaultSec > 0 ? defaultSec : 20;
}

function stopAuto() {
  isAutoRunning = false;
  systemState = "Stop";
  if (autoTimer) {
    clearTimeout(autoTimer);
    autoTimer = null;
  }
  valvesStatus = Array(NUM_VALVES).fill(0);
  valvesStatus[0] = 1; // Giữ 1 van mở xả áp
}

function runAutoLoop() {
  if (!isAutoRunning) return;
  if (!Array.isArray(profile.relays) || profile.relays.length === 0) {
    console.warn("⚠️ [Mock ESP32] Danh sách relays trống, kết thúc auto.");
    stopAuto();
    sendStatus();
    return;
  }

  if (currentStepIndex >= profile.relays.length) {
    console.log("🏁 [Mock ESP32] Hoàn thành chu trình tưới tuần tự toàn bộ các van!");
    stopAuto();
    sendStatus();
    return;
  }

  const currentValve = profile.relays[currentStepIndex];
  const durationSec = getDurationSec(currentValve);

  // Đảm bảo chỉ duy nhất van của bước hiện tại mở
  valvesStatus = Array(NUM_VALVES).fill(0);
  if (currentValve >= 1 && currentValve <= NUM_VALVES) {
    valvesStatus[currentValve - 1] = 1;
  }

  console.log(`⏱️ [Mock ESP32] Bước ${currentStepIndex + 1}/${profile.relays.length}: Đang mở Van ${currentValve} trong ${durationSec} giây...`);
  sendStatus();

  if (autoTimer) {
    clearTimeout(autoTimer);
    autoTimer = null;
  }

  autoTimer = setTimeout(() => {
    if (!isAutoRunning) return;
    console.log(`✅ [Mock ESP32] Bước ${currentStepIndex + 1}/${profile.relays.length}: Đã tưới xong Van ${currentValve} (${durationSec}s)`);
    currentStepIndex++;

    if (currentStepIndex < profile.relays.length) {
      runAutoLoop();
    } else {
      console.log("🏁 [Mock ESP32] Hoàn thành chu trình tưới tuần tự!");
      stopAuto();
      sendStatus();
    }
  }, durationSec * 1000);
}

// Định kỳ gửi status_update mỗi 2s theo chuẩn Data_Strucrure.md
setInterval(() => {
  if (ws && ws.readyState === WebSocket.OPEN) {
    sendStatus();
  }
}, 2000);

connect();

/**
 * test-runner/run.mjs
 *
 * (TỆP MỚI)
 * Script Kiểm thử Cục bộ (Chạy bằng Node.js).
 * Script này gọi đến "Cổng Kiểm Thử" API (/api/run-test)
 * để kích hoạt bộ kiểm thử đa phương tiện trên máy chủ Next.js.
 */

// Sử dụng fetch tích hợp sẵn (yêu cầu Node.js v18+)
// Nếu dùng Node < 18, bạn cần cài đặt: npm i node-fetch
// và import: import fetch from 'node-fetch';

const TEST_API_URL = "http://localhost:3000/api/run-test";

/**
 * Hàm trợ giúp để phân tích đối số dòng lệnh
 */
function parseArgs() {
  const args = process.argv.slice(2); // Bỏ qua 'node' và tên script

  if (args.length < 2) {
    console.error("Lỗi: Thiếu đối số.");
    console.log("Cách dùng: node test-runner/run.mjs <threadId> <type>");
    console.log(
      'Ví dụ (User): node test-runner/run.mjs "8459098330289347035" 0',
    );
    console.log('Ví dụ (Group): node test-runner/run.mjs "987654321@g.us" 1');
    process.exit(1); // Thoát với mã lỗi
  }

  const [threadId, typeStr] = args;
  const type = parseInt(typeStr, 10);

  if (isNaN(type) || (type !== 0 && type !== 1)) {
    console.error(`Lỗi: 'type' phải là 0 (User) hoặc 1 (Group).`);
    console.error(`Đã nhận: ${typeStr}`);
    process.exit(1);
  }

  return { threadId, type };
}

/**
 * Hàm chính (main) để chạy kiểm thử
 */
async function runTests() {
  // --- CẤU HÌNH KIỂM THỬ (TEST CONFIG) ---
  // Đặt 'USE_HARDCODED_ARGS' là 'true' để sử dụng các giá trị hardcode bên dưới.
  // Đặt là 'false' để đọc từ dòng lệnh (command line).
  const USE_HARDCODED_ARGS = true;
  const HARDCODED_THREAD_ID = "8459098330289347035"; // <-- THAY ID CỦA BẠN VÀO ĐÂY
  const HARDCODED_TYPE = 0; // <-- THAY TYPE (0 = User, 1 = Group)
  // -------------------------------------

  let threadId, type;

  if (USE_HARDCODED_ARGS) {
    console.log("[LƯU Ý] Đang sử dụng đối số HARDCODE!");
    threadId = HARDCODED_THREAD_ID;
    type = HARDCODED_TYPE;

    if (!threadId || typeof type === "undefined" || type === null) {
      console.error(
        "Lỗi: Vui lòng đặt giá trị cho 'HARDCODED_THREAD_ID' và 'HARDCODED_TYPE' trong file run.mjs",
      );
      process.exit(1);
    }
  } else {
    // Lấy từ dòng lệnh
    const args = parseArgs();
    threadId = args.threadId;
    type = args.type;
  }

  console.log(`Đang chuẩn bị kiểm thử...`);
  console.log(`  > Endpoint: ${TEST_API_URL}`);
  console.log(`  > Thread ID: ${threadId}`);
  console.log(`  > Type: ${type === 0 ? "User" : "Group"}`);
  console.log("-------------------------------------------------");
  console.log("Đang gửi yêu cầu đến máy chủ Next.js...");

  try {
    const response = await fetch(TEST_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ threadId, type }),
    });

    const result = await response.json();

    console.log("-------------------------------------------------");
    if (!response.ok) {
      console.error(`Lỗi từ API (${response.status}):`);
      console.error(result);
    } else {
      console.log("Máy chủ đã thực thi kiểm thử. Kết quả:");
      console.log(JSON.stringify(result, null, 2));
    }
  } catch (error) {
    console.error(
      "Lỗi kết nối nghiêm trọng (Máy chủ Next.js có đang chạy không?):",
    );
    console.error(error);
  }
}

// Chạy hàm chính
runTests();

/**
 * lib/utils/security.ts
 * Tiện ích bảo mật: Password Hashing & Session Signing (Stateless).
 */
import crypto from "crypto";

// --- PASSWORD CONFIG ---
const HASH_CONFIG = {
  iterations: 10000,
  keylen: 64,
  digest: "sha512",
};

// Secret Key cho Session (Trong thực tế nên để trong .env)
const SESSION_SECRET =
  process.env.SESSION_SECRET || "zalo-lite-super-secret-key-2024";

/**
 * Tạo chuỗi ngẫu nhiên (Salt/ID)
 */
export function generateRandomString(length: number = 32): string {
  return crypto.randomBytes(length).toString("hex");
}

/**
 * Mã hóa mật khẩu (PBKDF2)
 * Trả về chuỗi format: salt:hash
 */
export function hashPassword(password: string): string {
  const salt = generateRandomString(16);
  const hash = crypto
    .pbkdf2Sync(
      password,
      salt,
      HASH_CONFIG.iterations,
      HASH_CONFIG.keylen,
      HASH_CONFIG.digest,
    )
    .toString("hex");
  return `${salt}:${hash}`;
}

/**
 * Kiểm tra mật khẩu
 * @param password Mật khẩu nhập vào
 * @param storedHash Chuỗi salt:hash trong DB
 */
export function verifyPassword(password: string, storedHash: string): boolean {
  const [salt, originalHash] = storedHash.split(":");
  if (!salt || !originalHash) return false;

  const hash = crypto
    .pbkdf2Sync(
      password,
      salt,
      HASH_CONFIG.iterations,
      HASH_CONFIG.keylen,
      HASH_CONFIG.digest,
    )
    .toString("hex");

  return hash === originalHash;
}

// --- SESSION TOKEN LOGIC (HMAC) ---

/**
 * Tạo Token Session (Signed JSON)
 * Format: base64(payload).base64(signature)
 */
export function createSessionToken(payload: object): string {
  const data = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = crypto
    .createHmac("sha256", SESSION_SECRET)
    .update(data)
    .digest("base64url");

  return `${data}.${signature}`;
}

/**
 * Xác thực và giải mã Token Session
 * Trả về Payload nếu hợp lệ, null nếu không hợp lệ
 */
export function verifySessionToken<T>(token: string): T | null {
  try {
    const [data, signature] = token.split(".");
    if (!data || !signature) return null;

    // Tái tạo chữ ký để kiểm tra
    const expectedSignature = crypto
      .createHmac("sha256", SESSION_SECRET)
      .update(data)
      .digest("base64url");

    if (signature !== expectedSignature) return null;

    // Giải mã payload
    const payloadStr = Buffer.from(data, "base64url").toString("utf-8");
    return JSON.parse(payloadStr) as T;
  } catch (error) {
    return null;
  }
}

// [NEW] Hash token để lưu định danh session vào DB (SHA256)
export function hashSessionToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

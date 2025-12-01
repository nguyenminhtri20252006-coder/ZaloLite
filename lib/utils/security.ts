/**
 * lib/utils/security.ts
 * Các hàm tiện ích bảo mật: Hashing mật khẩu và tạo Salt.
 * Sử dụng PBKDF2 (Chuẩn an toàn của NIST).
 */
import crypto from "crypto";

// Cấu hình mã hóa
const HASH_CONFIG = {
  iterations: 10000,
  keylen: 64,
  digest: "sha512",
};

/**
 * Tạo chuỗi ngẫu nhiên (dùng làm Salt hoặc Token)
 */
export function generateRandomString(length: number = 32): string {
  return crypto.randomBytes(length).toString("hex");
}

/**
 * Mã hóa mật khẩu
 * @param password Mật khẩu thô
 * @param salt Salt (nếu không truyền sẽ tạo mới)
 */
export function hashPassword(password: string, salt?: string) {
  const useSalt = salt || generateRandomString(16);
  const hash = crypto
    .pbkdf2Sync(
      password,
      useSalt,
      HASH_CONFIG.iterations,
      HASH_CONFIG.keylen,
      HASH_CONFIG.digest,
    )
    .toString("hex");

  return {
    hash,
    salt: useSalt,
  };
}

/**
 * Kiểm tra mật khẩu
 */
export function verifyPassword(
  password: string,
  storedHash: string,
  storedSalt: string,
): boolean {
  const { hash } = hashPassword(password, storedSalt);
  return hash === storedHash;
}

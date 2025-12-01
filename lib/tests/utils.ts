/**
 * lib/tests/utils.ts
 * Các hàm tiện ích dùng chung cho hệ thống kiểm thử.
 */

export const delay = (ms: number) =>
  new Promise((resolve) => setTimeout(resolve, ms));

// Bạn có thể thêm các hàm logger hoặc metrics tại đây sau này

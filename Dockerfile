# Giai đoạn 1: Cài đặt dependencies
# Sử dụng node:18-alpine hoặc 20-alpine vì nhẹ và bảo mật
FROM node:18-alpine AS deps
# Cài đặt libc6-compat vì thư viện xử lý ảnh (sharp) thường cần nó trên Alpine
RUN apk add --no-cache libc6-compat
WORKDIR /app

# Copy package.json và lock file trước để tận dụng cache layer của Docker
COPY package.json package-lock.json ./

# Cài đặt dependencies (dùng npm ci để cài chính xác version trong lock file)
RUN npm ci

# Giai đoạn 2: Build ứng dụng
FROM node:18-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Tắt Next.js telemetry
ENV NEXT_TELEMETRY_DISABLED 1

# Build project (sẽ tạo ra thư mục .next/standalone nhờ config ở Bước 1)
RUN npm run build

# Giai đoạn 3: Runner (Image cuối cùng để chạy)
FROM node:18-alpine AS runner
WORKDIR /app

ENV NODE_ENV production
ENV NEXT_TELEMETRY_DISABLED 1

# Tạo user system để chạy app (bảo mật hơn root)
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Copy thư mục public (các file tĩnh như logo, icon)
COPY --from=builder /app/public ./public

# Copy kết quả build standalone
# Thư mục .next/standalone chứa code server tối giản
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
# Thư mục .next/static chứa JS/CSS client-side (bắt buộc phải copy riêng)
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# Chuyển sang user non-root
USER nextjs

# Expose port 3000
EXPOSE 3000

ENV PORT 3000
ENV HOSTNAME "0.0.0.0"

# Lệnh chạy server
CMD ["node", "server.js"]
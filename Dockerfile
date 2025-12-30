# ==========================================
# Giai đoạn 1: Install Dependencies (Deps)
# ==========================================
FROM node:20-alpine AS deps
# Cài thêm libc6-compat để hỗ trợ thư viện xử lý ảnh hoặc native (quan trọng cho Alpine)
RUN apk add --no-cache libc6-compat
WORKDIR /app

# Copy package files
COPY package.json package-lock.json ./

# Cài đặt dependencies (dùng --legacy-peer-deps để tránh lỗi version conflict nếu có)
RUN npm ci --legacy-peer-deps

# ==========================================
# Giai đoạn 2: Build Application (Builder)
# ==========================================
FROM node:20-alpine AS builder
WORKDIR /app

# Copy dependencies từ stage trước
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# [QUAN TRỌNG] Khai báo ARG để nhận biến môi trường lúc build
# Next.js cần các biến NEXT_PUBLIC_ ngay tại thời điểm build để in vào code Client
ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY

# Gán giá trị ARG vào ENV để tiến trình build của Next.js đọc được
ENV NEXT_PUBLIC_SUPABASE_URL=${NEXT_PUBLIC_SUPABASE_URL}
ENV NEXT_PUBLIC_SUPABASE_ANON_KEY=${NEXT_PUBLIC_SUPABASE_ANON_KEY}

# Tắt Telemetry
ENV NEXT_TELEMETRY_DISABLED 1

# Thực hiện build
RUN npm run build

# ==========================================
# Giai đoạn 3: Production Runner (Runner)
# ==========================================
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV production
ENV NEXT_TELEMETRY_DISABLED 1

# Tạo user non-root
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Copy file public (ảnh, fonts...)
COPY --from=builder /app/public ./public

# Setup folder .next và quyền
RUN mkdir .next
RUN chown nextjs:nodejs .next

# Copy output Standalone (Tính năng này giúp image siêu nhẹ)
# Đảm bảo bạn đã có output: 'standalone' trong next.config.ts / .js
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# Chuyển sang user thường
USER nextjs

# Expose cổng
EXPOSE 3000
ENV PORT 3000
ENV HOSTNAME "0.0.0.0"

# Healthcheck: Kiểm tra app có sống không mỗi 30s
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/ || exit 1

CMD ["node", "server.js"]
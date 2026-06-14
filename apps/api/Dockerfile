# =====================================================================
# 🐳 apps/api/Dockerfile
# =====================================================================
FROM node:20-alpine AS base
RUN apk add --no-cache libc6-compat openssl
WORKDIR /app

FROM base AS deps
COPY package.json pnpm-lock.yaml* ./
COPY ../../pnpm-workspace.yaml ../../turbo.json ../../package.json ./
RUN corepack enable && pnpm install --frozen-lockfile

FROM base AS builder
COPY --from=deps /app /app
COPY . .
RUN pnpm build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 hono
COPY --from=builder --chown=hono:nodejs /app/dist ./dist
COPY --from=builder --chown=hono:nodejs /app/node_modules/.prisma ./node_modules/.prisma
USER hono
EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3001/health || exit 1
CMD ["node", "dist/index.js"]

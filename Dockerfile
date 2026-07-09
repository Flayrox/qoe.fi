# =====================================================================
# 🐳 Dockerfile multi-target — qoe.fi monorepo
# =====================================================================
# 📖 Un SEUL Dockerfile qui build 4 cibles :
#    - web      : apps/web (Next.js public)
#    - console  : apps/console (Next.js auth)
#    - api      : apps/api (Hono backend)
#    - workers  : workers/ (BullMQ)
#
# 🎯 Usage :
#    docker build --target web -t qoefi-web .
#    docker build --target console -t qoefi-console .
#    docker build --target api -t qoefi-api .
#    docker build --target workers -t qoefi-workers .
#
# 📖 Stratégie : stages de base communs + stages spécifiques
# =====================================================================

# 🥉 STAGE BASE : node + corepack pnpm
# ─────────────────────────────────────────────────────────────────────
FROM node:20-alpine AS base
RUN apk add --no-cache libc6-compat openssl git
WORKDIR /app
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate

# 🥈 STAGE BUILDER : installation et build unifiés avec cache pnpm & turbo
# ─────────────────────────────────────────────────────────────────────
FROM base AS builder
ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production

# Copie tout le code source
COPY . .

# Installe toutes les dépendances en utilisant le cache de montage BuildKit (y compris devDependencies pour le build)
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile --prod=false

# Génère le client Prisma (pour le runtime)
RUN pnpm --filter @qoe/db prisma generate

# Build chaque app en utilisant le cache Turborepo
RUN --mount=type=cache,target=/app/.turbo pnpm turbo build

# ═════════════════════════════════════════════════════════════════════
# 🎯 TARGETS FINALES (4 stages qui héritent du builder)
# ═════════════════════════════════════════════════════════════════════

# ─────────────────────────────────────────────────────────────────────
# 🌐 TARGET : WEB (Next.js public — start.qoe.fi + tenants)
# ─────────────────────────────────────────────────────────────────────
FROM node:20-alpine AS web
RUN apk add --no-cache libc6-compat openssl wget
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# Crée un user non-root
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

# Copie le build standalone (auto-suffisant : deps minimales)
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/public ./apps/web/public

USER nextjs
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/start || exit 1

CMD ["node", "apps/web/server.js"]

# ─────────────────────────────────────────────────────────────────────
# 📣 TARGET : LANDING (Next.js — start.qoe.fi)
# ─────────────────────────────────────────────────────────────────────
FROM node:20-alpine AS landing
RUN apk add --no-cache libc6-compat openssl wget
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

COPY --from=builder --chown=nextjs:nodejs /app/apps/landing/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/apps/landing/.next/static ./apps/landing/.next/static
COPY --from=builder --chown=nextjs:nodejs /app/apps/landing/public ./apps/landing/public

USER nextjs
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/ || exit 1

CMD ["node", "apps/landing/server.js"]

# ─────────────────────────────────────────────────────────────────────
# 📰 TARGET : FEED (Next.js — qoe.fi)
# ─────────────────────────────────────────────────────────────────────
FROM node:20-alpine AS feed
RUN apk add --no-cache libc6-compat openssl wget
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

COPY --from=builder --chown=nextjs:nodejs /app/apps/feed/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/apps/feed/.next/static ./apps/feed/.next/static
COPY --from=builder --chown=nextjs:nodejs /app/apps/feed/public ./apps/feed/public

USER nextjs
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/login || exit 1

CMD ["node", "apps/feed/server.js"]

# ─────────────────────────────────────────────────────────────────────
# 🎨 TARGET : DASHBOARD (Next.js — dashboard.qoe.fi)
# ─────────────────────────────────────────────────────────────────────
FROM node:20-alpine AS dashboard
RUN apk add --no-cache libc6-compat openssl wget
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

COPY --from=builder --chown=nextjs:nodejs /app/apps/dashboard/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/apps/dashboard/.next/static ./apps/dashboard/.next/static
COPY --from=builder --chown=nextjs:nodejs /app/apps/dashboard/public ./apps/dashboard/public

USER nextjs
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/ || exit 1

CMD ["node", "apps/dashboard/server.js"]

# ─────────────────────────────────────────────────────────────────────
# 🛡️ TARGET : ADMIN (Next.js — admin.qoe.fi)
# ─────────────────────────────────────────────────────────────────────
FROM node:20-alpine AS admin
RUN apk add --no-cache libc6-compat openssl wget
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

COPY --from=builder --chown=nextjs:nodejs /app/apps/admin/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/apps/admin/.next/static ./apps/admin/.next/static
COPY --from=builder --chown=nextjs:nodejs /app/apps/admin/public ./apps/admin/public

USER nextjs
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/ || exit 1

CMD ["node", "apps/admin/server.js"]

# ─────────────────────────────────────────────────────────────────────
# 🔌 TARGET : API (Hono backend — api.qoe.fi)
# ─────────────────────────────────────────────────────────────────────
FROM node:20-alpine AS api
RUN apk add --no-cache libc6-compat openssl wget
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3001

RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 hono

COPY --from=builder --chown=hono:nodejs /app/apps/api/dist ./dist
COPY --from=builder --chown=hono:nodejs /app/apps/api/node_modules ./node_modules
COPY --from=builder --chown=hono:nodejs /app/node_modules/.prisma ./node_modules/.prisma

USER hono
EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=10s --start-period=20s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3001/health || exit 1

CMD ["node", "dist/index.js"]

# ─────────────────────────────────────────────────────────────────────
# ⚙️ TARGET : WORKERS (BullMQ — jobs async)
# ─────────────────────────────────────────────────────────────────────
FROM node:20-alpine AS workers
RUN apk add --no-cache libc6-compat openssl
WORKDIR /app
ENV NODE_ENV=production

RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 worker

COPY --from=builder --chown=worker:nodejs /app/workers/dist ./dist
COPY --from=builder --chown=worker:nodejs /app/workers/node_modules ./node_modules
COPY --from=builder --chown=worker:nodejs /app/node_modules/.prisma ./node_modules/.prisma

USER worker

CMD ["node", "dist/index.js"]

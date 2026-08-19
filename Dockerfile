# =====================================================================
# 🐳 Dockerfile multi-target — qoe.fi monorepo
# =====================================================================
# 📖 Un SEUL Dockerfile qui build les cibles Next.js (l'API Go et le
#    worker asynq ont leur propre Dockerfile dans apps/api-go). Les targets
#    suivent les DOSSIERS (apps/web, apps/landing…) ; les images suivent les
#    services compose (qoefi-tenants, qoefi-start, qoefi-console…) :
#    - web      : apps/web (Next.js tenants, wildcard *.qoe.fi)
#    - landing  : apps/landing (Next.js marketing, start.qoe.fi)
#    - feed     : apps/feed (Next.js reader, qoe.fi)
#    - dashboard: apps/dashboard (Next.js studio, studio.qoe.fi)
#    - admin    : apps/admin (Next.js admin, admin.qoe.fi)
#    - migrate  : one-shot Prisma migrate deploy
#
# 🎯 Usage (tag image = nom de service compose) :
#    docker build --target web -t qoefi-tenants .
#    docker build --target landing -t qoefi-start .
#    docker build --target feed -t qoefi-console .
#    docker build --target dashboard -t qoefi-studio .
#    docker build --target admin -t qoefi-admin .
#
# 📖 Stratégie : stages de base communs + stages spécifiques
# =====================================================================

# 🥉 STAGE BASE : node + corepack pnpm
# ─────────────────────────────────────────────────────────────────────
FROM node:22-alpine AS base
RUN apk add --no-cache libc6-compat openssl git
WORKDIR /app
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable && corepack prepare pnpm@11.21.0 --activate

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
RUN pnpm --filter @qoe/db run prisma:generate

# Assure que les variables d'environnement de build Next.js (comme les URL Supabase) sont disponibles pour la compilation dans chaque application du monorepo
RUN if [ -f .env.docker ]; then \
      cp .env.docker .env && \
      cp .env.docker apps/web/.env && \
      cp .env.docker apps/landing/.env && \
      cp .env.docker apps/feed/.env && \
      cp .env.docker apps/dashboard/.env && \
      cp .env.docker apps/admin/.env; \
    fi

# Compile Lingui catalogs (fr.po/en.po → fr.js/en.js) before building apps
RUN pnpm lingui compile

# Build chaque app en utilisant le cache Turborepo (mais force le build pour garantir l'injection des variables d'environnement)
# ⚠️ Concurrency bridée à 1 et max-old-space-size à 2048 pour éviter de faire saturer les 4Go de RAM du VPS lors des compilations Next.js
RUN --mount=type=cache,target=/app/.turbo NODE_OPTIONS="--max-old-space-size=2048" pnpm turbo build --force --concurrency=1


# ═════════════════════════════════════════════════════════════════════
# 🎯 TARGETS FINALES (4 stages qui héritent du builder)
# ═════════════════════════════════════════════════════════════════════

# ─────────────────────────────────────────────────────────────────────
# 🌐 TARGET : WEB (Next.js public — start.qoe.fi + tenants)
# ─────────────────────────────────────────────────────────────────────
FROM node:22-alpine AS web
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
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/health.svg || exit 1

CMD ["node", "apps/web/server.js"]

# ─────────────────────────────────────────────────────────────────────
# 📣 TARGET : LANDING (Next.js — start.qoe.fi)
# ─────────────────────────────────────────────────────────────────────
FROM node:22-alpine AS landing
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
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/health.svg || exit 1

CMD ["node", "apps/landing/server.js"]

# ─────────────────────────────────────────────────────────────────────
# 📰 TARGET : FEED (Next.js — qoe.fi)
# ─────────────────────────────────────────────────────────────────────
FROM node:22-alpine AS feed
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
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/health.svg || exit 1

CMD ["node", "apps/feed/server.js"]

# ─────────────────────────────────────────────────────────────────────
# 🎨 TARGET : DASHBOARD (Next.js — dashboard.qoe.fi)
# ─────────────────────────────────────────────────────────────────────
FROM node:22-alpine AS dashboard
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
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/health.svg || exit 1

CMD ["node", "apps/dashboard/server.js"]

# ─────────────────────────────────────────────────────────────────────
# 🛡️ TARGET : ADMIN (Next.js — admin.qoe.fi)
# ─────────────────────────────────────────────────────────────────────
FROM node:22-alpine AS admin
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
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/health.svg || exit 1

CMD ["node", "apps/admin/server.js"]

# ─────────────────────────────────────────────────────────────────────
# 🔄 TARGET : MIGRATE (Prisma migrate deploy — one-shot)
# ─────────────────────────────────────────────────────────────────────
FROM node:22-alpine AS migrate
RUN apk add --no-cache libc6-compat openssl
WORKDIR /app
ENV NODE_ENV=production

# Copie le schema Prisma et les migrations depuis le builder
COPY --from=builder /app/packages/db/prisma ./packages/db/prisma
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma

CMD ["npx", "prisma", "migrate", "deploy", "--schema=/app/packages/db/prisma/schema.prisma"]

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

# ─────────────────────────────────────────────────────────────────────
# 🥉 STAGE BASE : node + outils communs
# ─────────────────────────────────────────────────────────────────────
FROM node:20-alpine AS base
RUN apk add --no-cache libc6-compat openssl git
WORKDIR /app

# ─────────────────────────────────────────────────────────────────────
# 🥈 STAGE DEPS : installation des dépendances (toutes workspaces)
# ─────────────────────────────────────────────────────────────────────
# 📖 Une seule fois : pnpm install installe TOUT le workspace.
#    Les stages suivants réutilisent ce node_modules.
# ─────────────────────────────────────────────────────────────────────
FROM base AS deps
# Copie les manifests de TOUT le monorepo
COPY package.json pnpm-lock.yaml* pnpm-workspace.yaml ./
COPY turbo.json ./

# Active pnpm via corepack
RUN corepack enable && corepack prepare pnpm@latest --activate

# ⚠️ ASTUCE : on crée des package.json vides pour chaque app/package
# qu'on n'a pas encore copié, pour que pnpm install ne plante pas.
# Ces package.json seront remplacés au COPY suivant.
RUN for dir in apps/web apps/console apps/api workers packages/*/; do \
  mkdir -p "$dir" && \
  if [ ! -f "$dir/package.json" ]; then \
    echo "{\"name\":\"$(basename $dir)\",\"private\":true}" > "$dir/package.json"; \
  fi; \
done

# Installe les dépendances (production + dev pour le build)
# Note : --no-frozen-lockfile car le lockfile peut être régénéré
RUN pnpm install --no-frozen-lockfile

# ─────────────────────────────────────────────────────────────────────
# 🥇 STAGE BUILDER : build de TOUTES les apps
# ─────────────────────────────────────────────────────────────────────
FROM deps AS builder

# Variables d'env
ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production

# Copie tout le code source
COPY . .

# Re-installe les dépendances maintenant que TOUT le code est copié
# (le stage deps n'avait que les manifests)
RUN pnpm install --no-frozen-lockfile

# Génère le client Prisma (pour le runtime)
RUN pnpm --filter @qoe/db prisma generate || true

# Build chaque app (Turbo gère les dépendances inter-packages)
# Note : on builde tout le workspace, Turbo skip les packages sans script "build"
RUN pnpm turbo build

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
# ⚛️ TARGET : CONSOLE (Next.js auth — qoe.fi, dashboard, admin)
# ─────────────────────────────────────────────────────────────────────
FROM node:20-alpine AS console
RUN apk add --no-cache libc6-compat openssl wget
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

COPY --from=builder --chown=nextjs:nodejs /app/apps/console/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/apps/console/.next/static ./apps/console/.next/static
COPY --from=builder --chown=nextjs:nodejs /app/apps/console/public ./apps/console/public

USER nextjs
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/ || exit 1

CMD ["node", "apps/console/server.js"]

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

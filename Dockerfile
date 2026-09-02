# =====================================================================
# 🐳 Dockerfile multi-target — qoe.fi monorepo
# =====================================================================
# 📖 Un SEUL Dockerfile qui build les cibles Next.js (l'API Go et le
#    worker asynq ont leur propre Dockerfile dans apps/api). Targets,
#    dossiers, packages et services sont alignés :
#    - tenants  : apps/tenants (Next.js blogs, wildcard *.qoe.fi)
#    - hi       : apps/hi (Next.js marketing, hi.qoe.fi)
#    - core     : apps/core (Next.js reader + auth, qoe.fi)
#    - studio   : apps/studio (Next.js créateurs, studio.qoe.fi)
#    - admin    : apps/admin (Next.js admin, admin.qoe.fi)
#    - migrate  : one-shot goose up (schéma + migrations Go)
#
# 🎯 Usage (tag image = nom de service compose) :
#    docker build --target tenants -t qoefi-tenants .
#    docker build --target hi -t qoefi-hi .
#    docker build --target core -t qoefi-core .
#    docker build --target studio -t qoefi-studio .
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

# Assure que les variables d'environnement de build Next.js (comme les URL Supabase) sont disponibles pour la compilation dans chaque application du monorepo
RUN if [ -f .env.docker ]; then \
      cp .env.docker .env && \
      cp .env.docker apps/tenants/.env && \
      cp .env.docker apps/hi/.env && \
      cp .env.docker apps/core/.env && \
      cp .env.docker apps/studio/.env && \
      cp .env.docker apps/admin/.env; \
    fi

# Compile Lingui catalogs (fr.po/en.po → fr.js/en.js) before building apps
RUN pnpm lingui compile

# Build chaque app via Turborepo. Le cache (montage /app/.turbo) + globalEnv/globalDependencies
# (turbo.json) ne rebuildent que ce qui change : le --force (rebuild intégral à chaque déploiement,
# ~15 min) a été retiré. L'injection des variables d'environnement est garantie par turbo.json
# (globalEnv + ".env" dans globalDependencies) : changer une NEXT_PUBLIC_* invalide le hash ET le
# cp .env.docker → .env (racine) ci-dessus. SKIP_ENV_VALIDATION permet au build CI (sans .env.docker
# complet) de compiler sans la validation Zod — le runtime, lui, reçoit le vrai .env.docker via
# env_file compose.
# ⚠️ Sans --concurrency=1 : sur une machine < 4 Go de RAM, remettre --concurrency=2 — le build lourd
# passe désormais par la CI (GitHub Actions), pas par le VPS (voir deploy-prod.sh → pull).
ENV SKIP_ENV_VALIDATION=true
RUN --mount=type=cache,target=/app/.turbo NODE_OPTIONS="--max-old-space-size=2048" pnpm turbo build


# ═════════════════════════════════════════════════════════════════════
# 🎯 TARGETS FINALES (4 stages qui héritent du builder)
# ═════════════════════════════════════════════════════════════════════

# ─────────────────────────────────────────────────────────────────────
# 🌐 TARGET : TENANTS (Next.js blogs — wildcard *.qoe.fi)
# ─────────────────────────────────────────────────────────────────────
FROM node:22-alpine AS tenants
RUN apk add --no-cache libc6-compat openssl wget
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# Crée un user non-root
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

# Copie le build standalone (auto-suffisant : deps minimales)
COPY --from=builder --chown=nextjs:nodejs /app/apps/tenants/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/apps/tenants/.next/static ./apps/tenants/.next/static
COPY --from=builder --chown=nextjs:nodejs /app/apps/tenants/public ./apps/tenants/public

USER nextjs
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/health.svg || exit 1

CMD ["node", "apps/tenants/server.js"]

# ─────────────────────────────────────────────────────────────────────
# 📣 TARGET : HI (Next.js marketing — hi.qoe.fi)
# ─────────────────────────────────────────────────────────────────────
FROM node:22-alpine AS hi
RUN apk add --no-cache libc6-compat openssl wget
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

COPY --from=builder --chown=nextjs:nodejs /app/apps/hi/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/apps/hi/.next/static ./apps/hi/.next/static
COPY --from=builder --chown=nextjs:nodejs /app/apps/hi/public ./apps/hi/public

USER nextjs
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/health.svg || exit 1

CMD ["node", "apps/hi/server.js"]

# ─────────────────────────────────────────────────────────────────────
# 📰 TARGET : CORE (Next.js reader + auth — qoe.fi)
# ─────────────────────────────────────────────────────────────────────
FROM node:22-alpine AS core
RUN apk add --no-cache libc6-compat openssl wget
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

COPY --from=builder --chown=nextjs:nodejs /app/apps/core/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/apps/core/.next/static ./apps/core/.next/static
COPY --from=builder --chown=nextjs:nodejs /app/apps/core/public ./apps/core/public

USER nextjs
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/health.svg || exit 1

CMD ["node", "apps/core/server.js"]

# ─────────────────────────────────────────────────────────────────────
# 🎨 TARGET : STUDIO (Next.js — studio.qoe.fi)
# ─────────────────────────────────────────────────────────────────────
FROM node:22-alpine AS studio
RUN apk add --no-cache libc6-compat openssl wget
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

COPY --from=builder --chown=nextjs:nodejs /app/apps/studio/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/apps/studio/.next/static ./apps/studio/.next/static
COPY --from=builder --chown=nextjs:nodejs /app/apps/studio/public ./apps/studio/public

USER nextjs
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/health.svg || exit 1

CMD ["node", "apps/studio/server.js"]

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
# 🔄 TARGET : MIGRATE (goose up — one-shot)
# ─────────────────────────────────────────────────────────────────────
# Les migrations vivent dans apps/api/sql/migrations (squash de l'historique
# Prisma — source de vérité : apps/api/sql/schema/schema.sql). Connexion via
# DATABASE_URL (même variable que l'API).
FROM golang:1.26-alpine AS migrate-builder
WORKDIR /src

COPY apps/api/go.mod apps/api/go.sum ./
RUN go mod download

COPY apps/api ./
RUN CGO_ENABLED=0 GOOS=linux go build -ldflags="-s -w" -o /out/qoe-migrate ./cmd/migrate

FROM alpine:3.20 AS migrate
RUN apk add --no-cache ca-certificates

COPY --from=migrate-builder /out/qoe-migrate /usr/local/bin/qoe-migrate
COPY --from=migrate-builder /src/sql/migrations /migrations

CMD ["/usr/local/bin/qoe-migrate", "-dir", "/migrations", "up"]

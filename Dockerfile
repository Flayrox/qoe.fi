# =====================================================================
# 🐳 Dockerfile — qoe.fi (PRODUCTION)
# =====================================================================
# Build multi-stage pour produire une image finale légère (~150 MB)
# au lieu d'1+ GB si on copiait tout node_modules.
#
# 📖 Concepts clés :
# - "stage" = étape de build avec son propre système de fichiers
# - "AS <name>" permet de référencer une étape plus tard
# - À la fin, on ne "publie" que les fichiers du dernier FROM
# =====================================================================

# ---------------------------------------------------------------------
# 🥇 STAGE 1 : "base" — Image commune avec pnpm/npm et Node
# ---------------------------------------------------------------------
# On définit la version de Node une seule fois ici, elle est héritée par
# les stages suivants (DRY : Don't Repeat Yourself)
# ---------------------------------------------------------------------
FROM node:20-alpine AS base

# Installation de libc6-compat pour la compatibilité avec certains modules natifs
# et de openssl pour Prisma (qui en a besoin)
RUN apk add --no-cache libc6-compat openssl

# Active pnpm (plus rapide que npm). Si tu préfères npm, on peut changer.
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable && corepack prepare pnpm@latest --activate

# ---------------------------------------------------------------------
# 🥈 STAGE 2 : "deps" — Installation des dépendances de production UNIQUEMENT
# ---------------------------------------------------------------------
# Pourquoi séparer ? Pour ne pas copier les devDependencies dans l'image finale.
# C'est le secret d'une image légère.
# ---------------------------------------------------------------------
FROM base AS deps
WORKDIR /app

# Copie UNIQUEMENT les fichiers de manifestes pour profiter du cache Docker
# (si package.json ne change pas, Docker ne réinstalle pas tout)
COPY package.json package-lock.json* pnpm-lock.yaml* .npmrc* ./

# Installe les dépendances (production only, pas de devDependencies)
# --frozen-lockfile = ne pas modifier le lockfile, garantit la reproductibilité
# Si tu n'utilises pas pnpm, adapte la commande (npm ci, yarn install --frozen-lockfile)
RUN \
  if [ -f pnpm-lock.yaml ]; then pnpm install --frozen-lockfile --prod; \
  elif [ -f package-lock.json ]; then npm ci --only=production; \
  elif [ -f yarn.lock ]; then yarn install --production --frozen-lockfile; \
  else echo "Lockfile not found." && exit 1; \
  fi

# ---------------------------------------------------------------------
# 🥉 STAGE 3 : "builder" — Build de l'application Next.js
# ---------------------------------------------------------------------
# C'est ici qu'on a besoin des devDependencies (typescript, eslint, etc.)
# et qu'on lance `next build` pour produire le bundle de production.
# ---------------------------------------------------------------------
FROM base AS builder
WORKDIR /app

# Copie d'abord les fichiers de manifestes pour cache
COPY package.json package-lock.json* pnpm-lock.yaml* .npmrc* ./
# ⚠️ Ici on installe TOUTES les dépendances (dev inclus) car on a besoin de TS pour le build
RUN \
  if [ -f pnpm-lock.yaml ]; then pnpm install --frozen-lockfile; \
  elif [ -f package-lock.json ]; then npm ci; \
  elif [ -f yarn.lock ]; then yarn install --frozen-lockfile; \
  else echo "Lockfile not found." && exit 1; \
  fi

# Copie le reste du code source
COPY . .

# Désactive la télémétrie Next.js pendant le build (privacy + perf)
ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production

# 🔨 Génère le client Prisma (nécessaire pour le build Next.js)
# ET applique les migrations sur la DB au démarrage
RUN npx prisma generate

# 🔨 Build l'application Next.js
# Avec output: "standalone" dans next.config.ts, ça produit .next/standalone/
RUN npm run build

# ---------------------------------------------------------------------
# 🏆 STAGE 4 : "runner" — Image finale ultra-légère pour la production
# ---------------------------------------------------------------------
# C'est CE stage qui sera l'image finale publiée.
# Elle ne contient QUE :
#   - Le runtime Node
#   - Les fichiers standalone de Next.js
#   - Les fichiers statiques et publics
#   - Le client Prisma (pour les migrations au démarrage)
# Pas de source code, pas de node_modules complet, pas de devDeps.
# ---------------------------------------------------------------------
FROM node:20-alpine AS runner
WORKDIR /app

# Identique au stage "base" pour la cohérence
RUN apk add --no-cache libc6-compat openssl

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# Crée un utilisateur non-root pour la sécurité (bonne pratique Docker)
# Ne JAMAIS faire tourner un container en root en production
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# 📁 Copie le build standalone (contient tout : node_modules minimal + server.js)
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./

# 📁 Copie les fichiers statiques (CSS, JS, images du build)
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# 📁 Copie le dossier public (favicon, robots.txt, etc.)
COPY --from=builder --chown=nextjs:nodejs /app/public ./public

# 📁 Copie le schéma Prisma et le client généré (pour les migrations au démarrage)
COPY --from=builder --chown=nextjs:nodejs /app/prisma ./prisma
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/.prisma ./node_modules/.prisma

# Switch vers l'utilisateur non-root
USER nextjs

# Expose le port 3000 (port par défaut de Next.js)
EXPOSE 3000

# Healthcheck : vérifie que l'app répond
# Toutes les 30s, curl la racine, timeout 10s, 3 retries avant de marquer unhealthy
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/ || exit 1

# 🚀 Commande de démarrage
# nextjs standalone produit un fichier `server.js` à la racine
CMD ["node", "server.js"]

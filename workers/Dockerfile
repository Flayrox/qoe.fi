FROM node:20-alpine AS base
RUN apk add --no-cache libc6-compat openssl
WORKDIR /app
FROM base AS deps
COPY package.json pnpm-lock.yaml* ./
RUN corepack enable && pnpm install --frozen-lockfile
FROM base AS runner
COPY --from=deps /app /app
COPY . .
RUN pnpm build
ENV NODE_ENV=production
CMD ["node", "dist/index.js"]

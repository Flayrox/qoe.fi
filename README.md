# qoe.fi

> A sophisticated platform for modern creators — built as a scalable Turborepo monorepo.

[![Next.js](https://img.shields.io/badge/Next.js-16-black)](https://nextjs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-blue)](https://www.typescriptlang.org)
[![pnpm](https://img.shields.io/badge/pnpm-workspace-orange)](https://pnpm.io)
[![Turborepo](https://img.shields.io/badge/Turborepo-2.x-red)](https://turbo.build)
[![Docker](https://img.shields.io/badge/Docker-ready-blue)](https://www.docker.com)
[![Prisma](https://img.shields.io/badge/Prisma-6-2D3748)](https://www.prisma.io)
[![Supabase](https://img.shields.io/badge/Supabase-Cloud-3ECF8E)](https://supabase.com)

---

## 🏗️ Architecture

This project is a **monorepo** containing 4 deployable apps and 9 shared packages.

```
qoe.fi/
├── apps/
│   ├── web/        🌐 Public site: start.qoe.fi (landing) + *.qoe.fi (tenants)
│   ├── console/    ⚛️ Auth app: qoe.fi (home/feed) + dashboard.qoe.fi + admin.qoe.fi
│   ├── api/        🔌 Backend API: api.qoe.fi (Hono + tRPC)
│   └── (workers)   ⚙️ Background jobs (BullMQ + Redis) — v1+
│
├── packages/
│   ├── tsconfig/   📘 Shared TypeScript configs
│   ├── config/     🔐 Env validation (zod), feature flags, constants
│   ├── utils/      🛠️ cn, format, slugify, validation helpers
│   ├── db/         🐘 Prisma client (à venir Phase 1)
│   ├── supabase/   🔑 Supabase clients (à venir Phase 1)
│   ├── ui/         🎨 shadcn components (à venir Phase 1)
│   ├── i18n/       🌍 Tolgee + locales (à venir Phase 1)
│   ├── auth/       🛡️ Auth helpers (à venir Phase 1)
│   └── billing/    💳 Stripe helpers (à venir Phase 1)
│
├── prisma/         🐘 Schema + migrations (racine)
├── docker/         🐳 Caddy, Postgres, Redis configs
├── docker-compose.yml + docker-compose.dev.yml
├── turbo.json
├── pnpm-workspace.yaml
└── package.json
```

### 🌐 Domain mapping

| URL | App | Purpose |
|-----|-----|---------|
| `start.qoe.fi` | `web` | Landing marketing (Hero, Features, Pricing) |
| `qoe.fi` | `console` | Home/feed (public preview + authenticated feed) |
| `dashboard.qoe.fi` | `console` | Creator dashboard (articles, audience, billing) |
| `admin.qoe.fi` | `console` | Platform admin (superadmin only) |
| `api.qoe.fi` | `api` | Backend API (Hono + tRPC) |
| `*.qoe.fi` | `web` | Creator tenant pages (subdomain) |
| Custom domain | `web` | Tenant via CNAME |

---

## 🚀 Quickstart

### Prerequisites

- **Node.js** 20+
- **pnpm** 9+ (`npm install -g pnpm`)
- **Docker** + **Docker Compose** (recommended)

### Install

```bash
# 1. Clone
git clone https://github.com/your-user/qoe.fi.git
cd qoe.fi

# 2. Install all workspaces
pnpm install

# 3. Setup environment
cp .env.example .env
# Edit .env with your Supabase, Stripe, etc. credentials
```

### Development (Docker — recommended)

```bash
# Start full stack (Postgres + pgvector + all apps with HMR)
pnpm docker:dev

# Web app:      http://localhost:3001
# Console app:  http://localhost:3000
# API:          http://localhost:3001
# Database UI:  use `pnpm prisma:studio`
```

### Development (without Docker — faster, no DB)

```bash
# Run only the console app
pnpm --filter @qoe/console dev

# Or only the web app
pnpm --filter @qoe/web dev

# Or both in parallel (Turborepo)
pnpm dev
```

### Build

```bash
# Build all apps and packages (uses Turborepo cache)
pnpm build

# Build only one app
pnpm --filter @qoe/console build
```

### Production

See [DOCKER.md](./DOCKER.md) for the full deployment guide.

```bash
# Production stack with Caddy, multiple replicas, etc.
pnpm docker:prod
```

---

## 📦 Apps overview

### 🌐 `apps/web` — Public site
- Landing marketing (`/start`)
- Tenant public pages (`*.qoe.fi`)
- Article reading experience
- No authentication required
- Optimized for SEO + performance (ISR-friendly)

### ⚛️ `apps/console` — Authenticated app
- **Home/feed** (`qoe.fi/`): public preview for anonymous, personalized feed for connected
- **Dashboard** (`dashboard.qoe.fi/`): article CRUD, audience, analytics, settings
- **Admin** (`admin.qoe.fi/`): superadmin moderation, system config
- All routes behind Supabase auth

### 🔌 `apps/api` — Backend (optional v1)
- REST + tRPC endpoints
- Stripe webhooks
- Supabase webhooks
- Public API (v1)
- Runs on Hono (ultra-fast, ~10MB memory)

### ⚙️ `workers` — Background jobs (optional v1)
- BullMQ + Redis
- AI embeddings generation
- Email sending (newsletters, notifications)
- Stripe async webhooks
- Search index updates

---

## 🛠️ Stack

| Layer | Tech |
|-------|------|
| **Framework** | Next.js 16 (App Router, RSC) |
| **Language** | TypeScript 5 |
| **Monorepo** | pnpm workspaces + Turborepo |
| **Database** | PostgreSQL 16 + pgvector (Supabase Cloud) |
| **ORM** | Prisma 6 |
| **Auth** | Supabase Auth (SSR + cookies) |
| **UI** | shadcn/ui + Radix + Tailwind 4 |
| **i18n** | Tolgee |
| **State** | Zustand |
| **Animation** | Framer Motion |
| **Editor** | TipTap (with custom PaywallDivider extension) |
| **Payments** | Stripe |
| **Analytics** | Umami (self-hostable) |
| **AI** | OpenAI / Anthropic (embeddings + recos) |
| **Cache + Queue** | Redis (v1+) |
| **Workers** | BullMQ (v1+) |
| **Infra** | Docker + Caddy |
| **Testing** | Vitest + Testing Library |

---

## 📚 Documentation

- [DOCKER.md](./DOCKER.md) — Docker setup, dev workflows, deployment
- [ARCHITECTURE.md](./ARCHITECTURE.md) — Detailed architecture (à venir)
- [CONTRIBUTING.md](./CONTRIBUTING.md) — How to contribute (à venir)

---

## 🗺️ Roadmap (migration plan)

We're progressively migrating from a Next.js monolith to a Turborepo monorepo.

| Phase | Status | Description |
|-------|--------|-------------|
| **0** | ✅ Done | Monorepo setup (this commit) |
| **1** | 🔜 Next | Extract shared packages (db, supabase, ui, i18n, etc.) |
| **2** | 📋 Planned | Move public routes to `apps/web` |
| **3** | 📋 Planned | Move auth routes to `apps/console` + refactor home feed |
| **4** | 📋 Planned | Build `apps/api` (Hono + tRPC) |
| **5** | 📋 Planned | Build `workers` (BullMQ) |
| **6** | 📋 Planned | Multi-service Docker setup |
| **7** | 📋 Planned | CI/CD |
| **8** | 📋 Planned | Production deploy + DNS |

See the full plan in the conversation with the architect agent.

---

## 📄 License

Private project. All rights reserved.

---

## 👤 Author

Built with care by the qoe.fi team 🖤

# 🚀 qoe.fi Platform — Master README

Welcome to the qoe.fi Monorepo. This README serves as the single source of truth for understanding the architecture, packages, applications, and running environment of the platform. 

This repository has undergone a strict architectural audit to ensure a robust, Google-grade scalable standard.

---

## 🏗️ Architectural Overview (Monorepo Turborepo)

qoe.fi is structured as a modern Monorepo utilizing **Turborepo** and **pnpm workspaces**. It is cleanly decoupled into autonomous UI applications and specialized shared packages to maintain strict boundaries, adhere to the "Single Point of Change" rule, and ensure robust Type-Safety from the database all the way to the UI.

### 📊 Tech Stack

| Domain | Technology |
|---|---|
| **Frameworks** | Next.js 16 (App Router), Hono (API) |
| **Package Manager** | pnpm 9.15 (Workspaces) + Turborepo 2.9 |
| **Database Layer** | PostgreSQL 16 + pgvector, Prisma ORM, Redis (BullMQ) |
| **Infrastructure** | Docker, Docker Compose, Caddy 2 (Reverse Proxy / TLS) |
| **State Management** | TanStack Query (React Query) + Optimistic Updates |
| **Typing** | TypeScript 5.9 (Strict), Zod |

---

## 📂 Codebase Map

### Applications (`apps/*`)
The front-facing and API surface areas of the platform.

1. **`apps/landing` (`start.qoe.fi`)**
   The public showcase portal. Contains legal pages (GDPR, CGU) and the CMS presentation layer. Requires no authentication.
2. **`apps/feed` (`qoe.fi`)**
   The central reader feed, bookmarks library, and the global SSO login gateway. Implements real-time feed buffering (`useRealtimeFeedBuffer`) and virtualized infinite scrolling.
3. **`apps/dashboard` (`dashboard.qoe.fi`)**
   The creator studio. Contains the advanced Tiptap WYSIWYG editor (with Paywall Dividers and Annotation Marks) and Stripe billing integrations.
4. **`apps/admin` (`admin.qoe.fi`)**
   The super-admin cockpit for platform moderation, statistics, and global system configuration.
5. **`apps/web` (`*.qoe.fi` / Custom Domains)**
   The highly optimized, multi-tenant rendering engine for creator blogs. Includes dynamic routing via Caddy, Paywall cutting, and virtualized text annotation UI.
6. **`apps/api` (`api.qoe.fi`)**
   Hono-based API for public endpoints and fast internal network requests.

### Core Packages (`packages/*`)
The Single Source of Truth for logic, data, and configuration.

- **`@qoe/db`**: The definitive source for the Database. Contains the solitary `schema.prisma`, migrations, seeds, and typed repository patterns (Users, Articles, Posts).
- **`@qoe/config`**: Core environment variables mapping, global constants (ROLES, LIMITS), and Zod schema validations.
- **`@qoe/auth`**: Strict RBAC (Role-Based Access Control) matrix (`permissions.ts`), user session validation, and mailer templates.
- **`@qoe/supabase`**: Isomorphic Supabase client initialization handling complex Cookie behaviors for SSR, Middlewares, and client-side components.
- **`@qoe/api-client`**: TanStack Query data layer encapsulating hooks, optimistic UI mutations (Like, Bookmark, Repost), and Server Action typings.
- **`@qoe/billing`**: Stripe Webhook handlers, subscription plans, and the server-side Paywall AST Truncation engine.
- **`@qoe/workers`**: Strongly typed async event bus (BullMQ) for Meilisearch sync, Stripe Webhooks, and fan-out newsletters.
- **`@qoe/ui`**: Shared UI components and Shadcn UI library implementations (Command Menus, Modals).
- **`@qoe/theme`**: Centralized design tokens and CSS variable registries to enforce UI consistency across all apps.
- **`@qoe/analytics`**, **`@qoe/i18n`**, **`@qoe/utils`**, **`@qoe/tsconfig`**: Utilities for tracking, translation, formatting, and strict TS configurations.

---

## 🏃 Setup & Execution

### Prerequisites
- Node.js 20+
- pnpm 9+
- Docker & Docker Compose

### Initial Setup
```bash
# 1. Clone the repository
git clone <repo-url>
cd qoe.fi

# 2. Install dependencies
pnpm install

# 3. Setup environment variables
cp .env.docker.example .env

# 4. Start the database and redis backing services via Docker
docker compose -f docker-compose.dev.yml up -d db redis

# 5. Generate Prisma Client
pnpm prisma:generate

# 6. Start the Caddy reverse proxy
caddy start --config Caddyfile.dev
```

### Running the Stack
```bash
# Start all apps simultaneously
pnpm dev

# Or run specific applications
pnpm --filter @qoe/feed dev
pnpm --filter @qoe/dashboard dev
```

### Database Operations
```bash
pnpm prisma:migrate    # Apply migrations
pnpm prisma:studio     # Launch Prisma Studio GUI
pnpm prisma:seed       # Seed the database
```

---

## 🔒 Crucial Architectural Rules

1. **Strict Single Source of Truth**: Data models exist only in `@qoe/db`. Do not replicate the Prisma schema.
2. **Coupling Validation**: UI components must utilize shared logic via `packages/ui` and `packages/api-client`. Direct imports between `apps/` are strictly forbidden.
3. **Paywall Security**: Content truncation occurs explicitly at the Server Layer (`packages/billing/src/paywall/ast-truncation.ts`). Under no circumstances should premium content leak to the DOM for non-subscribers.
4. **Optimistic UI Constraints**: Optimistic mutations (`useOptimisticLike`, etc.) must always include rigorous query-cancellation and rollback mechanisms on failure.

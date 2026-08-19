# 🚀 qoe.fi Platform — Master README

Welcome to the qoe.fi Monorepo. This README serves as the single source of truth for understanding the architecture, packages, applications, and running environment of the platform.

This repository has undergone a strict architectural audit to ensure a robust, Google-grade scalable standard.

---

## 🏗️ Architectural Overview (Monorepo Turborepo)

qoe.fi is structured as a modern Monorepo utilizing **Turborepo** and **pnpm workspaces**. It is cleanly decoupled into autonomous UI applications and specialized shared packages to maintain strict boundaries, adhere to the "Single Point of Change" rule, and ensure robust Type-Safety from the database all the way to the UI.

### 📊 Tech Stack

| Domain               | Technology                                            |
| -------------------- | ----------------------------------------------------- |
| **Frameworks**       | Next.js 16 (App Router), Go (`apps/api-go`)          |
| **Package Manager**  | pnpm 11.21 (Workspaces) + Turborepo 2.9               |
| **Database Layer**   | PostgreSQL 16 + pgvector, Prisma ORM, Redis (BullMQ TS + asynq Go) |
| **Infrastructure**   | Docker, Docker Compose, Caddy 2 (Reverse Proxy / TLS) |
| **State Management** | TanStack Query (React Query) + Optimistic Updates     |
| **Typing**           | TypeScript 5.9 (Strict), Zod                          |
| **Performance**      | React Compiler (auto-memoization) sur toutes les apps |
| **Feature Flags**    | GrowthBook self-hosté (dashboard + SDK @qoe/flags)    |

---

## 📂 Codebase Map

### Applications (`apps/*`)

The front-facing and API surface areas of the platform.

1. **`apps/hi` (`hi.qoe.fi`)**
   The public showcase portal. Contains legal pages (GDPR, CGU) and the CMS presentation layer. Requires no authentication.
2. **`apps/core` (`qoe.fi`)**
   The central reader feed, bookmarks library, and the global SSO login gateway. Implements real-time feed buffering (`useRealtimeFeedBuffer`) and virtualized infinite scrolling.
3. **`apps/studio` (`studio.qoe.fi`)**
   The creator studio. Contains the advanced Tiptap WYSIWYG editor (with Paywall Dividers and Annotation Marks) and Stripe billing integrations.
4. **`apps/admin` (`admin.qoe.fi`)**
   The super-admin cockpit for platform moderation, statistics, and global system configuration.
5. **`apps/tenants` (`*.qoe.fi` / Custom Domains)**
   The highly optimized, multi-tenant rendering engine for creator blogs. Includes dynamic routing via Caddy, Paywall cutting, and virtualized text annotation UI.
6. **`apps/api-go` (`api.qoe.fi`)**
   Backend Go unique de la plateforme (feed, posts, articles, notifications, analytics, webhooks, recherche Meilisearch). C'est le *backend-of-record* : les server actions y proxisent via `QOE_API_GO_URL`.

### Core Packages (`packages/*`)

The Single Source of Truth for logic, data, and configuration.

- **`@qoe/db`**: The definitive source for the Database. Contains the solitary `schema.prisma`, migrations, seeds, and typed repository patterns (Users, Articles, Posts).
- **`@qoe/config`**: Core environment variables mapping, global constants (ROLES, LIMITS), and Zod schema validations.
- **`@qoe/auth`**: Strict RBAC (Role-Based Access Control) matrix (`permissions.ts`), user session validation, and mailer templates.
- **`@qoe/supabase`**: Isomorphic Supabase client initialization handling complex Cookie behaviors for SSR, Middlewares, and client-side components.
- **`@qoe/api-client`**: TanStack Query data layer encapsulating hooks, optimistic UI mutations (Like, Bookmark, Repost), and Server Action typings.
- **`@qoe/billing`**: Stripe Webhook handlers, subscription plans, and the server-side Paywall AST Truncation engine.
- **`@qoe/ui`**: Shared UI components and Shadcn UI library implementations (Command Menus, Modals).
- **`@qoe/theme`**: Centralized design tokens and CSS variable registries to enforce UI consistency across all apps.
- **`@qoe/analytics`**, **`@qoe/i18n`**, **`@qoe/utils`**, **`@qoe/tsconfig`**: Utilities for tracking, translation, formatting, and strict TS configurations.
- **`@qoe/flags`**: Feature flags generalized via self-hosted GrowthBook. Typed registry (`FLAGS` + `defaultFor`), React provider hydrating from the SSR payload (no flicker), server evaluation (`isFlagOn`, `createFlagsContext`) with graceful degradation to defaults when GrowthBook is unavailable.

---

## 🏃 Setup & Execution

### Prerequisites

- Node.js 20+
- pnpm 11+
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
# Start all apps simultaneously (5 Next.js + API + workers — heavy)
pnpm dev

# Or run a single app (+ its API when needed) for much faster cold start:
pnpm dev:core        # core + api (ports 3010 + 3002)
pnpm dev:tenants     # tenants + api
pnpm dev:studio      # studio + api
pnpm dev:hi          # hi only
pnpm dev:admin       # admin only
pnpm dev:api         # api only
```

> 💡 For day-to-day work, prefer a targeted script (`pnpm dev:feed`) instead of
> `pnpm dev` — it compiles ~5× faster and keeps your machine cool.

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

---

## 🚩 Feature Flags (GrowthBook self-hosté)

Le monorepo est câblé pour les feature flags via **GrowthBook**, intégré dans les 5 apps Next.js, le backend Go et les workers via le package partagé `@qoe/flags`.

### Utilisation

```ts
// Client (composant React)
import { useFlag } from '@qoe/flags';
const showRecos = useFlag('feed-recommendations');

// Serveur (Server Component, API, worker)
import { isFlagOn, createFlagsContext } from '@qoe/flags/server';
const enabled = await isFlagOn('feed-recommendations', { userId, plan });
```

### Ajouter un flag

1. Déclare la clé + sa valeur par défaut dans `packages/flags/src/flags.ts` (registre typé).
2. Crée le feature dans l'UI GrowthBook (`Features → New Feature`, même clé).
3. Utilise `useFlag()` côté client ou `isFlagOn()` côté serveur.

### Infra

- Dev : `docker compose -f docker-compose.dev.yml up -d mongodb growthbook`
  - Dashboard UI : http://localhost:3100 (créer le compte admin puis une *SDK Connection*)
  - API SDK : http://localhost:3200
- Env vars : `GROWTHBOOK_API_HOST`, `GROWTHBOOK_CLIENT_KEY` (+ versions `NEXT_PUBLIC_` pour le navigateur)
- **Dégradation gracieuse** : si GrowthBook est down ou non configuré, tous les flags retombent sur leurs valeurs par défaut du registre (aucun crash).

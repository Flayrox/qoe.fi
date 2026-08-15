# 🏛️ Architecture & Scalability Diagnostics (qoe.fi)

This document provides a deep-dive analysis into the architectural decisions, structural coupling, and system constraints of the qoe.fi platform.

## 1. System Architecture Map

The platform is designed around a **Distributed Monolithic architecture** powered by Turborepo. It splits front-end experiences by domain (Creator, Reader, Admin, Tenant) while sharing a unified core data layer.

### Flow Diagram & Multi-Tenancy

```text
User Request -> Caddy Reverse Proxy
├── qoe.fi (Reader Auth/Feed) -> `apps/feed`
├── dashboard.qoe.fi (Studio) -> `apps/dashboard`
├── admin.qoe.fi (Admin)      -> `apps/admin`
├── start.qoe.fi (Landing)    -> `apps/landing`
├── api.qoe.fi (Go backend)   -> `apps/api-go`
├── api-legacy.qoe.fi (Hono)  -> `apps/api` (transition — API créateurs/médias)
└── *.qoe.fi / Custom Domains -> `apps/web` (Tenant Engine)
```

- **Caddy Proxying:** Caddy dynamically routes traffic based on host headers.
- **Tenant Engine (`apps/web`):** The Next.js middleware inside `apps/web` parses the domain, resolving the creator's tenant and rendering their specific publications, applying proper theme tokens (`@qoe/theme`).

---

## 2. Core & Data Layer Evaluation

### Single Source of Truth (SSOT)

- **Status:** **PASS**.
- The schema is strictly confined to `packages/db/prisma/schema.prisma`. All interfaces and Zod schemas in `@qoe/config` inherit types from this source.
- **UUID Strategy:** The system has fully migrated to UUIDs (`@db.Uuid`) for critical entities (Users, Articles) to prevent enumeration attacks and support distributed database sharding if required in the future.
- **pgvector Integration:** The `Thought` and `Article` tables are equipped with PostgreSQL vector columns (`vector(1536)`) for AI-powered semantic search and RAG capabilities (extension pré-activée par l'image `pgvector/pgvector`, cf. `docker/postgres/init.sql`).

### Authentication & Cookies

- **Status:** **ROBUST but SENSITIVE**.
- `packages/supabase/src/cookie-config.ts` dynamically resolves the domain root (e.g., `.qoe.fi` or `.lvh.me`) to ensure JWTs are shared seamlessly across subdomains.
- **RBAC:** `packages/auth/src/permissions.ts` provides a declarative matrix, ensuring a single point of change for authorization rules (`"article:publish:own"`, `"admin:users:moderate"`).

---

## 3. Business Logic & Async Processing

### Paywall Security (AST Truncation)

- **Mechanism:** `packages/billing/src/paywall/ast-truncation.ts` strictly truncates Premium content on the server.
- **Why this matters:** The system does not hide content using CSS (`display: none;`). It intercepts the Tiptap HTML string and splits it at the `<div data-type="paywall-divider">` marker. If the marker is missing, it falls back to paragraph limits or strict character limits (400 chars).
- **Scalability Win:** Ensures 0 bytes of premium content leak over the network, completely mitigating DOM inspection bypasses.

### Asynchronous Workers (BullMQ TS + asynq Go)

- **Event Bus (`packages/workers/src/events/eventBus.ts`):**
  - Strictly typed via Zod schemas.
  - Offloads heavy mutations: e.g., `processMeilisearchSyncJob` handles document upserts to Meilisearch independently of the main API response cycle.
  - Mitigates latency in Next.js Server Actions.

### Optimistic UI

- **Mechanism:** Found in `@qoe/api-client/src/hooks/` (`useOptimisticLike`, `useOptimisticBookmark`, `useOptimisticFollow`).
- **Safety Guarantee:** Implements explicit query cancellations (`cancelQueries`) and snapshot rollbacks to prevent UI state desync if a Supabase request fails or encounters a timeout.

---

## 4. Scalability Diagnostic & Failure Modes

### Coupling Evaluation (1-vs-20 Test)

- **Data Models:** Changing the Prisma schema requires updating 1 file (`schema.prisma`), then regenerating. It propagates safely across 18 packages.
- **UI Components:** Modifying a core UI element (e.g., `SocialIcon`) requires changing 1 file in `packages/ui`.
- **Coupling Rating:** **HIGHLY DECOUPLED.**

### Known Edge Cases & Failure Modes

1. **Redis Outage / BullMQ Failure:**
   - **Scenario:** The Redis instance goes down.
   - **Impact:** Worker jobs (Meilisearch syncing, Stripe webhooks, Newsletter fan-out) will queue locally or drop.
   - **Mitigation:** The primary database (PostgreSQL) handles the source of truth. BullMQ jobs are configured with exponential backoffs (`type: "exponential", delay: 1000`) and will re-attempt once Redis is healthy.

2. **Next.js Server Action Timeout:**
   - **Scenario:** A slow query causes a Server Action to exceed its function timeout (e.g., Vercel 10s limit).
   - **Impact:** The mutation fails.
   - **Mitigation:** Optimistic UI hooks intercept the error and rollback the UI state to match the server snapshot.

3. **Supabase JWT Expiration during SSR:**
   - **Scenario:** A user's access token expires exactly as they hit an SSR page.
   - **Impact:** The SSR render could fail or return unauthenticated state.
   - **Mitigation:** The Next.js middleware eagerly refreshes the session before the route resolves, utilizing the Supabase `getUser()` API safely.

4. **N+1 Query Risk (Feed):**
   - **Scenario:** Rendering the global feed.
   - **Impact:** The system avoids N+1 queries by leveraging Prisma's `include` API strictly within Repository abstractions (`packages/db/src/repositories/posts.ts`). However, caching (via Next.js `unstable_cache` or Redis) is recommended for highly accessed generic feed views.

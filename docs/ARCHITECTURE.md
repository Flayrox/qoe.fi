# 🏛️ Architecture & Scalability Diagnostics (qoe.fi)

> **Mise à jour octobre 2026.** Le backend Go (`apps/api`, chi + sqlc + goose + asynq) est le backend-of-record unique. Il n'y a plus de Prisma, de `packages/db` ni de `packages/billing` dans le monorepo ; toute mention de ces éléments ci-dessous décrit l'historique ou est corrigée inline.

This document provides a deep-dive analysis into the architectural decisions, structural coupling, and system constraints of the qoe.fi platform.

## 1. System Architecture Map

The platform is designed around a **Distributed Monolithic architecture** powered by Turborepo. It splits front-end experiences by domain (Creator, Reader, Admin, Tenant) while sharing a unified core data layer.

### Flow Diagram & Multi-Tenancy

```text
User Request -> Caddy Reverse Proxy
├── qoe.fi (Reader Auth/Feed) -> `apps/core`
├── studio.qoe.fi (Studio)   -> `apps/studio`
├── admin.qoe.fi (Admin)     -> `apps/admin`
├── hi.qoe.fi (Vitrine)      -> `apps/hi`
├── api.qoe.fi (Go backend)  -> `apps/api`
└── *.qoe.fi / Custom Domains -> `apps/tenants` (Tenant Engine)
```

- **Caddy Proxying:** Caddy dynamically routes traffic based on host headers.
- **Tenant Engine (`apps/tenants`):** The Next.js middleware inside `apps/tenants` parses the domain, resolving the creator's tenant and rendering their specific publications, applying proper theme tokens (`@qoe/theme`).

---

## 2. Core & Data Layer Evaluation

### Single Source of Truth (SSOT)

- **Status:** **PARTIAL**.
- Le schéma est confiné à `apps/api/sql/schema/*.sql`, versionné par les migrations goose (`apps/api/sql/migrations/`) et compilé en requêtes typées par sqlc (`apps/api/internal/database/*.sql.go`). Il n'y a plus de client Prisma ni de `packages/db`.
- Les types TS ne sont **pas** générés depuis ce schéma : ils sont recopiés dans `@qoe/sdk` / `@qoe/schemas`, ce qui reste la principale source de dérive de contrat.
- **UUID Strategy:** The system has fully migrated to UUIDs (`@db.Uuid`) for critical entities (Users, Articles) to prevent enumeration attacks and support distributed database sharding if required in the future.
- **pgvector Integration:** The `Thought` and `Article` tables are equipped with PostgreSQL vector columns (`vector(1536)`) for AI-powered semantic search and RAG capabilities (extension pré-activée par l'image `pgvector/pgvector`, cf. `docker/postgres/init.sql`).

### Authentication & Cookies

- **Status:** **ROBUST but SENSITIVE**.
- `packages/supabase/src/cookie-config.ts` dynamically resolves the domain root (e.g., `.qoe.fi` or `.lvh.me`) to ensure JWTs are shared seamlessly across subdomains.
- **RBAC:** `packages/auth/src/permissions.ts` provides a declarative matrix, ensuring a single point of change for authorization rules (`"article:publish:own"`, `"admin:users:moderate"`).

---

## 3. Business Logic & Async Processing

### Paywall Security (AST Truncation)

- **Mechanism:** `packages/utils/src/paywall.ts` (consommateurs TS) et `apps/api/internal/modules/articles/paywall.go` (API) tronquent strictement le contenu Premium côté serveur.
- **Why this matters:** The system does not hide content using CSS (`display: none;`). It intercepts the Tiptap HTML string and splits it at the `<div data-type="paywall-divider">` marker. If the marker is missing, it falls back to paragraph limits or strict character limits (400 chars).
- **Scalability Win:** Ensures 0 bytes of premium content leak over the network, completely mitigating DOM inspection bypasses.

### Asynchronous Workers (asynq Go, queue unique)

- **Queue asynq** (`apps/api/internal/queue` + `apps/api/internal/workers/`) :
  - Types typés (`TaskSearchSync`, `TaskArticlePublished`, `TaskStripeEvent`, …).
  - Offloads heavy mutations: e.g., `TaskSearchSync` handles document upserts to Meilisearch independently of the main API response cycle, `TaskArticlePublished` déclenche webhooks + newsletter + embeddings.
  - Mitigates latency in Next.js Server Actions (émission via `/internal/events/article-published`).

### Optimistic UI

- **Mechanism:** Found in `@qoe/sdk/src/hooks/` (`useOptimisticLike`, `useOptimisticBookmark`, `useOptimisticFollow`).
- **Safety Guarantee:** Implements explicit query cancellations (`cancelQueries`) and snapshot rollbacks to prevent UI state desync if a Supabase request fails or encounters a timeout.

---

## 4. Scalability Diagnostic & Failure Modes

### Coupling Evaluation (1-vs-20 Test)

- **Data Models:** Un changement de schéma demande une migration goose (`apps/api/sql/migrations/`) puis `sqlc generate`. Côté TS, le contrat est manuel : c'est le point de couplage le plus fragile.
- **UI Components:** Modifying a core UI element (e.g., `SocialIcon`) requires changing 1 file in `packages/ui`.
- **Coupling Rating:** **HIGHLY DECOUPLED.**

### Known Edge Cases & Failure Modes

1. **Redis Outage / asynq Failure:**
   - **Scenario:** The Redis instance goes down.
   - **Impact:** Worker jobs (Meilisearch syncing, Stripe webhooks, Newsletter fan-out) will queue locally or drop.
   - **Mitigation:** The primary database (PostgreSQL) handles the source of truth. Les jobs asynq retentent automatiquement (retries configurés par tâche) une fois Redis revenu.

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
   - **Impact:** Le backend Go charge les slices de feed via sqlc (`apps/api/internal/modules/feed/service.go`, `buildSlices`) et les index SQL couvrent les colonnes chaudes (`Article(publicationId, published, createdAt)`, `Post(authorId, createdAt)`, `Highlight(articleId, …)`). Le risque résiduel est côté Next : `fetchTenantPublication` est appelé plusieurs fois par rendu sans `cache()`, et les payloads de publication ne sont pas cachés côté API.

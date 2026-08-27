# 🗺️ Référence d'Architecture & Relations — qoe.fi (à jour)

> **Document de travail de référence.** Ce fichier décrit l'état **actuel**
> du monorepo et sert de base au développement de l'**application mobile**
> (`apps/mobile`).
>
> Dernière mise à jour : août 2026 (noms v3 : core/hi/studio/tenants/api).
>
> 📌 **Compléments pour le mobile** :
> - [`docs/MOBILE_SPEC.md`](./MOBILE_SPEC.md) — spec pixel-perfect de l'app
>   mobile (chaque composant, style, animation + gaps à combler).
> - [`docs/API_CONTRACT.md`](./API_CONTRACT.md) — contrat API Go exact
>   (shapes JSON, auth, pagination, gaps mobile à corriger).

---

## 1. Vue d'ensemble du monorepo

**Monorepo Turborepo + pnpm workspaces** — 8 apps (dont mobile + collab-server) + ~15 packages partagés + **1 worker Go (asynq)**.

### État actuel vs docs historiques

| Sujet | Anciennes docs | **Réalité actuelle** |
|---|---|---|
| Backend | `apps/api` (Hono, legacy — supprimé) | **`apps/api`** (Go, backend-of-record unique). |
| Server actions | Appellent Prisma directement | **Proxy fin vers Go** quand `QOE_API_URL` est défini (`goFetch`). |
| App mobile | "React Native ou Expo (roadmap)" | **`apps/mobile` existe** (Expo SDK 57, expo-router, Expo UI). |
| Feature flags | GrowthBook dans `@qoe/config/features` | Package dédié **`@qoe/flags`** (registre typé + dégradation). |
| Recherche | — | **Meilisearch** (module Go `search` + worker `TaskSearchSync`) + **sémantique** (embeddings jina → pgvector). |
| Notifications | — | Worker Go asynq `TaskPostLiked`, `TaskArticlePublished`… |

### Arborescence

```
qoe.fi/
├── apps/
│   ├── hi/           # Next.js — hi.qoe.fi (vitrine, mentions, pages légales)
│   ├── core/         # Next.js — qoe.fi (reader, feed, auth centralisée) ← MODÈLE DU MOBILE
│   ├── studio/       # Next.js — studio.qoe.fi (studio créateur, éditeur Tiptap, billing)
│   ├── admin/        # Next.js — admin.qoe.fi (superadmin, modération, CMS)
│   ├── tenants/      # Next.js — *.qoe.fi & domaines customs (blogs multi-tenant)
│   ├── api/          # Go (chi + sqlc + asynq) — api.qoe.fi (backend-of-record)
│   ├── mobile/       # Expo SDK 57 — apps/mobile (React Native, expo-router)
│   └── collab-server/# Hocuspocus/Yjs — co-édition TipTap temps réel
├── packages/         # Bibliothèques partagées (source de vérité)
│   ├── sdk/              # Couche data : client HTTP universel + server actions + hooks React Query
│   ├── auth/         # RBAC (permissions.ts, can(user, action)), mailer sécurité
│   ├── billing/      # Stripe + paywall (truncation AST côté serveur)
│   ├── config/       # ENV Zod, constantes, routes, tenant, features
│   ├── db/           # Prisma (schema unique) + repositories typés
│   ├── email/        # Outbox email + providers (Resend/Postmark/SES/SMTP) — dossier packages/workers
│   ├── flags/        # Feature flags (registre typé)
│   ├── i18n/         # Lingui (core + catalogs RN-safe)
│   ├── observability/# Logger + cache Redis (withCache)
│   ├── supabase/     # Clients SSR (server/middleware/browser) + SSO + broadcast
│   ├── theme/        # Design tokens + native.ts (tokens RN)
│   ├── ui/           # Composants partagés (ThoughtCard, SocialIcon, modals…)
│   ├── utils/        # cn, format, slugify, ActionResult, paywall helpers
│   └── …             # analytics, tsconfig
├── docker/           # Caddy, compose prod + dev
└── messages/         # Catalogues i18n (fr/en)
```

---

## 2. Flux de données — Comment tout communique

### 2.1 Le pattern « Server Actions → Proxy Go »

```
Navigateur (web) / Mobile
        │  fetch / React Query
        ▼
┌─────────────────────────────┐
│ Server Action Next.js        │  (packages/sdk/src/actions/*)
│  = proxy fin                 │
└──────────────┬──────────────┘
               │ QOE_API_URL défini ?  (goFetch, JWT Supabase en Bearer)
        ┌──────┴───────┐
        │ OUI          │ NON
        ▼              ▼
┌───────────────┐  ┌──────────────────┐
│ apps/api   │  │ @qoe/db (Prisma) │
│ (Go, chi/v5)  │  │ repositories     │
└──────┬────────┘  └──────────────────┘
       │
       ▼
  PostgreSQL (+ Redis cache, + Meilisearch, + asynq workers)
```

- **`safeAction(fn, {requireAuth})`** (`packages/sdk/src/actions/utils/safe-action.ts`)
  enveloppe chaque action : résout l'utilisateur Supabase (cookies SSR) puis
  retourne `ActionResult<T>` (`{ok, data}` / `{ok:false, error, code}`).
- **`goFetch(path, {method, body})`** (`.../utils/go-client.ts`) remplace
  l'implémentation Prisma par un appel HTTP au backend Go, **même contrat TS**.
- **Le mobile n'utilise PAS les server actions** : il appelle l'API Go en
  direct via `QoeApiClient` (`packages/sdk/src/client.ts`), avec le
  JWT Supabase en header `Authorization: Bearer`.

### 2.2 Auth — deux mondes, un même JWT Supabase

| Contexte | Client | Persistance | Fichier |
|---|---|---|---|
| Web SSR (Next) | `@qoe/supabase/server` | Cookies (`@supabase/ssr`) | `packages/supabase/src/server.ts` |
| Web middleware | `@qoe/supabase/middleware` | Cookies (refresh avant route) | `packages/supabase/src/middleware.ts` |
| Web navigateur | `@qoe/supabase/client` | Cookies | `packages/supabase/src/client.ts` |
| **Mobile** | `@supabase/supabase-js` | **AsyncStorage** | `apps/mobile/src/lib/supabase.ts` |

- Le backend Go valide les JWT via **JWKS Supabase** (RS256 + ES256 P-256,
  cf. `apps/api/internal/middleware/auth.go` + `ecdsa.go` + `rsa.go`),
  avec fallback HS256 `sb_secret_…`.
- **Clés API créateur** `qoe_live_…` (hash SHA-256 en base, scopes
  READ/WRITE/ANALYTICS) acceptées en alternative au JWT sur les routes
  créateur (`CombinedAuth`, `APIKeyAuth`).

### 2.3 Événements async — asynq (Go), queue unique

- **Une seule queue** : `apps/api/internal/queue` (asynq) — workers dans
  `apps/api/internal/workers/` :
  - `TaskArticlePublished/Updated/Deleted` → webhooks + newsletter + embedding + Meilisearch
  - `TaskSubscriberCreated` → webhooks
  - `TaskPostLiked` → newsletter (likes)
  - `TaskStripeEvent` → billing
  - `TaskSearchSync` → Meilisearch
  - `RunScheduledPublisher` → passe les articles SCHEDULED à PUBLISHED (toutes les minutes)
  - `CollabCleanup` → nettoyage des documents Yjs
- L'API Go enqueue via asynq (`apps/api/internal/queue/client.go`) ; les
  server actions Next émettent via l'endpoint interne
  `/internal/events/article-published` (secret `x-qoe-internal-secret`).
- **BullMQ supprimé** (`workers/` racine et `@qoe/workers` n'existent plus) :
  tout passe par asynq, lié au backend-of-record Go.

### 2.4 Cache

- `@qoe/observability` expose `withCache(key, ttl, fn)` (Redis) +
  `cacheInvalidateNamespace(prefix)`.
- Utilisé pour le feed following/trending (TTL 30s), invalidé à l'écriture
  (like, repost, create, delete).
- Rate-limiting global (120 req/min/IP) + créateur (600 req/min/user) via Redis.

---

## 3. L'API Go — le contrat consommé par le mobile

**Entrée** : `apps/api/cmd/server/main.go` → `newRouter(RouterDeps)` (testable).

### Middlewares (ordre)

1. `RealIP` + `Recoverer` (chi) + `Recovery` (panic → 500 JSON)
2. `Logger`
3. `CORS` (localhost:300x + qoe.fi)
4. `RateLimit` global 120/min/IP
5. Routes publiques : `OptionalAuth` (paywall), `CombinedAuth`/`Middleware` (créateur), `APIKeyAuth` (clés API)

### Endpoints principaux

| Méthode | Route | Module Go | Note mobile |
|---|---|---|---|
| GET | `/healthz`, `/health` | — | **Utilisé par le mobile** (`ApiStatus`) |
| GET | `/v1/feed?cursor&limit&tab` | `feed` | **Utilisé par le mobile** (`getFeed`) |
| GET | `/v1/feed/trending` | `feed` | — |
| POST | `/v1/thoughts` | `posts` | **Mobile** (`createThought`) |
| POST | `/v1/thoughts/{id}/like` | `posts` | **Mobile** (`toggleLike`) |
| POST | `/v1/thoughts/{id}/repost` | `posts` | **Mobile** (`toggleRepost`) |
| POST | `/v1/thoughts/{id}/bookmark` | `posts` | **Mobile** (`toggleBookmark`) |
| GET | `/v1/users/me` | `creator` | **Mobile** (`getMyProfile`) |
| GET | `/v1/users/{username}` | `creator` | **Mobile** (`getUserProfile`) |
| POST | `/v1/users/{id}/follow` | `creator` | **Mobile** (`toggleFollowUser`) |
| GET | `/v1/posts/{id}` + `/thread` + replies | `posts` | — |
| GET | `/v1/articles/{slug}?publicationId&viewerEmail` | `articles` | Paywall côté serveur |
| GET/POST/PATCH/DELETE | `/v1/articles…`, `/v1/categories…` | `articles` | RBAC créateur/média |
| GET | `/v1/notifications…`, `/v1/notifications/unread-count` | `notifications` | — |
| GET/PATCH | `/v1/notifications/preferences` | `notifications` | — |
| GET | `/v1/search/article` | `search` | Meilisearch public |
| POST | `/v1/webhooks…` | `webhooks` | Créateur |
| GET | `/v1/analytics/stats` | `analytics` | Proxy Umami |
| POST | `/internal/events/article-published` | `events` | Secret interne |
| POST | `/v1/stripe/webhook` | `billing` | Vérif signature |

### Modules Go (Clean Architecture)

Chaque module suit : `handler.go` (routes/HTTP) → `service.go` (logique) →
`internal/database/*.sql.go` (sqlc) + `internal/database/models.go`.

| Module | Fichiers clés | Rôle |
|---|---|---|
| `feed` | `assembly.go`, `service.go` | Feed following/trending, assemblage des slices (Bluesky-style) |
| `posts` | `create.go`, `service.go`, `threadgate.go` | Pensées, threads, likes/reposts/replies, notifications |
| `articles` | `handler.go`, `service.go`, `paywall.go`, `comments.go` | Articles, paywall, commentaires |
| `settings` | `handler.go`, `service.go` | Profil créateur, sous-domaine, clés API, onboarding |
| `creator` | `handler.go` | Profils publics, résolution publication par slug/subdomain |
| `notifications` | `handler.go`, `service.go` | Centre de notifications groupé |
| `analytics` | `handler.go`, `service.go` | Stats Umami |
| `webhooks` | `handler.go`, `service.go` | Webhooks créateur |
| `billing` | `handler.go` | Webhook Stripe → enqueue asynq |
| `search` | `handler.go` | Recherche Meilisearch publique |
| `events` | `handler.go` | Endpoints internes (émission asynq) |

---

## 4. L'application mobile (`apps/mobile`)

**Stack** : Expo SDK 57, expo-router, Expo UI (`@expo/ui` — composants natifs
SwiftUI/Jetpack Compose), FlashList, TanStack Query, Reanimated, Lingui.

### Structure (calquée sur `apps/core`)

```
apps/mobile/src/
├── app/            # Routes expo-router (index → Feed, explore)
├── components/     # UI générique (themed-text/view, app-tabs, drawer/)
├── features/       # Domaines métier (auth, feed, home, sidebar)
├── hooks/          # use-theme, use-color-scheme
├── lib/            # api, supabase, session, i18n, env, query-client
├── constants/      # theme (mapping tokens @qoe/theme/native)
└── types/          # lingui.d.ts
```

### Dépendances vers les packages partagés

| Package | Entrée | Usage mobile |
|---|---|---|
| `@qoe/sdk` | **`@qoe/sdk/mobile`** | Client HTTP + types + query-keys + `useInfiniteFeed` (**pas** les server actions) |
| `@qoe/theme` | `@qoe/theme/native` | Tokens RN pré-résolus (hex/rgba) |
| `@qoe/i18n` | `@qoe/i18n/core` + `@qoe/i18n/catalogs` | Singleton Lingui + catalogues fr/en |
| `@qoe/config` | (indirect) | constantes partagées |

### Flux d'authentification mobile

1. `src/lib/supabase.ts` : client `@supabase/supabase-js` + AsyncStorage.
2. `AuthProvider` (`src/features/auth/auth-provider.tsx`) : expose
   `session` / `signIn` / `signUp` / `signOut`, synchronise
   `setAccessToken()` dans `src/lib/session.ts` (module singleton, pas de
   contexte React → évite les imports circulaires).
3. `QoeApiClient` (`src/lib/api.ts`) : lit le token via `getAuthToken` et
   l'envoie en `Authorization: Bearer` à chaque requête.
4. `_layout.tsx` : sans session → `LoginScreen` ; avec session → `AppDrawer`
   (deck façon X) autour de `AppTabs` (NativeTabs).

### Résolution de l'hôte API

`src/lib/api.ts` → `getApiBaseUrl()` :
- `EXPO_PUBLIC_API_URL` défini (prod/staging) → tel quel.
- simulateur/émulateur/web → `localhost:8080`.
- appareil physique → hôte `hostUri` de Metro (IP du Mac sur le réseau local).

### Ce qui reste à faire côté mobile (par rapport au web)

- [ ] Notifications (endpoint Go prêt : `/v1/notifications`).
- [ ] Recherche (endpoint Go prêt : `/v1/search/article`).
- [ ] Profil utilisateur complet (endpoint Go prêt : `/v1/users/{username}`).
- [ ] Lecture d'articles + paywall (endpoint Go prêt : `/v1/articles/{slug}`).
- [ ] Composer (threads, sondages, pièces jointes) — endpoint Go prêt (`/v1/thoughts`).
- [ ] Notifications push (expo-notifications) — **non câblé côté serveur**.

---

## 5. Packages partagés — rôles & relations

### `@qoe/db` — Source de vérité des données
- **`prisma/schema.prisma`** : schéma unique (modèles User, Publication,
  Article, Thought, Like, Follow, Subscriber, Notification, Highlight,
  Poll, StarterPack, MediaMember, Wallet…).
- `src/repositories/*` : accès typé (posts, articles, follows, bookmarks,
  notifications, highlights, polls, threadgates, starterPacks, wallet…).
- `src/client.ts` : singleton Prisma. `src/index.ts` : re-exports.
- **Relation** : consommé par les server actions (`@qoe/sdk/actions/*`)
  et les workers TS. Le backend Go a son **propre** mapping SQL (sqlc,
  `apps/api/sql/`) — attention à la double source pour les requêtes Go.

### `@qoe/sdk` — La couche data (web + mobile)
- **`client.ts`** : `QoeApiClient` universel (fetch + Bearer token) — le
  coeur du mobile.
- **`mobile.ts`** : entrée RN-safe (client + types + query-keys +
  `useInfiniteFeed`). ⚠️ N'expose **pas** les server actions.
- **`actions/*`** : server actions Next (`'use server'`), proxy Go quand
  Go est actif. Organisées par domaine (feed, articles, auth, search,
  notifications, tenant, admin, dashboard, highlights, starterPacks, polls,
  threadgates).
- **`hooks/*`** : hooks React Query. Deux familles :
  - *Optimistes classiques* (`useOptimisticLike/Repost/Bookmark/Follow`) :
    update du cache + snapshot + rollback.
  - *Queue + shadow* (`usePostLikeMutationQueue`, `useToggleMutationQueue`,
    `shadow.ts`) : port de l'architecture Bluesky, sérialise les toggles,
    compteurs dérivés du delta serveur/shadow.
- **`query-keys.ts`** : registre central des clés de cache (feed, users,
  tenants, subscriptions, notifications, search…).

### `@qoe/theme` — Design tokens
- `src/tokens.ts` / `styles/*.css` : tokens CSS (web).
- **`src/native.ts`** : tokens pré-résolus hex/rgba pour React Native
  (`nativeTokens.light/dark`) — le mobile mappe les sémantiques dans
  `apps/mobile/src/constants/theme.ts`.

### `@qoe/i18n` — Lingui
- `core.ts` : singleton Lingui + `t(clé, défaut, params)` (ICU).
- `catalogs.ts` : fusionne catalogues compilés + legacy, **RN-safe**.
- `provider.tsx` / `server.ts` : web (client/server).
- **Relation** : les catalogues vivent dans `messages/` (racine).

### `@qoe/supabase` — Auth SSR
- `server.ts` / `middleware.ts` / `client.ts` : 3 clients SSR.
- `cookie-config.ts` : domaine racine (`.qoe.fi` / `.lvh.me`) pour partager
  les JWT entre sous-domaines.
- `sso.ts` : JWT HS256 stateless (Web Crypto).
- `broadcast.ts` : sync auth inter-onglets (BroadcastChannel).
- `storage.ts` : upload média.

### `@qoe/auth` — RBAC
- `permissions.ts` : matrice déclarative (`can(user, action)`), scopes
  `media:*` pour le workflow média du dashboard.
- `mailer.ts` : emails transactionnels de sécurité (alerte login, mdp,
  archive RGPD) via Resend.

### `@qoe/flags` — Feature flags
- `flags.ts` : registre typé (`FLAGS` + `defaultFor`).
- `server.ts` : `isFlagOn`, `createFlagsContext` (dégradation gracieuse).
- Provider React hydraté depuis le payload SSR (pas de flicker).

### `@qoe/observability`
- Logger + `withCache` / `cacheInvalidateNamespace` (Redis).
- Consommé par `@qoe/db` (repositories) et le feed.

### `@qoe/utils`
- `cn`, `slugify`, `shortId`, formatage, `ActionResult<T>` +
  `actionOk`/`actionErr`, helpers paywall (`sliceContentAtPaywall`),
  `normalizeArticleAttributions`.

---

## 6. Les apps web — rôles & relations

| App | Domaine | Particularités |
|---|---|---|
| **core** | Lecteur + auth | Feature-Sliced (`src/features/`), feed temps réel (`useRealtimeFeedBuffer` + Supabase Realtime), virtualisation, composer, profils. **Modèle du mobile.** |
| **studio** | Studio créateur | Éditeur Tiptap (paywall dividers, annotations, collaboration Hocuspocus), workflow média (soumission/revue, RBAC), billing Stripe, auto-save. |
| **admin** | Superadmin | Modération, config CMS, stats, API access. |
| **tenants** | Blogs multi-tenant | Middleware résout le domaine → tenant, thème dynamique, paywall, annotations. |
| **hi** | Vitrine | CMS SystemConfig, pages légales, liens institutionnels. |

**Règle d'or** : les apps n'importent **jamais** directement entre elles —
tout passe par `packages/*`. (`transpilePackages: ["@qoe/*"]` dans chaque
`next.config.ts`.)

---

## 7. Workers

| Worker | Techno | Rôle |
|---|---|---|
| `apps/api/cmd/worker` | Go + asynq | **Queue unique** : webhooks, newsletter fanout, sync Meilisearch, embeddings jina, Stripe, notifications, scheduler de publication, nettoyage collab |

---

## 8. Règles architecturales (à respecter)

1. **SSOT** : le modèle de données n'existe que dans `packages/db/prisma/`.
   Ne pas dupliquer.
2. **Couplage** : les composants passent par `packages/ui` +
   `packages/sdk`. Imports directs entre apps interdits.
3. **Paywall** : la troncature du contenu premium se fait **côté serveur**
   (`packages/billing/src/paywall/ast-truncation.ts` côté TS,
   `apps/api/internal/modules/articles/paywall.go` côté Go). Jamais de
   `display:none`.
4. **Optimistic UI** : snapshot + rollback obligatoires.
5. **Mobile** : le mobile consomme l'API Go via `@qoe/sdk/mobile` —
   ne jamais importer de server action (`'use server'` / Prisma) dans l'app.
6. **Go** : quand `QOE_API_URL` est défini, les server actions doivent
   proxiser via `goFetch` (ne pas dupliquer la logique Prisma).

---

## 9. Checklist de démarrage rapide (mobile)

```bash
# 1. Bases de données
docker compose -f docker-compose.dev.yml up -d db redis

# 2. API Go (backend-of-record) — le mobile en dépend
cd apps/api && go run ./cmd/server   # → :8080 (ou PORT=8080)

# 3. Mobile sur simulateur iOS (recommandé sur Mac)
pnpm mobile:ios                          # Metro sur :8081

# 4. Test rapide UI
pnpm mobile:web
```

- La carte « API qoe.fi · connectée » (feed-screen header) confirme que le
  mobile atteint bien l'API Go (`/healthz`).
- Pour forcer une URL d'API : `EXPO_PUBLIC_API_URL` dans `apps/mobile/.env`.

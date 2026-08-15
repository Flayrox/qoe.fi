# 🧭 Sunset de `apps/api` (api-legacy.qoe.fi) — Plan de migration

> **Contexte** : le backend Go (`apps/api-go`) est le *backend-of-record*.
> `api.qoe.fi` route vers Go ; `api-legacy.qoe.fi` route encore vers l'API Hono
> (`apps/api`).
>
> **Positionnement** :
> - **Mobile (iOS/Android) → backend Go** directement (`/v1/posts`, `/v1/feed`,
>   `/v1/users`, `/v1/notifications`…). Les endpoints mobiles de Hono
>   (`/v1/feed`, `/v1/thoughts*`, `/v1/users*`) ne servent plus que les
>   **anciennes versions** de l'app et peuvent disparaître avec le sunset.
> - **`apps/api` (Hono) = API créateurs/médias uniquement** : le cas d'usage est
>   *« utiliser qoe.fi comme CMS »* — un créateur publie ses articles ailleurs et
>   les importe via API, ou un média publie sur qoe.fi depuis son propre CMS.
>   Clés `qoe_live_*`, endpoints lecture (`/v1/articles`, `/v1/categories`,
>   `/v1/analytics/stats`).
>
> **Aucun code du monorepo n'appelle l'API Hono** (server actions → `goFetch`/
> `QOE_API_GO_URL` ou Prisma). La migration se coordonne donc avec les
> **consommateurs externes** (apps mobiles en store, intégrations créateurs,
> webhooks Stripe/Supabase).

---

## 1. Inventaire : endpoints Hono vs couverture Go

| Endpoint Hono (`apps/api`) | Usage | Équivalent Go (`apps/api-go`) | Statut |
|---|---|---|---|
| `GET /health` | ops | `GET /health` + `/healthz` | ✅ couvert |
| `POST /webhooks/stripe` (BullMQ) | Stripe | `POST /v1/webhooks/stripe` (asynq, idempotence Redis) | ✅ couvert — ⚠️ vérifier l'URL configurée côté Stripe |
| `POST /webhooks/supabase` (stub) | Supabase | `POST /v1/webhooks/supabase` | ✅ couvert |
| `GET /v1/articles` (liste) | **CMS créateurs** | `GET /v1/articles` (JWT ou clé API) | ⚠️ **contrat à aligner** (§2.2) |
| `GET /v1/articles/:slug` | **CMS créateurs** | `GET /v1/articles/{slug}` (public, `publicationId` + paywall) | ⚠️ contrat différent (§2.2) |
| `GET /v1/categories` | **CMS créateurs** | `GET /v1/categories` (clé API) | ✅ parité |
| `GET /v1/analytics/stats` | **CMS créateurs** | `GET /v1/analytics/stats` (clé API, proxy Umami) | ✅ parité |
| `GET /v1/feed` | anciennes apps mobiles | `GET /v1/feed` (Go, feed « following ») | 🗑️ **plus nécessaire** (mobile → Go) |
| `POST /v1/thoughts{/like,/repost,/bookmark}` | anciennes apps mobiles | `/v1/thoughts*` (alias posts) | 🗑️ plus nécessaire (mobile → Go) |
| `GET /v1/users/me`, `/v1/users/:username`, `/v1/users/:id/follow` | anciennes apps mobiles | équivalents Go | 🗑️ plus nécessaire (mobile → Go) |
| `GET /search/articles` (Meilisearch) | externe ? | ❌ absent en Go | ⚠️ à recréer **si** des consommateurs l'utilisent |

**Verdict** : le périmètre à préserver = **l'API créateurs (CMS)**. Les endpoints
mobiles peuvent être abandonnés (mobile → Go). Il reste **1 contrat à aligner**
(articles) et **1 décision** (search).

---

## 2. Écarts à traiter

### 2.1 — Endpoints mobiles : à abandonner, pas à migrer
`/v1/feed`, `/v1/thoughts*`, `/v1/users*` de Hono n'ont plus de raison d'être
dès que les versions actuelles de l'app mobile pointent vers Go
(`/v1/posts`, `/v1/feed` Go, `/v1/users/me`…). Ils restent servis par
api-legacy pendant la transition (anciennes versions en prod), puis disparaissent
avec le sunset. **Aucun travail Go nécessaire.**

### 2.2 — Contrat `GET /v1/articles` (créateurs/médias)
| | Hono | Go |
|---|---|---|
| Résolution auteur | via clé API (`qoe_live_*`) | `publicationId` en query + RBAC |
| Pagination | `limit` + `page` (+ `total`/`pages`) | `limit` + `offset` |
| Filtres | `published: true`, `category` | — |
| Contenu | tronqué paywall (`contentHtml`, `isTruncated`, `paywallMeta`) | — |
| Création/édition | ❌ (lecture seule) | ✅ `POST/PATCH /v1/articles` (+ publish/delete) |

C'est **le cœur du cas d'usage CMS** : un créateur/média doit pouvoir lister et
lire ses articles publiés depuis son propre CMS. Deux options :

- **Option A — étendre Go** (recommandé si des intégrations existent en prod) :
  le handler `list` accepte `page`/`category`, filtre `published`, tronque le
  paywall et résout la publication via la clé API. Parité stricte + docs à jour.
- **Option B — documenter le contrat Go** : mettre à jour la doc développeur
  (`publicationId` + `offset`). Plus simple, mais breaking pour les
  intégrations existantes.

Le Go couvre en plus **create/update/publish/delete** (utile pour le cas
« publier depuis son CMS ») — à documenter comme bonus de l'API créateurs.

### 2.3 — `GET /v1/search/articles`
- **Décision** : est-il consommé par des clients externes ? Si oui, le recréer en
  Go (`modules/search`, client Meilisearch déjà en dépendance, index déjà
  peuplé par le worker `search.sync`). Sinon, l'abandonner avec le sunset.

---

## 3. Plan de migration (phases)

### Phase 1 — Aligner l'API créateurs en Go
- [ ] Trancher §2.2 (étendre `articles.list` ou documenter le contrat Go)
- [ ] Trancher §2.3 (recréer `/v1/search/articles` en Go ou l'abandonner)
- [ ] Tests Go + `go vet ./... && go test ./... && go build ./...`

### Phase 2 — Documentation & configuration
- [ ] `developer-client.tsx` (dashboard) : `https://api-legacy.qoe.fi/v1/articles`
      → `https://api.qoe.fi/v1/articles` (toutes les occurrences `api-legacy`)
- [ ] `apps/api-go/README.md` : table des endpoints créateurs à jour
- [ ] Vérifier la config webhook **Stripe** → `https://api.qoe.fi/v1/webhooks/stripe`
- [ ] Vérifier la config webhook **Supabase** → `https://api.qoe.fi/v1/webhooks/supabase`
- [ ] Mise à jour des md d'architecture (README, ARCHITECTURE, ACTIVATION, DEV,
      DOCKER, GETTING_STARTED, DEPLOYMENT, HANDOFF, AI_CODEBASE_MAP)

### Phase 3 — Observation du trafic
- [ ] Logs Caddy d'`api-legacy.qoe.fi` pendant 7–14 jours : objectif **zéro
      requête** (anciennes apps mobiles mises à jour, webhooks basculés)
- [ ] Migrer tout consommateur résiduel (release mobile, intégration CMS)

### Phase 4 — Retrait de l'infra (trafic nul)
- [ ] `docker/caddy/Caddyfile` : supprimer le bloc `api-legacy.qoe.fi`
- [ ] `docker-compose.yml` : supprimer le service `api`
- [ ] `Dockerfile` : supprimer la cible `api`
- [ ] `packages/config/src/tenant.ts` : retirer `api-legacy.qoe.fi` de `SYSTEM_DOMAINS`
- [ ] `docker-compose*.yml` : retirer `NEXT_PUBLIC_API_URL` des 5 apps
- [ ] `.github/workflows/ci.yml` : retirer l'étape coverage `apps/api`

### Phase 5 — Suppression du code
- [ ] `git rm -r apps/api` (+ `apps/api/src/test`)
- [ ] Nettoyage des deps mortes (`@qoe/billing` : garder
      `truncateArticleContentForPaywall` pour `workers/`, retirer `verifyWebhook`
      si non utilisé ailleurs)
- [ ] Docs finales (README, HANDOFF…)

---

## 4. Risques & rollback

| Risque | Mitigation |
|---|---|
| Intégrations créateurs en prod sur le contrat Hono `articles` | Golden tests Hono→Go ; Option A (§2.2) avant bascule |
| Anciennes apps mobiles encore sur api-legacy | Phase 3 (logs) avant toute suppression ; coordonner la release mobile |
| Webhook Stripe livré aux deux URLs (double traitement) | Vérifier la config Stripe ; idempotence des deux côtés |
| Régressions après suppression | Rollback : `git revert` tant que Phase 4 n'est pas poussée ; Go testé (`go test ./...`) |

**Rollback** : tant que Phase 4 n'est pas committée, il suffit de ne pas pousser —
l'ancien déploiement Hono reste intact dans l'historique.

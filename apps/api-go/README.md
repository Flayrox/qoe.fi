# api-go — Backend Go de qoe.fi (état de l'art)

Migration incrémentale de l'API vers Go (Clean Architecture / Hexagonal).
**Objectif :** Go devient le *backend-of-record* ; les server actions Next.js
deviennent des proxies fins. Le frontend Next.js ne bouge pas.

## Stack
- **Router** : `chi/v5` (100% `net/http`)
- **DB** : `sqlc` (vrai SQL typé) + `pgx/v5` (pool calibré VPS)
- **Vectoriel** : `pgvector-go` (intégré aux requêtes sqlc)
- **Queues** : `asynq` (remplace BullMQ) — *à venir*
- **Auth** : JWT Supabase (RS256 via JWKS, fallback HS256 `sb_secret_…`)

## Structure
```
apps/api-go/
├── cmd/server/main.go        # point d'entrée API HTTP
├── internal/
│   ├── config/               # variables d'environnement
│   ├── database/             # code généré par sqlc (package db) + pool (dbpool)
│   ├── middleware/           # auth JWT, CORS, recover, log
│   ├── response/             # sérialisation JSON
│   └── modules/              # domaines métier (posts, feed, …)
├── sql/
│   ├── schema/schema.sql     # DDL exporté du datamodel Prisma
│   └── queries/              # requêtes SQL pures (*.sql) pour sqlc
├── sqlc.yaml
└── go.mod
```

## Usage
```bash
# Installer sqlc (une fois)
go install github.com/sqlc-dev/sqlc/cmd/sqlc@latest

# Générer le code sqlc après modification des requêtes
$(go env GOPATH)/bin/sqlc generate

# Lancer l'API (dev)
PORT=8080 DATABASE_URL="postgresql://…" SUPABASE_JWT_SECRET="…" go run ./cmd/server

# Lancer les tests
go build ./... && go vet ./...
```

## Endpoints (module Feed + Posts)
| Méthode | Route | Description |
|---|---|---|
| GET | `/healthz` | healthcheck |
| GET | `/v1/feed?limit=&cursor=` | feed des publications suivies (pag. offset via cursor) |
| GET | `/v1/feed/trending?limit=&cursor=` | pensées trending 7j |
| POST | `/v1/posts` | créer une pensée (validation 500c, pièces jointes, sondage) |
| GET | `/v1/posts/{id}` | lire une pensée (+ auteur, état viewer) |
| POST | `/v1/posts/{id}/like` | toggle like (+ notification LIKE, dédup) |
| POST | `/v1/posts/{id}/repost` | toggle repost (+ notification REPOST) |
| POST | `/v1/posts/{id}/reply` | répondre (threadgate + notifications REPLY/MENTION) |

## Statut
- [x] Fondations (config, pool, auth, middleware, réponse)
- [x] Module Feed + Posts (sqlc, service, handlers) — **testé bout en bout**
- [x] Shape `FeedSlice` complète (parent/root/repost, pièces jointes, sondages, dédup)
- [x] Threadgates (everyone / subscribers / following / mentioned)
- [x] Notifications Go (LIKE, REPOST, REPLY, MENTION — préférences + dédup)
- [x] Invalidation cache Redis (`feed:trending:`, `feed:following:{user}:`)
- [x] Proxies server actions → Go : getFeedItemsAction, createThoughtAction,
      replyToPostAction, toggleLikePostAction, toggleRepostPostAction
      (activés par `QOE_API_GO_URL`, fallback TS sinon)
- [x] Workers **asynq** (`cmd/worker`) : webhook dispatch (HMAC-SHA256 + logs) et
      newsletter fanout ; endpoint interne `/internal/events/*` (enqueue asynq,
      secret `QOE_INTERNAL_SECRET`) ; article.published + subscriber.created
      câblés côté TS (goFetch) — **testé bout en bout** (receiver HTTP reçoit
      le POST signé, delivery SUCCESS)
- [ ] Modules suivants : articles/paywall, notifications, creator analytics,
      getPostThread endpoint, meilisearch/stripe workers asynq
- [ ] Docker multi-stage + Caddy reverse-proxy

## Workers (asynq)
```bash
# Lancer le worker (traitement asynq)
DATABASE_URL="…" REDIS_URL="redis://localhost:6379" go run ./cmd/worker

# Enqueue un événement (API serveur)
curl -X POST http://localhost:8080/internal/events/article-published \
  -H "Content-Type: application/json" -H "x-qoe-internal-secret: $QOE_INTERNAL_SECRET" \
  -d '{"eventId":"…","publicationId":"…","articleId":"…",…}'
```

## Contraintes DB importantes
- Les colonnes `id` (TEXT) et `updatedAt` n'ont **pas de défaut en base** (Prisma
  les génère côté client). Les INSERTs Go utilisent `gen_random_uuid()::text`
  et `now()`.
- Colonnes FK nullables (`parentId`, `rootId`, `repostId`) : typées
  `pgtype.Text` via overrides sqlc ; NULL via `NULLIF(arg,'')`.

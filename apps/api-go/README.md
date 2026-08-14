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
| GET | `/v1/feed?limit=&offset=` | feed des publications suivies |
| GET | `/v1/feed/trending?limit=&offset=` | pensées trending 7j |
| POST | `/v1/posts` | créer une pensée |
| GET | `/v1/posts/{id}` | lire une pensée (+ auteur, état viewer) |
| POST | `/v1/posts/{id}/like` | toggle like |
| POST | `/v1/posts/{id}/repost` | toggle repost |
| POST | `/v1/posts/{id}/reply` | répondre |

## Statut
- [x] Fondations (config, pool, auth, middleware, réponse)
- [x] Module Feed + Posts (sqlc, service, handlers) — **testé bout en bout**
- [ ] Serveur actions Next → proxies fins (nécessite de répliquer les
      side-effects Go : notifications, invalidation cache, hashtags, threadgates)
- [ ] Workers asynq (newsletter, meilisearch, stripe, webhooks)
- [ ] Modules suivants : articles/paywall, notifications, creator analytics

## Contraintes DB importantes
- Les colonnes `id` (TEXT) et `updatedAt` n'ont **pas de défaut en base** (Prisma
  les génère côté client). Les INSERTs Go utilisent `gen_random_uuid()::text`
  et `now()`.
- Colonnes FK nullables (`parentId`, `rootId`, `repostId`) : typées
  `pgtype.Text` via overrides sqlc ; NULL via `NULLIF(arg,'')`.

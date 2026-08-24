# Retrait complet de Prisma — roadmap « zéro Prisma, tout en Go »

*Date : 2026-08-24 — décision : plus aucun Prisma dans le monorepo.*

## Objectif

**Un seul langage pour toute la couche données/logique : Go.** Prisma disparaît
totalement :
- plus de client Prisma exécuté nulle part (runtime) ;
- plus de schéma/migrations gérés par Prisma (bascule sur **goose**) ;
- plus de `packages/db`, ni de fallbacks Prisma dans les apps.

Le UI (apps Next.js core/studio/admin) **reste en React** : ce sont des coquilles
fines qui ne touchent plus jamais la base — tout passe par l'API Go
(`apps/api`, chi + sqlc + pgx), qui est déjà le *backend-of-record*.

## Pourquoi c'est possible aujourd'hui

- `apps/core` (parcours lecteur) : chemin nominal **100 % Go** (audits
  [`PRISMA_AUDIT_100GO.md`](./PRISMA_AUDIT_100GO.md)) — les `prisma.` restants
  sont des fallbacks dev.
- `apps/api` a déjà son propre schéma SQL (`apps/api/sql/schema/schema.sql`,
  exporté du datamodel Prisma) appliqué par les tests d'intégration.
- Les modules Go webhooks/oauth/settings couvrent déjà la surface développeur
  de studio.

## Phases

### Phase 1 — Plus aucun Prisma exécuté au runtime (en cours)

| # | Surface | État |
|---|---|---|
| P2-2 | Studio **webhooks / OAuth / page développeur** → Go (actions déjà Go ; pages `developer` + `oauth` Go-first ; nouvel endpoint `GET /v1/settings/api-keys`) | ✅ livré (2026-08-24) |
| P2-3a | Studio **media** → module Go `media` complet (workspaces, liste, détail, création, réglages, invitations, membres) + page/actions Go-first | ✅ livré (2026-08-24) |
| P2-3b | Studio **audience** → `GET /v1/analytics/audience/subscribers` + page Go-first | ✅ livré (2026-08-24) |
| P2-3c | Studio **import** → `POST /v1/import/articles` (création dédupliquée par slug) + action Go-first | ✅ livré (2026-08-24) |
| P2-3d | Studio **dashboard/accueil + sidebar** → `GET /v1/analytics/dashboard` (métriques, articles récents, brouillons, pensées programmées, dernier écrit, lectures 30j) ; sidebar → `/v1/users/me` + `/v1/notifications/unread-count` + `/v1/media/workspaces` | ✅ livré (2026-08-24) |
| P2-3e | Studio **upload MediaAsset** (`registerMediaAsset`) → `POST /v1/media-assets` (CAS sha256, TTL 3j, réactivation) + route upload Go-first | ✅ livré (2026-08-24) |
| P2-2b | Studio **settings créateur** → `GET /v1/settings/publication` (publication + navigation + socialLinks + catégories + owner, mêmes champs que l'include Prisma) + page Go-first | ✅ livré (2026-08-24) |
| P2-2b | Studio **advanced (collaborations/attributions)** → module Go `collaborations` (invite-by-email, invite, respond, withdraw, remove, list) + actions Go-first | ✅ livré (2026-08-24) |
| P2-2b | Studio **onboarding créateur** → page Go-first via `GET /v1/users/me` (`hasCompletedOnboarding` + `publicationId`), fallback Prisma dev | ✅ livré (2026-08-24) |
| P2-2b | Studio **devtools (inspecteur)** → module Go `devtools` (`GET /v1/devtools/data`, superadmin-only) + `getDevtoolsData` Go-first | ✅ livré (2026-08-24) |
| P2-2b | Studio restant : — (surface créateur clôturée) | ✅ |
| P3 | Seed (`packages/db/prisma/seed.ts`) → **Go/sqlc** (`cmd/seed` + `internal/seed`, upserts idempotents) | ✅ livré (2026-08-24) |
| P3 | Billing lecteur (`GET /v1/me/billing`) + `exportAccountDataAction` + `completeOnboarding` lecteur → module users Go + page/actions core Go-only | ✅ livré (2026-08-24) |
| P3 | **Core 100 % Go** — suppression de tous les fallbacks Prisma de `apps/core` (home, history, library, highlights, onboarding, settings, login, layout, cached-queries, upload, vector-feed) | ✅ livré (2026-08-24) |
| P3 | **Admin → module Go `admin`** — dashboard, users (liste/détail/modération), widgets (articles/tendances/promos), config & feature flags, frontend CMS, OAuth, demandes d'accès API, livraisons de notifications — layout/pages/actions Go-first | ✅ livré (2026-08-24) |

Détail de la cartographie : [`PRISMA_AUDIT_BEYOND_CORE.md`](./PRISMA_AUDIT_BEYOND_CORE.md).

### Phase 2 — Migrations goose (le schéma cesse d'appartenir à Prisma) ✅ livré (2026-08-24)

- **Migration squashée** : `apps/api/sql/migrations/00001_init.sql` (copie de
  `apps/api/sql/schema/schema.sql` + directives `-- +goose Up` / `Down`), qui
  remplace les 29 migrations de `packages/db/prisma/migrations/` (historique
  dev squassé — la source de vérité reste `schema.sql` pour sqlc).
- **Binaire interne** : `apps/api/cmd/migrate` (`qoe-migrate`) — goose en
  bibliothèque (`github.com/pressly/goose/v3`), `DATABASE_URL`, commandes
  `up` (défaut) / `up-to` / `down` / `down-to` / `status` / `version`.
- **Docker prod** : le target `migrate` du Dockerfile racine build désormais
  `qoe-migrate` (stage Go, plus de node/prisma) ; l'image `api` embarque
  aussi `qoe-migrate` + `/migrations`.
- **Docker dev** : `docker-compose.dev.yml` — image `golang:1.26-alpine` +
  `go run ./cmd/migrate up` (bind mount `apps/api`).
- **Scripts** : `pnpm db:migrate` (ex `prisma:migrate`) ; `seed-docker.sh`
  passe par goose (`down-to 0` + `up` sur `--reset`).
- **CI** : l'étape e2e « Prepare Database » passe de `prisma db push` à
  `go run ./cmd/migrate up` (setup-go ajouté).
- **Prod existante** : baseline une fois (`CREATE TABLE goose_db_version` +
  `INSERT version_id=1`), documenté dans `DEPLOYMENT.md` §4bis.
- **Validé** : test d'intégration `internal/migrations` — base VIERGE
  (testcontainers) → `goose up` → schéma complet (tables, enums, pgvector),
  version 1, idempotent.

Reste en Phase 3 : supprimer `prisma.config.ts`, `schema.prisma`,
`packages/db/prisma/` (le seed est déjà porté en Go — voir Phase 1).

### Phase 3 — Nettoyage

- **✅ Livré (2026-08-24) — core 100 % Go** : les fallbacks Prisma dev de
  `apps/core` ont été supprimés (home, history, library, highlights,
  onboarding, settings, login, layout, cached-queries, upload, vector-feed).
  Les types du feed (`FeedSlice`, `FeedPost`, `FeedArticleDTO`…) vivent
  désormais dans `apps/core/src/lib/feed-types.ts` (plus aucun import
  `@qoe/db` dans core). Nouveaux endpoints : `GET /v1/me/billing`,
  `POST /v1/me/onboarding/complete`, `GET /v1/me/data-export` (module users).
- Reste : supprimer **`packages/db`** (repositories devenus morts) et les
  dépendances `@prisma/client`, `prisma`, `prisma.config.ts` ; retirer les
  `paths` tsconfig et les entrées `pnpm-workspace.yaml` / allowlist
  postinstall.
- Mettre à jour ACTIVATION.md, DEV.md, MIGRATION.md, Dockerfiles, CI.

## Pattern de branchement (inchangé)

**Go en primaire, fallback Prisma dev** — chaque page/action :
1. `isGoEnabled()` → `goFetch<T>(...)` (JWT Supabase via `go-client.ts`) ;
2. `catch` → fallback Prisma **uniquement si `QOE_API_URL` absent** ;
3. à la Phase 3, le fallback est supprimé et `goFetch` devient obligatoire.

Vérification : `go build ./... && go vet ./... && go test` (testcontainers) côté
Go, `tsc --noEmit` côté apps, puis recensement `grep -rn "prisma\."` pour
confirmer la disparition du chemin nominal.

## Étapes livrées

- `GET /v1/settings/api-keys` (liste des clés API, sans `keyHash`) — query sqlc
  `ListApiKeys`, service `ListApiKeys`, handler + tests d'intégration.
- `apps/studio` `developer/page.tsx` + `oauth/page.tsx` : Go-first
  (`/v1/users/me` pour `apiAccessStatus`/`apiApplicationReason` +
  `/v1/settings/api-keys`), fallback Prisma dev.
- `apps/studio` `webhooks/actions.ts` : le check `dbUser` Prisma ne s'exécute
  plus sur le chemin Go (relégué dans le fallback) — 0 Prisma nominal.
- **Module Go `media`** (`apps/api/internal/modules/media`) : 9 endpoints
  (`GET/POST /v1/media`, `GET /v1/media/workspaces`, `GET /v1/media/{id}`,
  `PATCH /v1/media/{id}/settings`, `POST /v1/media/{id}/invites`,
  `POST /v1/media/invites/{token}/accept`, `PATCH/DELETE
  /v1/media/{id}/members/{userId}`, `PATCH .../permissions`) — RBAC
  `permissions.CanMedia`, notifications media en SQL (dédup + prefs), audit
  log, transactions. Tests d'intégration complets (création, slug pris,
  workspaces, liste, détail, invitation, acceptation, rôles, permissions,
  retrait, réglages).
- `GET /v1/analytics/audience/subscribers?publicationId=` (liste des abonnés
  de la page audience) — query sqlc `ListSubscribers` + test.
- `apps/studio` `media/page.tsx` + `media/actions.ts` (8 actions) et
  `audience/page.tsx` : Go-first avec fallback Prisma dev. Les DTO Go imitent
  les shapes Prisma (`publication`, `members[].user`, `invites[].inviter`,
  `_count.articles`) pour MediaStudioClient.
- **Module Go `imports`** (`apps/api/internal/modules/imports`) :
  `POST /v1/import/articles` — création en lot dédupliquée (publicationId +
  slug), RBAC owner/editor. Tests : création, dédup, lot mixte, média, refus.
- **Module Go `mediaassets`** (`apps/api/internal/modules/mediaassets`) :
  `POST /v1/media-assets` — registre CAS par SHA-256 (création DRAFT_ORPHAN
  TTL 3j, réutilisation d'un asset existant, réactivation PURGED/SOFT_DELETED),
  `ownerId` = utilisateur JWT (jamais client). Tests : création, dédup,
  réactivation, validations.
- `GET /v1/analytics/dashboard?publicationId=&workspaceType=` — page d'accueil
  complète en un appel (umamiWebsiteId, compteurs abonnés/payants, MRR =
  somme ltvCents, articles récents, brouillons, pensées programmées, dernier
  écrit avec réactions, lectures 30j vues/visiteurs). Accès : publication
  personnelle ou membre média (tout rôle). Tests d'intégration.
- `apps/studio` `(creator)/page.tsx` + `app-sidebar.tsx` : Go-first (dashboard
  overview + `/v1/users/me` + unread-count + media/workspaces) avec fallback
  Prisma dev.
- `apps/studio` `app/api/articles/upload/route.ts` : enregistrement MediaAsset
  via `POST /v1/media-assets` (Go-first), fallback repository Prisma dev.
- `apps/studio` `import/actions.ts` : parsing/sanitize conservés en TS
  (logique pure, zéro DB), création dédupliquée via `POST /v1/import/articles`
  (Go-first), fallback Prisma dev.
- `GET /v1/settings/publication?publicationId=` (module settings) : publication
  complète + navigation + socialLinks + articles + catégories + owner — mêmes
  champs JSON que l'`include` Prisma d'origine (mapping studio inchangé). RBAC :
  publication perso OU média avec `manage_settings`. `apps/studio`
  `settings/page.tsx` Go-first.
- `apps/core` `app/api/upload/route.ts` : enregistrement MediaAsset via
  `POST /v1/media-assets` (Go-first) — **dernier** usage Prisma du chemin
  nominal lecteur supprimé.
- **Migration goose** : `apps/api/sql/migrations/00001_init.sql` (squash du
  schéma sqlc + directives Up/Down) + binaire `cmd/migrate` (goose v3 en
  bibliothèque) + Docker prod/dev, scripts, CI e2e — le schéma n'appartient
  plus à Prisma (voir Phase 2).
- **Seed Go** : `apps/api/cmd/seed` + `apps/api/internal/seed` (port de
  `packages/db/prisma/seed.ts` en upserts SQL idempotents, testé sur base
  vierge) ; `seed.ts` supprimé, scripts/CI basculés sur `go run ./cmd/seed`.
- **Module Go `collaborations`** (`apps/api/internal/modules/collaborations`) :
  `POST /v1/collaborations/invite-by-email`, `POST .../invite`,
  `POST /v1/collaborations/{requestId}/respond`, `POST .../withdraw`,
  `DELETE /v1/collaborations/{articleId}/contributors/{contributorId}`,
  `GET /v1/collaborations` (reçues + envoyées) — notifications SQL, gestion
  `_ArticleToUser`/`ArticleAttribution` en transaction. Tests d'intégration
  (invitation, refus consentement, acceptation, retrait, RBAC).
- `apps/studio` `advanced/actions.ts` : 6 actions Go-first (inviter par email,
  répondre, inviter contributeur, retirer, retirer son consentement, lister),
  `getAuthenticatedUser` sans Prisma (le check `dbUser` reste dans le fallback),
  fallback Prisma dev conservé.
- **Module Go `devtools`** (`apps/api/internal/modules/devtools`) :
  `GET /v1/devtools/data` — utilisateurs (avec publication personnelle :
  subdomain/customDomain/accentColor/layoutStyle) + compteurs
  (users/articles/posts/likes/subscribers), **réservé superadmin** (403 sinon).
  Tests d'intégration (stats, tri DESC, shape, refus creator/inconnu).
- `apps/studio` `onboarding/page.tsx` : Go-first via `GET /v1/users/me`
  (`hasCompletedOnboarding` || `publicationId` → redirect), fallback Prisma
  dev conservé (le wizard était déjà 100 % Go).
- `apps/studio` `features/devtools/actions.ts` + `app/layout.tsx` :
  `getDevtoolsData` Go-first (`/v1/devtools/data`), fallback Prisma dev
  seulement si `QOE_API_URL` absent. Les actions d'écriture du panneau
  (createMockUser, seedFullDatabase, simulate*, impersonateLogin…) restent
  dans `@qoe/db/devtools` (outillage dev).

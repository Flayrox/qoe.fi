# Tests et bases de donnees

## Principe d'isolement

La base de developpement existante n'est jamais une base de test.

- Supabase dev : port `54322`, base `postgres`
- Postgres dev Docker : port `5433`, base `qoe`
- Postgres test persistant : port `55432`, base `qoe_test`
- Tests Go par defaut : conteneur ephemere Testcontainers

Les fixtures d'integration utilisent `TRUNCATE`. Pour cette raison,
`TEST_DATABASE_URL` est refusee si le nom de base ne se termine pas par `_test`.

## Tests Go sans toucher a la base dev

Avec Docker lance, le chemin recommande est le conteneur ephemere :

```bash
cd apps/api
go test ./...
```

Aucune variable `DATABASE_URL` de la base dev n'est utilisee par les tests Go
sauf si elle est recopiee explicitement dans `TEST_DATABASE_URL`, ce qui est
bloque par la validation du suffixe `_test`.

## Base de test persistante locale

Elle utilise un Compose et un volume distincts :

```bash
pnpm test:db:up
pnpm test:db:migrate
pnpm test:db:status
TEST_DATABASE_URL="postgresql://qoe:qoe@127.0.0.1:55432/qoe_test?sslmode=disable" pnpm test:db
```

`pnpm test:db` force `go test -p 1` afin que les fixtures des packages ne
s'executent pas en parallele sur la meme base partagee.

Pour arreter les conteneurs sans supprimer les donnees :

```bash
pnpm exec bash scripts/test-db.sh down
```

Pour reinitialiser uniquement la base de test :

```bash
pnpm test:db:reset
```

La commande demande `RESET-TEST` et ne touche qu'au volume
`qoefi-test-postgres-data`.

## Migrations destructives

`qoe-migrate down` et `qoe-migrate down-to` sont refuses sans
`--allow-destructive`. Meme avec cette option, ils refusent toute base dont le
nom ne se termine pas par `_test`.

Le reset historique `scripts/seed-docker.sh --reset` est donc limite aux bases
`*_test`. Il ne peut plus supprimer la base dev `qoe`.

## CI

La CI utilise des services Postgres/Testcontainers ephemeres. Elle ne doit
jamais recevoir les secrets ou URLs de la base dev. Les tests destructifs et
les fixtures sont limites a l'environnement de test du job.

## Suites Go P3 (workers et securite)

Deux fichiers completent les contrats P0-P2 :

- `apps/api/internal/workers/p3_retry_notifications_test.go` : retries
  webhook (backoff, echec permanent), fanout notifications media, dedup.
- `apps/api/cmd/server/p3_security_test.go` : campagne de securite au
  niveau routeur — isolation tenant, RBAC (lecteur/createur/admin/
  superadmin), portee API keys, uploads dedoublonnes, payloads limites,
  CORS wildcard, JWT a algorythmes inattendus.

```bash
cd apps/api && go test ./internal/workers ./cmd/server
```

## E2E Playwright P3

Deux configs coexistent :

- `playwright.config.ts` (job CI `e2e`) : projets `public-web`,
  `core-journeys`, `security`, `annotations` + suite `chromium` authentifiee.
- `playwright.apps.config.ts` (job CI `e2e-apps`) : tenants/studio/admin
  contre l'API Go reelle + base seedee. Les gates auth (redirection
  `/login`) tournent en CI ; les parcours authentifies complets demandent
  `RUN_FULL_STACK=1` + Supabase local, ils restent locaux.

Run local complet (base de test isolee, jamais la dev) :

```bash
pnpm test:db:up && pnpm test:db:migrate
cd apps/api
DATABASE_URL='postgresql://qoe:qoe@127.0.0.1:55432/qoe_test?sslmode=disable' \
  go run ./cmd/seed
```

Puis, depuis la racine (port API dedie pour ne pas entrer en conflit avec
le serveur dev sur 8090) :

```bash
export SUPABASE_JWT_SECRET="$(grep '^SUPABASE_JWT_SECRET=' apps/api/.env | cut -d= -f2-)"
PLAYWRIGHT_GO_API_PORT=8091 QOE_API_URL=http://localhost:8091 \
DATABASE_URL='postgresql://qoe:qoe@127.0.0.1:55432/qoe_test?sslmode=disable' \
RUN_FULL_STACK=1 pnpm exec playwright test --config playwright.apps.config.ts
```

Les fixtures E2E (`e2e/lib/db.ts`) insèrent des users dont l'id est UUID
(schema goose) : utiliser des UUID deterministes comme JWT sub.

### Quirk macOS local (firewall applicatif)

Sur certaines machines macOS, le firewall applicatif ou un filtre reseau
tiers refuse les connexions navigateur (Chromium) vers certaines instances
`next dev`, alors que curl passe. Symptome : `ERR_CONNECTION_REFUSED`
sur 3020/3030 pendant que 3001/8091 repondent. En CI (ubuntu) ce probleme
n'existe pas. Localement, autoriser node dans
`System Settings > Network > Firewall` ou desactiver le filtre tiers le
temps du run.

## E2E Core — confidentialité des likes

`e2e/like-privacy.spec.ts` couvre le parcours réel de bout en bout :

1. création d'un compte GoTrue de test ;
2. ouverture de `/settings/privacy` dans Core ;
3. passage de « Visibilité de mes likes » à `PRIVATE` ;
4. like d'une pensée via le bouton réel de l'interface ;
5. vérification du compteur et de l'état `liked` via l'API Go ;
6. vérification que l'identité n'est pas renvoyée par `/likes` ni par le profil public.

La fixture crée son auteur, sa publication et sa pensée cible dans la base
`*_test`. Elle ne dépend donc pas du seed de contenu et ne touche jamais la
base de développement. La service-role Supabase est utilisée uniquement par le
runner Node pour confirmer puis supprimer le compte GoTrue de test ; elle n'est
jamais injectée dans le navigateur ni dans Core.

Pré-requis : Docker, Supabase local, `qoe_test` migrée et les secrets locaux
dans `apps/api/.env`. Depuis la racine :

```bash
pnpm test:db:up && pnpm test:db:migrate
DATABASE_URL='postgresql://qoe:qoe@127.0.0.1:55432/qoe_test?sslmode=disable' \\
API_DATABASE_URL='postgresql://qoe:qoe@127.0.0.1:55432/qoe_test?sslmode=disable' \\
pnpm exec playwright test --project=like-privacy e2e/like-privacy.spec.ts
```

La configuration Playwright charge automatiquement les paramètres Supabase
locaux et démarre l'API Go/Core sur des ports dédiés. Le workflow CI général
ne sélectionne pas ce projet tant qu'aucun service GoTrue de test n'est fourni ;
une campagne CI qui l'active doit fournir un Supabase de test réel et ses clés
éphémères, jamais les secrets de développement.

## Couverture TypeScript

Gate unique racine, packages critiques uniquement (sdk, auth,
utils, flags) avec seuils progressifs par package :

```bash
pnpm test:coverage
```

La config vit dans `vitest.coverage.config.ts`. Seuils mesures a
l'introduction du gate (2026-08) : sdk 23%, auth 15%, utils 44%,
flags 65% (lines/statements). Une baisse doit s'accompagner de nouveaux
tests, pas d'un seuil abaisse. Objectif final : 80% sur le code metier.

Cote Go, le gate par module vit dans `.github/workflows/ci.yml`
(articles, webhooks, settings, posts, search, workers).

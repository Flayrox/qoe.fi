# 🧭 Sunset de `apps/api` (api-legacy.qoe.fi) — TERMINÉ ✅

> **Statut : sunset complet.** Le backend Hono (`apps/api`) a été supprimé du
> monorepo. Le backend Go (`apps/api-go`) est l'unique backend de la plateforme.
>
> **Date** : 15 août 2026 (commit « sunset api-legacy »).
>
> - `api.qoe.fi` → Go (`api:8080`, service compose `qoefi-api`) — seul point d'entrée API.
> - `api-legacy.qoe.fi` → **supprimé** (bloc Caddy retiré).
> - `apps/api` → **supprimé** du dépôt.
> - Le client universel (`@qoe/api-client` `QoeApiClient`, mobile) pointe vers le
>   Go : baseUrl par défaut `http://localhost:8080` en dev, `api.qoe.fi` en prod.

---

## Ce qui a été fait (récapitulatif de la migration)

| Endpoint Hono (`apps/api`)                          | Équivalent Go final (`apps/api-go`)                                | Statut  |
| --------------------------------------------------- | ------------------------------------------------------------------ | ------- |
| `GET /health`                                       | `GET /health` + `/healthz`                                         | ✅ Go   |
| `POST /webhooks/stripe`                             | `POST /v1/webhooks/stripe` (asynq, signature HMAC vérifiée)        | ✅ Go   |
| `POST /webhooks/supabase`                           | `POST /v1/webhooks/supabase`                                       | ✅ Go   |
| `GET /v1/articles`                                  | `GET /v1/articles` (JWT ou clé API, enveloppe + pagination `page`) | ✅ Go   |
| `GET /v1/articles/:slug`                            | `GET /v1/articles/{slug}` (public + mode créateur clé API)         | ✅ Go   |
| `GET /v1/categories`                                | `GET /v1/categories` (clé API)                                     | ✅ Go   |
| `GET /v1/analytics/stats`                           | `GET /v1/analytics/stats` (clé API, proxy Umami)                   | ✅ Go   |
| `GET /v1/feed`                                      | `GET /v1/feed` + `/v1/feed/trending`                               | ✅ Go   |
| `POST /v1/thoughts{/like,/repost,/bookmark}`        | `/v1/posts` (+ like/repost/bookmark)                               | ✅ Go   |
| `GET /v1/users/me`, `/users/:username`, `/follow`   | `GET /v1/users/me`, `/v1/users/{username}`, `/v1/users/{id}/follow` | ✅ Go |
| `GET /search/articles` (Meilisearch)                | `GET /search/articles` (module `search`, Meilisearch, limit 10)    | ✅ Go   |

**Toutes les routes Hono ont un équivalent Go.** Aucun endpoint n'a été perdu.

---

## Détails de la bascule (ordre d'exécution)

1. **`GET /search/articles` recréé en Go** (`internal/modules/search`) — c'était
   la seule route manquante, et elle était **consommée** par le CommandMenu
   (`packages/ui/src/cmdk/CommandMenu.tsx` → `URLS.API/search/articles`).
   Parité stricte : `{ hits, estimatedTotalHits }`, limit 10, `q` vide → hits `[]`.
   Mini-interface `Searcher` (mockable) + 3 tests unitaires
   (`handler_test.go` : q vide, hits, erreur Meili → 500).
2. **Client universel & URLs** : `client.ts` baseUrl défaut → `:8080` (Go) ;
   `packages/config` `apiPort` → `:8080` ; `Caddyfile.dev` `api.localhost` →
   `localhost:8080`.
3. **Suppression du code** : `git rm -r apps/api` (20 fichiers, tests inclus).
4. **Nettoyage infra** :
   - `docker-compose.yml` : service `api` supprimé + `depends_on` Caddy nettoyé
   - `docker-compose.dev.yml` : service `api` (HMR) + volume mount supprimés
   - `docker/caddy/Caddyfile` : bloc `api-legacy.qoe.fi` supprimé + `@custom` nettoyé
   - `Dockerfile` : cible `api` supprimée (commentaire build → `api-go`)
   - `packages/config/src/tenant.ts` : `api-legacy.qoe.fi` retiré de `SYSTEM_DOMAINS`
   - `scripts/copy-env.js` : `'api'` retiré de la liste des apps
   - `.github/workflows/ci.yml` : étape « Run API Coverage Gate (apps/api) » retirée
   - `package.json` : scripts `dev:api`, `docker:dev:api`, `docker:prod:api`,
     `docker:prod:logs:api` et filtres `--filter=@qoe/api...` supprimés
5. **Docs** : ce fichier (état final), ARCHITECTURE, README, ACTIVATION, MIGRATION
   et VISION_CREATORS_API mis à jour.

---

## Conséquences à connaître

- **Stripe** : le webhook doit pointer vers `https://api.qoe.fi/v1/webhooks/stripe`
  (le Go vérifie `Stripe-Signature`). ⚠️ Vérifier la config dans le dashboard Stripe
  si un ancien endpoint `api-legacy.qoe.fi` y était enregistré.
- **Supabase** : `POST /v1/webhooks/supabase` côté Go (stub acceptant 200).
- **Mobile (à venir)** : le client universel `@qoe/api-client` (`QoeApiClient`)
  cible le Go (`/v1/posts`, `/v1/feed`, `/v1/users…`) — prêt pour Expo/React
  Native, aucun endpoint Hono n'est nécessaire.
- **Rollback** : l'ancien déploiement Hono reste dans l'historique git
  (`git revert` sur le commit de suppression) — aucune donnée perdue.

---

## Vérifications effectuées

- `pnpm typecheck` : 20/20 ✅ (le workspace `@qoe/api` a disparu du monorepo)
- `pnpm lint` : ✅
- `go build ./... && go vet ./... && go test ./...` (api-go) : ✅
  — dont les nouveaux tests du module `search`
- `docker compose -f docker-compose.yml config -q` et `docker-compose.dev.yml` : ✅
- Aucune référence `@qoe/api` ou `api-legacy` résiduelle dans `apps/` et `packages/` ✅

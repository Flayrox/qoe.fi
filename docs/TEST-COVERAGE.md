# Couverture de test — état mesuré et règles

> Ce fichier est la référence de la couverture. Les chiffres sont **mesurés**, pas estimés.
> Dernière mesure : 2026-11-13, branche `main`.

## 1. Comment mesurer

| Suite                         | Commande                                                   | Ce qu'elle couvre                                                                                               |
| ----------------------------- | ---------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Unitaires / intégration TS    | `pnpm test`                                                | 22 packages/apps (vitest), ~245 fichiers de test                                                                |
| Couverture TS agrégée         | `pnpm test:coverage`                                       | `packages/{sdk,auth,utils,flags,moderation}`, `apps/core`, `apps/mobile` (`.ts` **et** `.tsx`) → `coverage/ts/` |
| E2E Playwright (site lecteur) | `pnpm e2e --project=routes --project=hydration`            | matrice de routes + garde d'hydratation                                                                         |
| E2E Playwright (tout)         | `pnpm e2e`                                                 | 120 tests, config principale                                                                                    |
| E2E apps secondaires          | `pnpm exec playwright test -c playwright.apps.config.ts`   | tenants / studio / admin, 19 tests                                                                              |
| Go                            | `pnpm test:api` (ou `cd apps/api && go test -cover ./...`) | 83 packages ; les tests Testcontainers exigent Docker                                                           |

⚠️ Sans Docker en local, les tests Go adossés à Testcontainers **skippent**
(`internal/adminauthz` échoue, `flags`/`newsletters`/`tracking` mesurent 0 %). Leur
couverture réelle ne se lit qu'en CI.

## 2. Baseline TS (après ajout des `.tsx` à la mesure)

`pnpm test:coverage` → **700 tests / 80 fichiers**, seuils par package respectés.

| Périmètre                        | Lignes      | Branches    | Fonctions   |
| -------------------------------- | ----------- | ----------- | ----------- |
| **Total mesuré**                 | **24,15 %** | **21,15 %** | **19,45 %** |
| `packages/sdk/src`               | 85,02 %     | 74,56 %     | 87,50 %     |
| `apps/core/src/lib`              | 64,41 %     | 72,58 %     | 63,21 %     |
| `packages/auth/src`              | 42,80 %     | 31,81 %     | 42,00 %     |
| `apps/core/src/app` (routes/SSR) | 0 %         | 0 %         | 0 %         |

Le total est passé de 40,58 % à 24,15 % **non pas parce que le code a régressé**, mais
parce que `.tsx` est enfin mesuré : toute la couche React (composants de `apps/core`,
`apps/mobile`, `packages/*`) était hors du périmètre. C'était un angle mort, pas une
couverture.

Deux fichiers ne sont pas instrumentables par `@vitest/coverage-v8` (erreur de parse,
exclus du rapport) : `apps/core/src/components/messages/MessagesApp.tsx` et
`apps/core/src/app/(reader)/library/LibraryClient.tsx`.

## 3. Baseline Go

`cd apps/api && go test -cover ./...` : 82 packages mesurés, **moyenne 38,3 %** (non pondérée).

| Très couverts                                                                                                                         | À 0 %                                                                                                                                                       |
| ------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `shared/identifier`, `modules/billing`, `eligibility`, `config` : 100 % · `cache` 95,8 % · `observability` 93,5 % · `antispam` 92,2 % | `flags`*, `modules/newsletters`, `modules/tracking`, `modules/appeals`, `modules/support`, `modules/collaborations`, `internal/database` (sqlc), `cmd/seed` |

\* tests présents mais skippés sans Testcontainers.

## 4. Couverture des pages (e2e)

`e2e/routes.spec.ts` (projet Playwright `routes`) couvre **chaque page** découverte sur le
disque et échoue si une page n'est ni visitée ni exemptée. Exécuté par le job
**`e2e-routes`** de `.github/workflows/ci.yml` (15 min de budget). 65 tests au total :

| Volet | Tests exécutés                     | Contrat                                                                                                                                           |
| ----- | ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Core  | 22 cas + 1 garde d'inventaire      | rendu réel ou redirection d'auth : jamais 5xx, jamais l'error boundary, jamais d'erreur d'hydratation                                             |
| Admin | 39 pages + 2 gardes + 1 navigation | réponse 307 avec `Location: …/login?redirect=…` pour un anonyme (jamais 200, 404 ou 5xx) ; la navigation prouve que la cible se rend et s'hydrate |

**Runs de référence** (job `E2E Routes (core + console admin)`, tous verts) :

- CI `43494477019` sur `0d00f769` — 5,3 min, 69 tests, 0 skipped.
- CI `43500804885` sur `59e6d97b` — 69 tests, 0 skipped, log nominatif :
  38 lignes `redirige /admin/… vers le login` + la racine = **39 écrans admin
  exécutés**, plus les 22 cas core et les gardes.
- CI `43514596938` sur `76abc0a0` — 4,5 min, 69 tests, 0 skipped, 39 écrans
  nommés, 0 échec, après correction du 500 de `/admin/imports/[id]`.

Le log du job liste chaque cas (`--reporter=list`) : les 39 écrans admin sont nommés
un par un, pas seulement comptés.

- 30 pages core : 21 patterns visités + 9 exemptions motivées dans `CORE_EXEMPT`.
- Bug réel trouvé par cette matrice : `/admin/imports/[id]` lisait `params` en
  synchrone alors que Next 16 le fournit en Promise (`params.id === undefined`) →
  **500** au lieu d'une redirection. Corrigé (les pages voisines faisaient déjà
  `await params`).
- 39 pages admin : `apps/admin` n'a **pas** de page `/login` ; le layout `(admin)/admin`
  redirige vers `http://lvh.me:3010/login?redirect=…`. Le contrat est vérifié au niveau
  HTTP (`maxRedirects: 0` → statut + en-tête `Location`), pas en ouvrant 39 navigateurs :
  le layout redirige avant tout rendu, et charger 39 fois la page de login faisait
  dépasser le timeout du job CI (step annulé à 20 min). Durée locale : ~22 s.
- Pages restantes à brancher : `apps/studio` (24), `apps/tenants` (16), `apps/hi` (4) —
  le même inventaire s'y applique (`discoverPages('studio')`, etc.).

### Variables d'environnement du projet `routes`

| Variable                   | Rôle                                                 | Sans elle                                                                              |
| -------------------------- | ---------------------------------------------------- | -------------------------------------------------------------------------------------- |
| `PLAYWRIGHT_TEST_BASE_URL` | URL du site lecteur (défaut `http://localhost:3010`) | —                                                                                      |
| `PLAYWRIGHT_ADMIN_URL`     | URL de la console (`http://admin.lvh.me:15405`)      | défaut = cette valeur en local ; **en CI le test échoue** (`CI=true` sans la variable) |

Le volet admin dépend du site lecteur pour la cible de redirection (test de navigation
final) : la CI démarre les deux `webServer` de `playwright.config.ts` (core 3010, console 15405) et `lvh.me` résout vers `127.0.0.1`. Le job E2E monte aussi un `redis:7-alpine` :
sans lui, l'API Go retente `localhost:6379` à chaque requête et les parcours de lecture
dépassent leurs timeouts.

### Lancer la matrice admin en local

```bash
# 1. API Go + site lecteur + console (3 terminaux)
cd apps/api && go run ./cmd/server            # :15407
export QOE_API_URL=http://localhost:15407
(cd apps/core  && PORT=3010 HOSTNAME=127.0.0.1 pnpm exec next dev)
(cd apps/admin && PORT=15405 HOSTNAME=127.0.0.1 pnpm exec next dev)

# 2. Matrice
PLAYWRIGHT_ADMIN_URL=http://admin.lvh.me:15405 pnpm e2e --project=routes --grep "admin"
```

⚠️ **Si la console reste bloquée sur `○ Compiling /admin …` à 0 % de CPU** (aucune
réponse, `curl` en timeout) : c'est le cache Turbopack laissé par un `next dev`
interrompu. Le fichier `apps/admin/.next/dev/lock` contient alors un PID mort. Preuve
mesurée le 13/11 : serveur à 0,0 % CPU pendant 120 s, `sample` montrant tous les threads
en attente ; après suppression, la même requête répond en 11,8 s.

```bash
rm -rf apps/admin/.next && (cd apps/admin && PORT=15405 HOSTNAME=127.0.0.1 pnpm exec next dev)
```

### Ajouter une page

1. La page apparaît sur le disque (`apps/core/src/app/.../page.tsx`).
2. Le test `inventaire : aucune page core sans test` échoue avec la liste des pages
   orphelines.
3. Soit tu ajoutes un cas dans `CORE_CASES`, soit une exemption **motivée** dans
   `CORE_EXEMPT` (pourquoi elle n'est pas atteignable + où elle est couverte ailleurs).

C'est la règle qui garantit « 100 % des pages portent un test » : impossible d'ajouter
une route sans décision explicite.

## 5. Ce qui reste (par ordre de rentabilité)

0. ~~**5 échecs du job `e2e`** (parcours de lecture)~~ — traités. Ce chemin a livré cinq
   vrais bugs applicatifs, tous corrigés : absence de Redis dans le job E2E ;
   `pushState` sur une URL absolue (port 15402) → `SecurityError` (`sameOriginPath`) ;
   **`/article/[slug]` toujours en 404** : `permanentRedirect` était appelé *dans* le
   `try`, son exception de contrôle (NEXT_REDIRECT) était donc attrapée par le `catch`
   voisin → `notFound()` systématique, même pour un article publié ; et trois sélecteurs
   qui décrivaient un DOM inexistant (bouton « Lire l'article » d'un `ArticleRow` plus
   rendu → l'affordance réelle est `[data-article-cover]` ; onglet Explorer pris pour un
   `button` alors que les tabs sont des `role=tab` ; titre de carte cherché en `h3` alors
   qu'il est en `h2`). Les deux `test.skip` conditionnels (article premium hors
   classement, donnée absente) sont remplacés par des attentes déterministes : cibles
   identifiées en base puis retrouvées dans le DOM par `article[data-overlay-anchor]`, ou
   `expect.poll` sur les titres réellement rendus. Run vertical : CI `43520531800`
   sur `3cc696c1`, job `E2E (Playwright)` 23 passed / 0 failed (1 flaky sur
   `public-feed-capture`, budget relevé depuis) et 2 skipped — les 2 cas de
   `oauth-consent`, sautés en bloc faute de Supabase local. Ce projet est donc
   retiré de la commande du job (il reste exécuté en local avec Supabase) et le
   job passe en `--reporter=list` pour nommer chaque cas, comme `e2e-routes`.
   Nota local : le projet `security` exige Redis (`REDIS_URL`) ; sans lui l'API
   Go répond 503 sur `/v1/me`. Docker étant proscrit sur le poste, la preuve
   locale porte sur `--project=public-web --project=core-journeys`.
1. **Contrat d'API** : énumérer les routes Go (`chi.Walk`) et échouer si une route n'est
   ni testée ni exemptée (équivalent de la matrice de routes, côté backend).
2. **Matrices studio / tenants / hi** : brancher `routes.spec.ts` dans
   `playwright.apps.config.ts` (les serveurs y sont déjà démarrés).
3. **Ratchets par package** : seuil = mesure actuelle, +5 points par lot, jamais de baisse.
   Aujourd'hui seuls 7 périmètres ont un seuil.
4. **Comblement des 0 % Go** : newsletters, tracking, appeals, support, collaborations.
5. **`packages/ui`** : 204 sources, 82 fichiers de test, toujours hors périmètre mesuré
   (config vitest dédiée en jsdom) — à mesurer via son propre `--coverage`.

## 6. Cible

100 % de lignes partout n'est pas atteignable sur du SSR/edge et du code généré
(`internal/database`, `vendor/onlook`). La cible utile :

- **100 % des pages visitées** (matrice de routes) ;
- **100 % des endpoints contractés** (étape 1 ci-dessus) ;
- **90-95 % sur la logique métier** (lib/, modules Go, packages partagés) ;
- 0 régression silencieuse : les seuils ne descendent jamais.

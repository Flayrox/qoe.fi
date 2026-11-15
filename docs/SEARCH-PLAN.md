# Recherche & découverte — plan vivant

> **Ce fichier est la mémoire du chantier.** À chaque reprise, le lire en entier
> avant de coder. Il dit ce qui est mesuré, ce qui est fait, ce qui reste et
> comment vérifier.
>
> Territoire : API Go `internal/modules/search`, SDK `actions/search` + hooks,
> écran lecteur `apps/core/src/components/social/SearchFeed.tsx`, recherche
> tenant `apps/tenants/.../search/**`.
>
> Dernière mise à jour : 2026-11-15 · branche `dev` · base `9656d611`.

---

## 1. Objectif

Rendre la recherche réellement utilisable et cohérente sur les trois surfaces :

1. **Go** — respecter la limite demandée et paginer les articles **et les
   pensées** (curseur), au lieu de renvoyer toujours la première page.
2. **SDK web** — transmettre `limit`/`cursor`, exposer la recherche sémantique
   déjà présente côté Go (`/search/semantic`), et laisser les actions publiques
   accessibles aux lecteurs non connectés.
3. **Core** — afficher les résultats sémantiques et permettre de charger la
   suite des articles.
4. **Tenants** — filtrer les articles côté serveur (la page ne calcule plus le
   résultat dans le navigateur et n'envoie au client que les articles retenus).

Aucune migration de base n'est nécessaire. Aucun changement de schéma.

---

## 2. État mesuré au démarrage (2026-11-15)

| Élément | Constat vérifié | Fichier |
| --- | --- | --- |
| Limite articles | `SearchRequest{Limit: 10}` codé en dur ; le `limit` du SDK est ignoré | `apps/api/internal/modules/search/handler.go` |
| Pagination articles | Aucun `Offset`, aucun `nextCursor` ; seuls `hits` + `estimatedTotalHits` sortent | idem |
| Curseur pensées | `nextCursor` est toujours `null` (pas d'offset SQL) | `SearchThoughts` |
| Sémantique | `/search/semantic` existe et est testé côté Go, mais **0 appelant web** | `packages/sdk/src/actions/search`, `apps/core` |
| Actions publiques | `searchAllAction` passe par `safeAction` avec `requireAuth` par défaut → un lecteur anonyme reçoit `UNAUTHORIZED` | `packages/sdk/src/actions/utils/safe-action.ts` |
| Recherche tenant | La page sérialise tous les articles puis `TenantSearchClient` filtre dans un `useMemo` | `apps/tenants/.../search/page.tsx` + `TenantSearchClient.tsx` |
| Contrat Meilisearch | Le document indexé contient `id/title/content/slug/slugs/authorId/categoryId/publisherId/published/isPremium/seoTitle/seoDescription/createdAt/updatedAt` (pas de `readingTime` ni `imageUrl`) | `apps/api/internal/workers/search.go` |

Conséquence assumée : la recherche tenant reste alimentée par le bundle
`publisher.articles` (pas de requête Meilisearch pour rendre les métadonnées
image/temps de lecture). Le lot supprime le filtrage client et ne transmet que
les résultats utiles ; l'index pourra être enrichi dans un lot séparé.

---

## 3. Décisions techniques

- **Curseur = offset opaque** (chaîne décimale) pour les articles. Le client ne
  l'interprète pas : il le renvoie tel quel. `nextCursor` absent/null = fin.
- **Limite** : défaut 10, max 50, via `middleware.ClampLimit` (même contrat que
  les autres endpoints).
- **Compatibilité** : la réponse conserve `hits` et `estimatedTotalHits` et
  ajoute `nextCursor`. Un ancien client continue de fonctionner.
- **Pensées** : pagination SQL par offset, défaut 20 / max 50. La requête
  demande `limit + 1` lignes pour déduire `hasMore` sans `COUNT()`. `nextCursor`
  est un offset opaque, comme les articles.
- **Sémantique** : endpoint séparé, rendu dans un onglet dédié ; un 503
  (embedding non configuré) affiche un message explicite, pas une erreur
  générique.
- **Tenant** : le filtre devient une fonction pure côté serveur, testée ; le
  client synchronise `?q=` et `?category=` dans l'URL (debounce 300 ms) pour
  garder des résultats partageables et rechargeables.
- **Zéro-fuite** : les gardes existants (paywall, visibilité, blocage) ne sont
  pas touchés. Le curseur ne fait que décaler la fenêtre.
- **Actions publiques** : `requireAuth: false` pour `searchAllAction`,
  `searchArticlesPageAction`, `searchSemanticAction` — aucune donnée privée
  n'est servie, les gardes Go restent la source de vérité.

---

## 4. Bugs corrigés en chemin

| Bug | Correction |
| --- | --- |
| `limit` du SDK ignoré par le Go | `ClampLimit` + `SearchRequest.Limit` |
| Requête d'articles double-encodée (`encodeURIComponent` puis `URLSearchParams`) | `q` brut passé à `URLSearchParams` pour les articles |
| Recherche impossible pour un lecteur anonyme (`requireAuth` par défaut) | Actions de recherche en `requireAuth: false` |
| « Aucun résultat » affiché sur la somme des onglets, même si l'onglet courant avait des résultats | `hasResultsForTab`, décision par onglet |
| Tenant : tous les articles sérialisés puis filtrés dans le navigateur | Filtre serveur `filterTenantArticles`, seuls les résultats partent au client |
| Une réponse serveur tenant pouvait écraser une frappe plus récente | Resynchronisation conditionnelle via `previousServerQuery` |
| Onglet Articles : première page chargée deux fois (recherche combinée + requête infinie) | `skipThoughts`/`skipArticles` dans l'action, clés de cache distinctes |
| « Charger plus » disparaissait quand une page filtrée revenait vide | Bouton rendu hors du bloc `articles.length > 0`, « aucun résultat » suspendu tant qu'une page reste |
| Pensées : `nextCursor` toujours `null` | `OFFSET` SQL + curseur handler + requête infinie dédiée |

## 5. Lots

### Lot 1 — Go : limite et pagination réelles (fait)

- [x] `limit` lu et borné (10/50) sur `GET /search/articles`.
- [x] `cursor` (offset) validé ; curseur négatif/non numérique → 400.
- [x] `SearchRequest{Offset, Limit}` transmis à Meilisearch.
- [x] `nextCursor` calculé à partir de `estimatedTotalHits` et du nombre de
      hits réellement consommés (après filtrage de visibilité).
- [x] Tests unitaires : limite par défaut, borne haute, offset, curseur
      suivant, curseur invalide.

### Lot 2 — SDK : contrats et hooks (fait)

- [x] `searchAllAction` transporte `cursor` et renvoie `articlesNextCursor`.
- [x] `searchArticlesPageAction` (page d'articles seule) pour le « charger plus ».
- [x] `searchSemanticAction` + type `SearchSemanticHit`.
- [x] Actions de recherche publiques (`requireAuth: false`).
- [x] `useInfiniteArticlesQuery` et `useSemanticSearchQuery`.
- [x] `client.searchArticles(query, { limit, cursor })` côté mobile.

### Lot 3 — Core : sémantique et pagination (fait)

- [x] Onglet « Sémantique » avec score et état 503 explicite.
- [x] « Charger plus » sur l'onglet Articles (déduplication par id).
- [x] Message « aucun résultat » calculé par onglet (et non sur les trois
      listes à la fois).
- [x] Helper pur `search-results.ts` + test Vitest.

### Lot 4 — Tenants : recherche côté serveur (fait)

- [x] `filterTenantArticles` (requête multi-mots + catégorie) exécuté dans la
      page serveur.
- [x] Seuls les articles retenus sont sérialisés vers le client.
- [x] URL `?q=&category=` synchronisée (retour arrière/rechargement fiables).
- [x] Test Vitest du filtre.

### Lot 5 — Pensées paginées (fait)

- [x] `SearchThoughts` SQL : `OFFSET $3`, param `ReaderId` en `$4` (sqlc régénéré).
- [x] Service : `(hits, hasMore, error)`, `limit + 1` lignes, garde-fous.
- [x] Handler : `limit` 20/50, `cursor` validé, `nextCursor` en fin de page.
- [x] SDK : `searchThoughtsPageAction`, `useInfiniteThoughtsQuery`, clé `searchKeys.thoughts`.
- [x] Core : onglet Pensées alimenté par la requête infinie, « Charger plus de pensées ».

---

## 6. Vérification

```bash
cd apps/api && go test ./internal/modules/search/...
pnpm --filter @qoe/sdk test
pnpm --filter @qoe/core test
pnpm --filter @qoe/tenants test
pnpm --filter @qoe/sdk typecheck
pnpm --filter @qoe/core typecheck
pnpm --filter @qoe/tenants typecheck
```

Critère de done : les tests search Go passent, les suites sdk/core/tenants
passent, les trois typechecks passent, et `GET /search/articles?limit=25&cursor=25`
comme `GET /search/thoughts?limit=20&cursor=20` renvoient une page cohérente
avec un `nextCursor` (tests unitaires).

---

## 7. Journal (append-only)

| Date | Lot | Résultat mesuré | Commit |
| --- | --- | --- | --- |
| 2026-11-15 | Plan créé | écarts consignés (§2) | _(en cours)_ |
| 2026-11-15 | Lots 1–4 | `go test ./internal/modules/search/...` **ok** (0,7 s) ; `@qoe/sdk` **162 tests / 22 fichiers** ; `@qoe/core` **212 tests / 27 fichiers** ; `@qoe/tenants` **39 tests / 11 fichiers** ; typechecks sdk/core/tenants **0 erreur** | _(non commité)_ |
| 2026-11-15 | Index enrichi + tenant Meili | `imageUrl`/`readingTime` indexés, `ReindexAll` réécrit tous les documents, filtre `categoryId`, recherche tenant via `/search/articles` avec repli bundle. `go test` search + workers ciblés **ok** ; tenants typecheck **0 erreur** | _(ce commit)_ |
| 2026-11-15 | Revue + lot 5 | double chargement corrigé ; « Charger plus » visible sur page filtrée vide ; pensées paginées (SQL/service/handler/SDK/core). `go test -count=1` **ok** (tests DB skippés localement : Docker absent) ; `@qoe/sdk` **163 tests / 22 fichiers** ; `@qoe/core` **214 tests / 27 fichiers** ; `@qoe/tenants` **39 tests / 11 fichiers** ; typechecks **0 erreur** | _(non commité)_ |

---

## 8. Dettes explicites (hors périmètre)

- Mise en avant des extraits/highlights Meilisearch dans l'UI.
- Recherche fédérée multi-publications côté tenant (le filtre actuel reste
  limité à la publication).

# Audit Prisma au-delà de `apps/core` — cartographie des surfaces à porter en Go

> Complément de [`docs/PRISMA_AUDIT_100GO.md`](./PRISMA_AUDIT_100GO.md) (parcours lecteur dans `apps/core`, livré).
> Cet audit couvre **toutes les surfaces Prisma en dehors du chemin nominal de `apps/core`** : les appels
> indirects via `packages/db`, la couche d'actions `packages/api-client`, et les apps **studio** / **admin**.
>
> Date : août 2026 · Recensement : `grep -rn "prisma\." apps/studio/src apps/admin/src packages/api-client/src packages/db/src`

---

## 0. Résumé exécutif

| Surface | Réfs `prisma.` | Déjà Go ? | Verdict |
|---|---|---|---|
| `apps/core` chemin nominal | 0 direct, **0 indirect** | ✅ **100 % Go** (P0 livré `def99ca`/`d8839a9`) | — |
| `packages/api-client/src/actions` | 18 | ~80 % (7 dossiers sur 12 sans prisma) | **P1 — auth/tenant/dashboard/feed/articles/admin** |
| `apps/studio/src` | 158 | 5 fichiers seulement ont `goFetch` | **P2 — gros chantier créateur** |
| `apps/admin/src` | 36 | ~0 | **P3 — console superadmin** |
| `packages/db/src` (couche repo) | 396 | n/a (déjà consommée par le Go via sqlc) | fondation, pas une cible |

**À retenir :** le parcours lecteur nominal n'est pas tout à fait 100 % Go — il reste **3 appels
`packages/db` dans `home/page.tsx`** et **1 dans `article/[slug]/page.tsx`** qui ne sont PAS des fallbacks.
C'est le P0 de ce document.

---

## 1. ⚠️ Résidus réels au chemin nominal de `apps/core` (via `packages/db`)

L'audit précédent comptait les `prisma.` directs de `apps/core` ; il a raté les appels **indirects**
(imports de `@qoe/db/feed`, `@qoe/db/onboarding`, `@qoe/db/repositories/*` qui appellent Prisma en interne).

### 1.1 `home/page.tsx` — 3 appels packages/db hors bundle Go

```ts
// apps/core/src/app/(reader)/home/page.tsx
const [dbUser, onboardingData] = await Promise.all([
  user ? getRequestDbUser(user.id) : null,
  (await import('@qoe/db/onboarding')).getOnboardingData(),          // ⚠️ Prisma (l.107)
]);
...
const [vectorFeedPage, suggestedCreators, trends, promos] = await Promise.all([
  vectorFeedPagePromise,
  getSuggestedCreatorsByVector({ userId: user?.id, limit: 4 }),       // ⚠️ Prisma vectoriel (l.132)
  getSemanticTrendingTopics({ limit: 5 }),                            // ⚠️ Prisma (l.133)
  getCachedPromos(),                                                  // ✅ Go /v1/home/promos + fallback
]);
```

| Appel | Modèles touchés | Couverture Go actuelle |
|---|---|---|
| `getOnboardingData()` | `Publication` (créateurs certifiés), catégories par défaut | ❌ aucun endpoint — le bundle `/v1/home/feed` ne renvoie ni `onboardingCategories` ni `onboardingSuggestedCreators` |
| `getSuggestedCreatorsByVector` | `User` (embedding), `Follows`, `Article`, `Publication`, `Subscriber` — calcul vectoriel pgvector | ❌ aucun endpoint Go de créateurs suggérés par similarité |
| `getSemanticTrendingTopics` | `Category`, `Article` (croissance 7j vs 7j précédents) | ⚠️ `/v1/home/trends` existe mais lit la table `Trend` (hashtags), **pas** le calcul sémantique par catégories |

**Actions P0 :**
1. **Étendre le bundle `/v1/home/feed`** (ou créer `GET /v1/home/suggested-creators` + enrichir `GET /v1/home/trends`)
   pour couvrir ces 3 données : créateurs suggérés (requête vectorielle portée en Go avec `pgvector`),
   trends sémantiques (croissance par catégorie), onboarding data (créateurs certifiés + catégories).
2. Bascule `home/page.tsx` sur le Go (même pattern Go primaire / fallback Prisma), ce qui supprime
   les 3 imports `@qoe/db/feed` + `@qoe/db/onboarding` du chemin nominal.

### 1.2 `article/[slug]/page.tsx` — page article sur Prisma alors que Go a l'endpoint

```ts
// apps/core/src/app/(reader)/article/[slug]/page.tsx
import { findFirstBySlug } from '@qoe/db/repositories/articles';     // ⚠️ Prisma
const article = await findFirstBySlug(resolvedParams.slug);          // ×2 (metadata + page)
```

**L'endpoint Go existe déjà : `GET /v1/articles/{slug}`** (module `articles`, public).
Le `ArticleAnnotatorView` attend un article complet ; il faut mapper le DTO Go `ArticleWithDetails`
vers le type TS attendu (le mapping d'hydratation du feed existe déjà dans `vector-feed.ts`).

**Action P0 :** basculer `generateMetadata` + la page sur `goFetch('/v1/articles/{slug}')` avec
fallback Prisma dev — supprime l'import `@qoe/db/repositories/articles` du chemin nominal.

### 1.3 Autres résidus runtime de `apps/core` (hors fallbacks)

| Fichier | Appel | Endpoint Go ? | Priorité |
|---|---|---|---|
| `app/api/upload/route.ts` | `registerMediaAsset` (`@qoe/db/repositories/media`) | ❌ pas de module media Go | P2 |
| `app/(reader)/onboarding/actions.ts` | `completeOnboardingInDb` (`@qoe/db/onboarding`) | ❌ `/v1/settings/onboarding` est **créateur**, pas lecteur | P2 |
| `app/(reader)/billing/page.tsx` | `prisma.user` + `prisma.subscriber` directs | ❌ module Go billing = webhooks seuls | P3 (déjà identifié) |
| `app/login/actions.ts` | `getCurrentUserAction()` → `prisma.user` | ✅ `/v1/me` (déjà utilisé dans le même fichier pour le login) | P1 |
| `lib/cached-queries.ts` + `layout.tsx` + pages | tous les `prisma.` restants | ✅ / ⚠️ | tous **fallbacks dev** — OK |

> Le reste des `prisma.` de `apps/core` (home fallback, library, highlights, history, settings, layout,
> vector-feed) est **uniquement dans les branches `catch` de fallback dev** — le chemin nominal est Go.

---

## 2. `packages/api-client/src/actions` — 18 réf. prisma sur 12 dossiers

Recensement par dossier (fichiers avec `prisma` / total) :

| Dossier | prisma | État | Cible Go |
|---|---|---|---|
| `auth` | 1 | `getCurrentUserAction` → `prisma.user.findUnique` | ✅ **`GET /v1/me`** (mapping identique au `getRequestDbUser` déjà porté) |
| `tenant` | ~8 | `subscriber.upsert` (newsletter), bookmarks/highlights/wallet/posts via repos | ✅ **`POST /v1/home/subscribe`** (newsletter, publique) — bookmarks/highlights/posts déjà Go ; wallet reste Prisma (pas d'endpoint) |
| `dashboard` | 1 | `mediaMember.findUnique` (statut membre) | ✅ **`isMediaMember` dans `/v1/me`** + `GET /v1/me/media/{mediaId}` (résolution workspace média) |
| `feed` | 3 | `subscriber.findFirst` (isMember), `user.update` + `findUnique` (`updateProfileAction`) | ✅ `updateProfileAction` → `PATCH /v1/me/profile` ; `searchUsersAction` → `GET /v1/users/search` |
| `articles` | 2 | `mediaMember.findUnique`, `user.findMany` (recherche) | ✅ `/v1/users/search` branché — reste la recherche articles |
| `admin` | 1 | console superadmin (`prisma.user` + supabase admin) | ❌ surface admin, pas de Go |
| `highlights`, `notifications`, `polls`, `search`, `starterPacks`, `threadgates`, `utils` | 0 | déjà Go ✅ | — |

**Actions P1 (dans l'ordre) — toutes livrées (`e0b7a15`/`e0b7b09`) :**
1. ✅ `auth/getCurrentUserAction` → `GET /v1/me` (un seul endpoint, mapping trivial). Consommé par le login
   des 3 apps (core, studio, admin) — gros gain immédiat.
2. ✅ `feed/updateProfileAction` → `PATCH /v1/me/profile` (existe) + `PATCH /v1/settings/profile` créateur.
3. ✅ `articles` recherche → `GET /v1/users/search` (existe).
4. ✅ `tenant` : `POST /v1/home/subscribe` (newsletter, publique) côté Go, puis brancher.
5. ✅ `dashboard` statut membre → `isMediaMember` dans `/v1/me` + `GET /v1/me/media/{mediaId}`.
6. `admin` : à laisser en Prisma (console interne, pas de contrat mobile).

---

## 3. `apps/studio/src` — 158 réf. prisma (surface créateur)

Seulement **5 fichiers** utilisent déjà `goFetch`/`isGoEnabled` : `analytics/actions.ts`,
`developer/oauth/actions.ts`, `developer/webhooks/actions.ts`, `media/actions.ts`,
`lib/active-workspace.ts`. Le reste de la surface créateur est 100 % Prisma.

**Fichiers à porter (par module) :**

| Module | Fichiers | Modèles | Endpoint Go dispo |
|---|---|---|---|
| **Dashboard/accueil** | `(creator)/page.tsx`, `app-sidebar.tsx` | `Publication`, compteurs | ✅ `/v1/me`, `/v1/home/*` |
| **Analytics** | `analytics/actions.ts` | `user.groupBy`, `follows`, `article` | ✅ module Go `analytics` (product-metrics + audience/insights branchés, vérifié au navigateur) |
| **Media** | `media/actions.ts` + `media/page.tsx` | `MediaAsset` | ❌ à créer |
| **Import** | `import/actions.ts` | articles/attributions | ⚠️ `/v1/articles` POST existe |
| **Advanced** | `advanced/actions.ts` | ? | à cartographier |
| **Audience** | `audience/page.tsx` | `Subscriber` | ❌ à créer |
| **Développeur** | `developer/page.tsx`, `oauth/page.tsx`, `webhooks/actions.ts` | clés API, OAuth, webhooks | ✅ module Go `webhooks` + `oauth` complets |
| **Settings** | `settings/page.tsx` | `Publication`, `User` | ✅ `/v1/settings/*` |
| **Onboarding créateur** | `onboarding/page.tsx` | `Publication` count | ✅ `/v1/settings/onboarding` (créateur) |

**Actions P2 :** ~~analytics~~ ✅ (fait — le module Go `analytics` existe, `product-metrics` créé pour le
contrat `ProductMetrics` TS, `getAudienceInsights` branché ; vérifié au navigateur avec un vrai user
créateur + workspace média), puis **webhooks/oauth** (Go complet), puis **settings créateur**.

> 🔧 **Bug corrigé au passage** : `GET /v1/workspaces/active` (mode MEDIA) échouait toujours — la requête
> sélectionnait `m.role` (colonne inexistante sur `Media`) au lieu de `mm.role` (`MediaMember`). La résolution
> du workspace média retombait systématiquement sur la publication personnelle.

---

## 4. `apps/admin/src` — 36 réf. prisma (console superadmin)

Console interne réservée au superadmin : utilisateurs, publications, modération, CMS frontend.
Pas de contrat mobile, pas d'endpoint Go dédié. **Recommandation : laisser en Prisma** (surface
interne, faible trafic, risque/retour défavorable), sauf si l'équipe veut un port complet en P3.

---

## 5. `packages/db/src` — 396 réf. prisma (couche repository)

Ce n'est **pas une cible de port en soi** : c'est la fondation consommée par les fallbacks dev de
`apps/core`, par `apps/studio`/`apps/admin`, et par les actions `api-client` restantes. Le Go
interroge la même base via **sqlc**, pas via Prisma. Au fur et à mesure que les surfaces ci-dessus
basculent sur le Go, les repositories deviennent des **fallbacks** puis des candidats à la suppression.

Repositories par taille d'usage (ordres de grandeur) :
- `feed.ts` (getSuggestedCreatorsByVector, getSemanticTrendingTopics…) — cibles P0 de la §1.1
- `repositories/articles.ts`, `posts.ts`, `publications.ts`, `notifications.ts`, `media.ts`,
  `subscriptions.ts`, `wallet.ts` — consommés par studio/tenant/fallbacks
- `onboarding.ts` — cible P0 (home) + P2 (action lecteur)

---

## 6. Plan d'implémentation priorisé

| # | Surface | Effort | Dépend de |
|---|---|---|---|
| ~~P0-1~~ | ~~Home : suggested creators + semantic trends + onboarding data → Go~~ ✅ `GET /v1/home/onboarding` + `/v1/home/suggested-creators` + `/v1/home/semantic-trends` (`def99ca`) | M | — |
| ~~P0-2~~ | ~~`article/[slug]` → `GET /v1/articles/{slug}`~~ ✅ mode slug seul ajouté (`def99ca`), page basculée (`d8839a9`) | S | mapping DTO |
| ~~P1-1~~ | ~~`auth/getCurrentUserAction` → `/v1/me`~~ ✅ (`d8839a9`) | S | — |
| ~~P1-2~~ | ~~`feed/updateProfileAction` → `/v1/me/profile`~~ ✅ (`d8839a9`) ; ~~`articles` search → `/v1/users/search`~~ ✅ | S | — |
| ~~P1-3~~ | ~~`tenant` : `POST /v1/home/subscribe` + `isMediaMember` dans `/v1/me` + résolution workspace média~~ ✅ | M | — |
| ~~P2-1~~ | ~~Studio analytics → module Go existant~~ ✅ `GET /v1/analytics/product-metrics` (nouveau, contrat `ProductMetrics` TS) + `audience/insights` — vérifié au navigateur | M | — |
| **P2-2** | Studio webhooks/oauth → Go existant | S | — |
| **P2-3** | Studio media/import/audience → endpoints à créer | L | — |
| **P3** | Admin console, billing lecteur, exportAccountData | L | volontaire |

**Pattern de vérification (inchangé) :** Go primaire / fallback Prisma dev → test d'intégration Go
par endpoint → `tsc` + specs e2e existants (`public-feed-capture`, `connected-feed-capture`) →
recensement `grep -rn "prisma\."` sur la page portée pour confirmer la disparition du chemin nominal.

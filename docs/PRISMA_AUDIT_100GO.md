# Audit Prisma restant — parcours lecteur (apps/core) → 100% Go

*Date : 2026-08-23 — état après `55b2100` (profil lecteur, préférences, suppression de compte + pages secondaires en Go).*

## Résumé

Le parcours lecteur est **quasi intégralement Go** sur son chemin nominal : capture
(reading-session, feed-impression, show-less), widgets home (config/trends/promos),
**moteur + réhydratation du feed « Pour vous »**, **bundle complet de la page d'accueil**
(`GET /v1/home/feed` : Suivis, Explorer, Recommandé, bookmarks, compteurs, activité,
mots masqués, à la une) et **historique de lecture** (`GET /v1/me/reading-history`).

Les **P1 sont éliminés** : profil lecteur (`GET /v1/me`, `PATCH /v1/me/profile`),
préférences (`GET/PATCH /v1/settings/preferences`), demande de suppression
(`GET/POST/DELETE /v1/me/account-deletion-request`) et les pages bibliothèque,
surlignages, onboarding et login sont branchées sur le Go. Il reste **2 fichiers** avec
du prisma hors fallback dev : `settings/actions.ts` (uniquement `exportAccountDataAction`,
conservé volontairement) et `billing/page.tsx` (P3, aucun endpoint Go lecteur). Tous les
autres `prisma.` (home, history, library, highlights, onboarding, login, layout,
cached-queries, settings) sont dans des **fallbacks Prisma dev** — le chemin nominal est
100 % Go.

> ⚠️ Les 13 occurrences de `home/page.tsx` et l'occurrence de `history/page.tsx` sont
> uniquement dans les **fallbacks Prisma de dev** (chemin nominal 100 % Go) — elles sont
> volontairement conservées pour que l'app fonctionne sans `QOE_API_URL`.

## ✅ Ce qui est fait (chantiers récents)

| Commit | Chantier |
|---|---|
| `b325cd0` | `GET /v1/home/feed` (bundle home) + `home/page.tsx` 100 % Go (fallback Prisma dev) — **P0 éliminé** |
| `e64f2c3` | `GET /v1/me/reading-history` (dédup par article) + `history/page.tsx` + `reading-history/route.ts` |
| `e78c901` | e2e connecté : show-less écrit en base (vrai user Supabase) + Historique rendu via le Go |
| `ff94b5e` | `GET /v1/me` + `PATCH /v1/me/profile`, `GET/PATCH /v1/settings/preferences`, `GET/POST/DELETE /v1/me/account-deletion-request` + bookmarks/highlights enrichis |
| `5959234` | `cached-queries` (dbUser → `/v1/me`) + `settings/actions.ts` + `layout.tsx` branchés Go (fallback Prisma dev) |
| `55b2100` | library, highlights, onboarding, login → endpoints Go + e2e « page Réglages » au navigateur |

## Cartographie par fichier (état actuel)

| Fichier (apps/core/src) | Occ. | Modèles Prisma | Endpoint Go existant | Écart | Priorité |
|---|---|---|---|---|---|
| `app/(reader)/settings/actions.ts` | 16 | user, userSettings, notificationPreference, accountDeletionRequest, article, thought, bookmark, highlight, follows | `PATCH /v1/settings/profile`, `GET/PATCH /v1/notifications/preferences`, `POST /v1/settings/onboarding` | prefs lecteur (`userSettings`), suppression de compte, profil lecteur (`dbUser`) | **P1** |
| `lib/cached-queries.ts` | 8 | user, systemConfig, article, trend, partnerPromo | `GET /v1/home/config`, `GET /v1/home/trends`, `GET /v1/home/promos` | `dbUser` (profil lecteur) sans endpoint Go public | **P1** |
| `app/login/actions.ts` | 3 | user, follows, mutedWord | `GET /v1/users/me` (créateur, API scope) | profil lecteur + compteurs | P2 |
| `app/(reader)/billing/page.tsx` | 2 | subscriber, user | — (module billing = webhooks seuls) | **aucun endpoint lecteur** | P3 |
| `app/layout.tsx` | 1 | userSettings | — | prefs lecteur (même gap que settings) | P1 |
| `app/(reader)/onboarding/page.tsx` | 1 | user | `POST /v1/settings/onboarding` | profil lecteur | P2 |
| `app/(reader)/library/page.tsx` | 1 | bookmark | `GET /v1/bookmarks` | — (brancher) | P2 |
| `app/(reader)/highlights/page.tsx` | 1 | highlight | `GET /v1/me/highlights` (+ `/count`) | — (brancher) | P2 |
| `app/(reader)/home/page.tsx` | 13 | (fallback dev) | `GET /v1/home/feed` | — | dev only |
| `app/(reader)/history/page.tsx` | 1 | (fallback dev) | `GET /v1/me/reading-history` | — | dev only |

## Plan d'implémentation priorisé

### P1 — `settings/actions.ts` + `layout.tsx` ✅ (fait en `5959234`)

Server actions de réglages du lecteur + lecture des prefs dans le layout. Mapping :

1. **Profil** (`user.update`/reads) → `PATCH /v1/settings/profile` (existe).
2. **Notifications** (`notificationPreference`) → `GET/PATCH /v1/notifications/preferences` (existe).
3. **Onboarding** → `POST /v1/settings/onboarding` (existe).
4. **Reads annexes** (article/thought/bookmark/highlight/follows pour les compteurs de la
   page réglages) → endpoints existants (`/v1/bookmarks`, `/v1/me/highlights/count`,
   `/v1/feed` pour les suivis).
5. **À créer côté Go** (gaps réels) :
   - `GET/PATCH /v1/settings/preferences` → `userSettings` du lecteur (thème, affichage,
     langue…) — module `settings` Go.
   - `POST /v1/me/account-deletion-request` → `accountDeletionRequest` (requête de
     suppression, audit trail) — module `settings` ou `users` Go.
   - `GET /v1/me` → profil lecteur complet (id, email, username, name, role, prefs,
     compteurs follows/muted) pour remplacer `getRequestDbUser` (Prisma) — module
     `users` Go (le `/v1/users/me` actuel est créateur + API scope).

**Effort** : moyen (0,5–1 j Go + 0,5 j front). **Risque** : faible si on garde le pattern
« Go en primaire, fallback Prisma dev » éprouvé sur home/history.

### P1 — `cached-queries.ts` ✅ (fait en `5959234`)

1. `dbUser` → `GET /v1/me` (nouveau, cf. ci-dessus) — plus d'upsert d'email côté
   `getRequestDbUser` (le signup Supabase/GoTrue est la source de vérité).
2. `systemConfig` → `GET /v1/home/config` (existe, public).
3. `article` « à la une » → déjà dans `/v1/home/feed` (`featuredArticle`) — retirer le
   `findFirst` séparé.
4. `trend` → `GET /v1/home/trends` (existe). `partnerPromo` → `GET /v1/home/promos`
   (existe). **Ne garder le fallback Prisma qu'en dev** (déjà le cas).

**Effort** : faible (0,5 j).

### P2 — pages secondaires (brancher le front sur des endpoints existants)

| Page | Endpoint Go | Note |
|---|---|---|
| `library/page.tsx` | `GET /v1/bookmarks` | mapping → shape carte existante |
| `highlights/page.tsx` | `GET /v1/me/highlights` (+ `/count`) | idem |
| `onboarding/page.tsx` | `POST /v1/settings/onboarding` + `GET /v1/me` | la page écrit le profil + complète l'onboarding |
| `login/actions.ts` | `GET /v1/me` (+ compteurs follows/muted via `/v1/me`) | les 3 prisma tombent avec l'endpoint profil |

**Effort** : faible par page (0,25–0,5 j chacune).

### P3 — `billing/page.tsx` (vrai gap : aucun endpoint Go lecteur)

Le module billing Go ne gère que les webhooks Stripe/Supabase. La page lecteur lit
`subscriber` (abonnement courant) + `user` (wallet). Deux options :
- **Court terme** : garder Prisma sur cette page (isolée, peu critique).
- **Moyen terme** : ajouter `GET /v1/me/billing` (subscription + wallet + historique de
  facturation) dans le module billing Go.

**Effort** : moyen (0,5–1 j Go + 0,5 j front). **Non bloquant** pour le 100 % Go lecteur.

## Guide de vérification (pattern à répliquer)

1. **Go d'abord, fallback dev ensuite** : `goFetch<T>` en primaire, `try/catch` → fallback
   Prisma si `QOE_API_URL` absent (pattern `home/page.tsx`).
2. **Test d'intégration Go** sur chaque nouvel endpoint (testcontainers, comme
   `TestHomeFeed` / `TestReadingHistory` / `TestHydrate`).
3. **Vérif navigateur** : étendre `public-feed-capture.spec.ts` (anonyme) et
   `connected-feed-capture.spec.ts` (connecté, vrai user Supabase seedé).
4. **Vérif live** : rebuild + relance du `qoe-server` (launchd `com.qoefi.api-server`),
   curl sur la route, puis rendu dans l'app.

## Conclusion

- **Le chemin nominal du lecteur est déjà 100 % Go** (moteur, réhydratation, home,
  historique, capture). Les 14 occurrences home/history restantes sont des fallbacks dev.
- **Les P1 sont livrés** (`ff94b5e`, `5959234`, `55b2100`) : endpoints Go
  (`GET /v1/me`, `PATCH /v1/me/profile`, `GET/PATCH /v1/settings/preferences`,
  `GET/POST/DELETE /v1/me/account-deletion-request`) et branchement de
  cached-queries, settings, layout, library, highlights, onboarding, login.
- **`billing/page.tsx` est le seul vrai gap d'endpoint** (aucun Go lecteur) — P3,
  à laisser en Prisma ou à couvrir par un `GET /v1/me/billing`.
- **`exportAccountDataAction`** reste volontairement sur Prisma (action rare, volume
  complet) — à déporter si un endpoint `GET /v1/me/export` est demandé.

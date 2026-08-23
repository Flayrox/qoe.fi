# Audit Prisma restant — parcours lecteur (apps/core) → 100% Go

*Date : 2026-08-23 — état après `fc3f772` (moteur + réhydratation Go du feed « Pour vous »).*

## Résumé

Le parcours lecteur est déjà **très majoritairement Go** : la capture (reading-session,
feed-impression, show-less), les widgets home (systemConfig/trends/promos), le moteur du
feed « Pour vous » et sa réhydratation sont Go-only. Il reste **11 fichiers** dans
`apps/core/src` qui touchent encore `prisma.` (~49 occurrences), concentrés sur **deux
surfaces** : la page d'accueil lecteur (`home/page.tsx`, 13) et les actions de réglages
(`settings/actions.ts`, 16). Le reste est du « plomberie » de pages (bibliothèque,
historique, surlignages, onboarding, billing, login) dont **les endpoints Go existent déjà**
pour la plupart.

## Cartographie par fichier

| Fichier (apps/core/src) | Occurrences | Modèles Prisma | Endpoint Go existant | Priorité |
|---|---|---|---|---|
| `app/(reader)/home/page.tsx` | 13 | follows, publication, article, thought, bookmark, highlight, mutedWord | `/v1/feed` (following), `/v1/feed/trending`, `/v1/feed/personalized`+`/v1/feed/hydrate`, `/v1/bookmarks`, `/v1/me/highlights(+count)` | **P0** |
| `app/(reader)/settings/actions.ts` | 16 | user, userSettings, notificationPreference, accountDeletionRequest, article, thought, bookmark, highlight, follows | module `settings` Go (`/v1/settings/*`), mais pas toutes ces actions | **P1** |
| `lib/cached-queries.ts` | 8 | user, systemConfig, article, trend, partnerPromo | `/v1/home/config`, `/v1/home/trends`, `/v1/home/promos` (fallback prisma dev) | **P1** |
| `app/(reader)/history/page.tsx` + `api/reading-history/route.ts` | 2 | readingSession | analytics Go (créateur) ; pas d'endpoint « mon historique » lecteur | P2 |
| `app/(reader)/library/page.tsx` | 1 | bookmark | `GET /v1/bookmarks` | P2 |
| `app/(reader)/highlights/page.tsx` | 1 | highlight | `GET /v1/me/highlights` | P2 |
| `app/(reader)/onboarding/page.tsx` | 1 | user | users/settings Go | P2 |
| `app/(reader)/billing/page.tsx` | 2 | subscriber, user | module billing Go | P2 |
| `app/layout.tsx` | 1 | userSettings | `/v1/settings/*` | P2 |
| `app/login/actions.ts` | 3 | user, follows, mutedWord | auth + settings/posts Go | P2 |

## Détail P0 — `home/page.tsx` (le vrai chantier restant du lecteur)

La page d'accueil lecteur construit ses onglets (Suivis, Pour vous, Explorer) via Prisma :

1. `follows.findMany` → publications suivies du lecteur (déjà lisibles via `/v1/feed`).
2. `publication.findMany` → profils suivis pour la sidebar.
3. `article.findMany` ×3 → articles « suivis », « recommandés », « découverte ».
4. `thought.findMany` ×3 → pensées correspondantes.
5. `bookmark.findMany` ×2 + `highlight.count/findMany` → compteurs de la bibliothèque.
6. `mutedWord.findMany` → mots masqués (le moteur Go les lit déjà en base ; ici usage UI).

**Recommandation** : basculer les onglets sur les endpoints Go existants
(`/v1/feed` pour Suivis, moteur+hydrate pour Pour vous, `/v1/bookmarks` +
`/v1/me/highlights/count` pour les compteurs). Le module home Go peut exposer un
`GET /v1/home/feed?tab=following|discover` pour regrouper (publications suivies +
articles/pensées) en une requête. Effort : moyen (1–2 jours), risque UI faible car les
shapes (FeedSlice, HydrateArticle) sont déjà consommés ailleurs.

## Détail P1 — `settings/actions.ts`

Server actions de réglages du lecteur : profil (`user`), préférences (`userSettings`),
notifications (`notificationPreference`), suppression de compte
(`accountDeletionRequest`) + quelques reads (article/thought/bookmark/highlight/follows).
Le module Go `settings` couvre déjà `/v1/settings/*` (sous-domaine, profil créateur) ;
reste à exposer les endpoints lecteur (prefs + notifications + suppression de compte).
Effort : moyen.

## Détail P1 — `cached-queries.ts`

`dbUser` (findUnique + upsert d'email), article « à la une », et fallbacks dev pour
systemConfig/trends/promos (déjà Go, fallback prisma si QOE_API_URL absent). Effort :
faible ; ne garder le fallback prisma qu'en dev.

## Conclusion

- **~90 % du parcours lecteur est déjà Go** (lecture, impressions, show-less, widgets
  home, moteur + réhydratation du feed « Pour vous »).
- **Le gros morceau restant est `home/page.tsx`** (onglets Suivis/Explorer + compteurs),
  suivi de `settings/actions.ts`.
- Beaucoup de pages secondaires (bibliothèque, surlignages, historique, onboarding,
  billing) ont déjà leur endpoint Go ; il ne reste qu'à **brancher le frontend dessus**.

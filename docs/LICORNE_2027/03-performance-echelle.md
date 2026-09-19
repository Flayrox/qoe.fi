# ⚡ A3 — Performance & échelle

> **But :** que la vitesse soit une propriété **mesurée et tenue**, pas une impression.
> **Porte de sortie de l'axe :** budgets chiffrés (API, web, mobile, DB, images)
> vérifiés automatiquement en CI, et aucune requête N+1 sur les listes publiques.

**État actuel :** aucune mesure continue. Points de vigilance connus : conteneurs Node
limités (studio 768 Mo — un upload lourd peut OOM), `next/image` dépendant de `sharp`
(corrigé côté build), pipeline d'images sur 3 routes dupliquées, `apps/api` sans cache
explicite sur les listes chaudes (feed, home/config), Meilisearch et Redis non mesurés.

**Périmètre principal :** `apps/api/internal/**`, `apps/api/sql/**`, `apps/*/src/**`, `packages/**`, `docker-compose.yml`.

| # | Lot | Fichiers | Sortie vérifiable | Taille |
| --- | --- | --- | --- | --- |
| 3.1 | Instrumenter d'abord : latence p50/p95/p99 par route Go (middleware) | `apps/api/internal/middleware/**` | endpoint de métriques expose les percentiles | M |
| 3.2 | Idem côté Next : durée serveur des routes et server actions clés | `apps/*/src/**`, middleware | métriques visibles par route | M |
| 3.3 | Audit N+1 sur toutes les listes (`feed`, `articles`, `media`, `conversations`, `collaborations`) | handlers + `sql/queries/*.sql` | chaque liste = nombre de requêtes constant (assertion de test) | L |
| 3.4 | Audit index : requêtes lentes (`pg_stat_statements`) → index manquants | `apps/api/sql/migrations` | chaque requête > 50 ms a un index ou une justification écrite | M |
| 3.5 | Pagination par curseur **partout** (fin des `offset` sur les grosses tables) | handlers + SDK | aucune liste publique en offset | L |
| 3.6 | Cache Redis des lectures chaudes (home/config, catégories, profils publics) avec invalidation écrite | `apps/api/internal/**`, Redis | p95 divisé par ≥ 3 sur ces routes, invalidation testée | M |
| 3.7 | En-têtes de cache/CDN sur les réponses publiques et les assets | Caddyfile, routes Next, storage | `Cache-Control`/`ETag` corrects, vérifiés par test | M |
| 3.8 | Budgets Web Vitals sur 6 pages clés (LCP, CLS, INP) | `apps/core`, `apps/tenants`, `apps/studio` | budget dépassé = CI rouge (Lighthouse CI) | M |
| 3.9 | Audit du poids JS par page (analyseur de bundle) et suppression des imports lourds | `apps/*/src/**` | budget de bundle par route, dépassement bloquant | L |
| 3.10 | Images : variantes responsives + formats modernes + poids cible | pipeline d'upload, `next/image` | aucune image servie > 300 Ko hors exception justifiée | M |
| 3.11 | Mémoire des conteneurs Node : mesurer, plafonner, prévenir l'OOM (uploads, build) | `docker-compose.yml`, routes d'upload | test d'upload volumineux ne tue pas le conteneur | M |
| 3.12 | Go : profils pprof sur les routes chaudes, suppression des allocations voyantes | `apps/api/internal/**` | au moins 3 hotspots corrigés et mesurés | M |
| 3.13 | Meilisearch : mesure de latence d'indexation et de recherche, taille d'index | worker `search.go`, index | recherche p95 sous budget, taille d'index suivie | M |
| 3.14 | Cold start : temps de démarrage des conteneurs et de la première requête | images Docker | démarrage sous budget, healthcheck réaliste | S |
| 3.15 | Coût du CI/du build : durée de `turbo build` et des workflows, cache | `turbo.json`, workflows | durée de run suivie, cache effectif mesuré | S |
| 3.16 | Mobile : démarrage à froid, taille du bundle, FPS des listes longues | `apps/mobile/**` | mesures versionnées + seuils | M |

**Anti-collision :** cet axe touche `apps/api/internal/**` et les SQL → il ne doit **pas**
tourner en même temps que A4 sur les mêmes modules. Prérequis : lots 1.13 (charge) et 3.1-3.2
(instrumentation), car « on n'optimise que ce qu'on mesure ».

**Reprise à froid :** commencer par 3.1, 3.2, 3.4 : mesurer, puis les index, puis le cache.

# 🏗️ A4 — Refonte, simplification, cohérence

> **But :** que le code se lise comme un seul projet, pas comme dix contributions.
> **Porte de sortie de l'axe :** aucun doublon fonctionnel connu, aucun code mort,
> un seul style d'erreur/réponse par couche, et une documentation API qui décrit
> **tout** ce qui est exposé.

**État actuel :** dette non marquée (4 `TODO` seulement). Faits relevés : trois routes
d'upload qui réimplémentent la même logique d'appel, deux modèles `sharp`/libvips dans
l'arbre, migrations Go + `schema.sql` à garder synchrones à la main, `docs/openapi/*.yaml`
qui **ne documente ni `collaborations` ni `media`**, un script temporaire non tracké, et
des conventions d'erreur différentes selon les modules (helpers `response.*` vs `writeError`
locaux).

**Périmètre principal :** `apps/api/internal/**`, `packages/**`, `apps/*/src/**`, `docs/**`.

| # | Lot | Fichiers | Sortie vérifiable | Taille |
| --- | --- | --- | --- | --- |
| 4.1 | Cartographie de la dette : modules, tailles, dépendances croisées, doublons | `docs/LICORNE_2027/annexe-architecture.md` (nouveau) | carte lisible + liste de doublons nommés | M |
| 4.2 | Détecter le code mort et les dépendances inutilisées (outillage) | racine + `packages/**` | liste versionnée, puis suppression par lots | M |
| 4.3 | Trancher sur les scripts temporaires (dont `scripts/tmp-embed-lassez.mjs`, laissé non tracké à dessein le 19/09) et nettoyer le reste | `scripts/**` | `git status` propre, aucun fichier temporaire non justifié | S |
| 4.4 | Unifier les réponses d'erreur de l'API Go (un seul helper, un seul format) | `apps/api/internal/**` | un seul chemin d'écriture d'erreur, tests de format | L |
| 4.5 | Unifier les helpers de réponse (listes, pagination, enveloppe) | `apps/api/internal/response/**` | aucune réponse construite à la main hors helper | M |
| 4.6 | Unifier les middlewares d'authentification (3 modes) en un seul composant documenté | `apps/api/internal/middleware/auth*.go` | matrice de modes testée, un seul point d'entrée | L |
| 4.7 | Factoriser la pipeline d'upload des 3 routes Next en un handler partagé | `apps/{studio,core,tenants}/src/app/api/**` | une seule implémentation, 3 points d'entrée fins | M |
| 4.8 | Unifier la logique des liens d'invitation (articles ↔ médias) | `apps/api/internal/{collaborations,media}` | un seul modèle de statut de lien (actif/expiré/épuisé/révoqué) | M |
| 4.9 | Découper les services Go les plus gros (> 800 lignes) en unités testables | `apps/api/internal/modules/**` | aucun service au-delà du seuil, tests inchangés | L |
| 4.10 | Découper les composants React les plus gros (> 600 lignes) en sous-composants testables | `apps/*/src/**` | idem, sans changement visuel | L |
| 4.11 | Contrats partagés : source unique pour les DTO entre Go, SDK et apps | `packages/sdk`, `docs/openapi/**` | un changement de contrat casse la CI s'il n'est pas propagé | L |
| 4.12 | **Compléter l'OpenAPI** : documenter `collaborations` et `media` intégralement | `docs/openapi/app-api.yaml`, `creators-api.yaml` | toute route exposée existe dans l'OpenAPI (gate automatique) | L |
| 4.13 | Mettre `docs/API_COMPLETE.md` à niveau (liens d'invitation, `@username`, révocations) | `docs/API_COMPLETE.md` | la doc reflète le code (vérifié par lecture croisée) | M |
| 4.14 | Cohérence des logs : un seul format, un seul vocabulaire, aucune PII | `apps/api/internal/**`, apps Next | un format unique vérifié par test | M |
| 4.15 | Nommage et conventions (DB `snake_case` vs Go/TS), documentés une fois pour toutes | nouveau `docs/CONVENTIONS.md` | conventions écrites, écarts listés et corrigés par lots | M |

**Anti-collision :** cet axe est **le plus structurant** : il doit se faire module par
module, jamais en même temps que A2/A3 sur le même module.

**Reprise à froid :** 4.1 → 4.3 (nettoyage immédiat, gain visible), puis 4.12-4.13
(docs, attente expresse de l'utilisateur), puis les unifications.

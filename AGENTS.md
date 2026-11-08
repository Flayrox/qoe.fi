# qoe.fi — repères pour les agents

## Mémoire du chantier

Ce repo tient sa mémoire dans des fichiers versionnés. **Lis-les avant de coder, mets-les à jour après.**

| Fichier                                  | Contenu                                                 |
| ---------------------------------------- | ------------------------------------------------------- |
| `docs/roadmap/README.md`                 | Backlog vivant : index, priorités, statuts, IDs stables |
| `docs/roadmap/01-architecture-dette.md`  | God-files, duplication Go↔TS, frontières de packages    |
| `docs/roadmap/02-runtime-scalabilite.md` | Pagination, cache, pool, observabilité, readiness       |
| `docs/roadmap/03-ci-dx-deploiement.md`   | Turbo, CI, branches, staging, déploiement               |
| `docs/roadmap/04-data-schema.md`         | Schéma, migrations, index, partitionnement              |
| `docs/roadmap/05-produit-gaps.md`        | Ce qui manque pour un vrai réseau social                |
| `docs/roadmap/06-ui-system.md`           | UI lab, budget de dette, design system                  |
| `apps/admin/ADMIN-PLAN.md`               | Plan vivant de la console admin                         |

## Architecture en une page

- **Backend** : `apps/api` (Go, chi + pgx + sqlc + asynq + pgvector, migrations goose dans `apps/api/sql/migrations`). C'est la **source de vérité** métier.
- **Front** : `apps/core` (lecteur), `apps/studio` (créateur), `apps/admin` (ops), `apps/tenants` (publications multi-tenant), `apps/hi` (vitrine), `apps/mobile` (Expo).
- **Partagé** : `packages/sdk` (server actions → proxy vers Go), `packages/ui` (design system), `packages/supabase` (auth), `packages/auth`, `packages/flags`, `packages/observability`.
- **Temps réel** : `apps/collab-server` (Yjs, édition collaborative uniquement).

## Commandes utiles

```bash
pnpm dev                 # copie .env + compile i18n + turbo dev
pnpm typecheck           # tsc sur tout le workspace
pnpm lint
pnpm test                # vitest
pnpm test:api            # Go + Postgres partagé (docker)
pnpm e2e                 # Playwright
pnpm db:migrate          # goose up (apps/api)
pnpm ui:audit            # ratchet de dette UI
pnpm ui:catalog          # régénère le catalogue du UI lab
```

## Conventions

- Go est la source de vérité : ne pas réimplémenter une règle métier côté TS.
- Toute route protégée passe par `CombinedAuth` + le garde de capacité admin ; ne jamais retirer un `requireCapability`.
- Les migrations sont rejouables from scratch (`goose`), jamais de delta manuel.
- Les guards CI (`guard:seed-script`, `guard:legal-consent`, `ui:audit`, coverage gates) ne se contournent pas : on corrige la cause.
- Commentaires et messages en français, style existant.

## Règle de mise à jour du backlog

Quand tu identifies ou traites une amélioration :

1. Cherche un ID existant (`ARCH-`, `RUN-`, `DATA-`, `CI-`, `PROD-`, `UI-`) dans `docs/roadmap/`.
2. Si elle existe, mets à jour son **statut** et la date, pas son ID.
3. Sinon, ajoute-la dans le fichier thématique + la table de `README.md`.
4. Un item terminé passe en `✅ fait (date)` avec le commit/PR en référence — on ne le supprime pas.

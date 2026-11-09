# qoe.fi — repères pour les agents

## Mémoire du chantier

Ce repo tient sa mémoire dans des plans vivants versionnés. **Lis-les avant de coder, mets-les à jour après.**

| Fichier                                  | Contenu                                                 |
| ---------------------------------------- | ------------------------------------------------------- |
| `apps/admin/ADMIN-PLAN.md`               | Plan vivant de la console admin                         |
| `apps/studio/EDITOR-PLAN.md`             | Plan vivant de l’éditeur studio                         |

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
- Les guards CI (`guard:seed-script`, `guard:legal-consent`, `ui:audit`, `arch:audit`, coverage gates) ne se contournent pas : on corrige la cause.
- Commentaires et messages en français, style existant.

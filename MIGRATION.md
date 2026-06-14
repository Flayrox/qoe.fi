# 🔄 Guide de migration — Monorepo qoe.fi

> Ce document trace l'état de la migration du monolithe Next.js vers un monorepo Turborepo (apps/web, apps/console, apps/api, workers, packages/*).

---

## ✅ Ce qui est FAIT (Phases 0-2)

### Phase 0 — Setup monorepo
- ✅ `pnpm-workspace.yaml` + `turbo.json` + `.npmrc`
- ✅ Structure `apps/` (3 apps + 1 workers) et `packages/` (10 packages)
- ✅ README monorepo complet
- ✅ `.gitignore` adapté

### Phase 1 — 10 packages partagés
- ✅ [`packages/tsconfig/`](packages/tsconfig/) — 4 configs TS partagées
- ✅ [`packages/config/`](packages/config/) — env zod, constants, feature flags
- ✅ [`packages/utils/`](packages/utils/) — cn, format, slugify, validation
- ✅ [`packages/db/`](packages/db/) — Prisma client + 3 repositories (articles, users, posts)
- ✅ [`packages/supabase/`](packages/supabase/) — 3 clients (browser, server, middleware)
- ✅ [`packages/ui/`](packages/ui/) — tokens, Button, Card (shadcn)
- ✅ [`packages/i18n/`](packages/i18n/) — Tolgee unifié, locales, provider
- ✅ [`packages/auth/`](packages/auth/) — roles, permissions, current-user
- ✅ [`packages/billing/`](packages/billing/) — Stripe, plans, webhooks
- ✅ [`packages/analytics/`](packages/analytics/) — Umami + events typés

### Phase 2 — `apps/web/` créé
- ✅ [`apps/web/`](apps/web/) — Structure Next.js pour le public
- ✅ [`apps/web/src/app/start/page.tsx`](apps/web/src/app/start/page.tsx) — Landing marketing
- ✅ [`apps/web/src/app/tenant/[domain]/page.tsx`](apps/web/src/app/tenant/[domain]/page.tsx) — Home tenant (réécrit avec @qoe/db)
- ✅ [`apps/web/src/app/tenant/[domain]/article/[slug]/`](apps/web/src/app/tenant/[domain]/article/[slug]/page.tsx) — Lecture article (réexport)
- ✅ [`apps/web/src/app/api/articles/upload/route.ts`](apps/web/src/app/api/articles/upload/route.ts) — Upload images (réécrit avec @qoe/supabase)
- ✅ [`apps/web/src/app/sitemap.ts`](apps/web/src/app/sitemap.ts) + [`robots.ts`](apps/web/src/app/robots.ts) — SEO
- ✅ [`apps/web/src/components/landing/`](apps/web/src/components/landing/) — 11 sections (réexports)
- ✅ [`apps/web/src/config/landing.ts`](apps/web/src/config/landing.ts) — Config landing

### Phase 3 — `apps/console/` créé
- ✅ [`apps/console/package.json`](apps/console/package.json) — Toutes les deps
- ✅ [`apps/console/middleware.ts`](apps/console/middleware.ts) — **NOUVEAU** middleware simple (auth + dispatch par host)
- ✅ [`apps/console/src/app/layout.tsx`](apps/console/src/app/layout.tsx) — Root layout console
- ✅ [`apps/console/src/app/page.tsx`](apps/console/src/app/page.tsx) — **NOUVEAU** branche public/auth (Substack-style)
- ✅ [`apps/console/src/components/feed/PublicFeedPreview.tsx`](apps/console/src/components/feed/PublicFeedPreview.tsx) — **NOUVEAU** feed preview pour anonymes
- ✅ [`apps/console/src/app/login/`](apps/console/src/app/login/) — Login + form + actions
- ✅ [`apps/console/src/app/auth/callback/`](apps/console/src/app/auth/callback/) — OAuth callback
- ✅ [`apps/console/src/app/(reader)/`](apps/console/src/app/(reader)/) — 5 routes lecteur (library, highlights, billing, settings, onboarding)
- ✅ [`apps/console/src/app/(creator)/dashboard/`](apps/console/src/app/(creator)/dashboard/) — Dashboard créateur complet (5 routes + sub-routes)
- ✅ [`apps/console/src/app/(admin)/admin/`](apps/console/src/app/(admin)/admin/) — Admin plateforme complet (4 sections)
- ✅ [`apps/console/src/components/`](apps/console/src/components/) — layout, admin, feed (tous ré-exports)
- ✅ [`apps/console/src/features/editor/`](apps/console/src/features/editor/) — TipTap + PaywallDivider
- ✅ [`apps/console/src/lib/`](apps/console/src/lib/) — db, supabase, utils, i18n (ré-exports)
- ✅ **Fix de sécurité** : layout `(creator)/dashboard/` vérifie maintenant `isCreator` (bug P7 de l'audit corrigé)
- ✅ **Refactor clé** : `apps/console/src/app/page.tsx` fait maintenant la branche public/auth (Substack/Twitter-style home)

### Apps placeholders
- ✅ [`apps/console/`](apps/console/) — Next.js auth (placeholder)
- ✅ [`apps/api/`](apps/api/) — Hono backend (placeholder)
- ✅ [`workers/`](workers/) — BullMQ workers (placeholder)

---

## 🔄 Stratégie de migration : "Strangler Fig"

Pour ne **rien casser**, on utilise le pattern **Strangler Fig** :
- L'ancien code dans `src/` continue de tourner à 100%
- On crée des **ré-exports** dans `apps/web/src/components/landing/` qui pointent vers `src/components/sections/`
- Pareil pour les pages, actions, etc.
- **Phase 8 (cleanup)** : on copiera physiquement les fichiers et supprimera l'ancien `src/components/sections/`

### Avantages
- ✅ Aucune régression possible pendant la migration
- ✅ Tu peux tester l'app `web` indépendamment à tout moment
- ✅ La migration est réversible (on peut rollback en supprimant les réexports)

### Inconvénients
- ⚠️ Imports relatifs moches (`../../../../../../src/...`) → résolus en Phase 8
- ⚠️ Code dupliqué conceptuellement (mais pas physiquement)

---

## 📋 Ce qu'il RESTE à faire (Phases 3-8)

### Phase 3 — `apps/console/` (Refactor home feed public/auth)
- [ ] Migrer `src/app/(main)/` → `apps/console/src/app/(reader)/`
- [ ] Migrer `src/app/(dashboard)/` → `apps/console/src/app/(creator)/dashboard/`
- [ ] Migrer `src/app/(admin)/` → `apps/console/src/app/(admin)/admin/`
- [ ] Migrer `src/app/login/` + `src/app/auth/` → `apps/console/src/app/`
- [ ] **Refactor majeur** : `src/app/page.tsx` → branche auth/no-auth (feed public vs personnalisé)
- [ ] Refactor middleware : juste auth + dispatch par host
- [ ] Déplacer `src/components/layout/AppSidebar.tsx` + `MainContentWrapper.tsx` → `apps/console/`
- [ ] Déplacer `src/features/editor/` + `src/features/dashboard/` → `apps/console/`
- [ ] Déplacer `src/components/social/LinkPreview.tsx` → `apps/console/`
- [ ] Tester : login + home (anonyme) + home (connecté) + library + admin + dashboard

### Phase 4 — `apps/api/` (Backend Hono)
- [ ] Choisir : Hono + tRPC, ou tRPC pur
- [ ] Routes : articles, users, posts, subscriptions, webhooks
- [ ] Middleware : auth, rate limit, CORS
- [ ] OpenAPI spec auto-générée
- [ ] Migrer progressivement les Server Actions vers des appels API

### Phase 5 — `workers/` (Background jobs)
- [ ] Setup Redis + BullMQ
- [ ] Worker `embeddings` (pgvector)
- [ ] Worker `emails` (newsletters, notifications)
- [ ] Worker `billing` (Stripe webhooks async)
- [ ] Worker `search` (Meilisearch)
- [ ] Bull Board UI

### Phase 6 — Docker multi-services
- [ ] Dockerfile multi-target (build web, console, api, worker depuis le même Dockerfile)
- [ ] `docker-compose.yml` avec 7+ services
- [ ] Caddyfile multi-domaine (start.qoe.fi, dashboard.qoe.fi, admin.qoe.fi, api.qoe.fi, qoe.fi, *.qoe.fi)
- [ ] Network isolation (qoefi-public vs qoefi-private)
- [ ] `docker-compose.dev.yml` avec HMR
- [ ] Healthchecks + resource limits
- [ ] Backup Postgres

### Phase 7 — CI/CD
- [ ] GitHub Actions (lint, typecheck, test)
- [ ] Build images Docker + push registry
- [ ] Déploiement SSH auto

### Phase 8 — Cleanup final + DNS + prod
- [ ] Copier physiquement les fichiers de `src/` vers `apps/*/src/`
- [ ] Supprimer `src/components/sections/`, `src/app/(main)/`, `src/app/(dashboard)/`, `src/app/(admin)/`, `src/app/tenant/`, `src/app/[locale]/`
- [ ] DNS : `start.qoe.fi`, `dashboard.qoe.fi`, `admin.qoe.fi`, `api.qoe.fi`
- [ ] Cloudflare devant
- [ ] Sentry + Uptime Kuma
- [ ] Premier déploiement prod

---

## 🛠️ Comment tester l'app web maintenant

⚠️ **L'app web n'est pas encore activée** (le `package.json` racine contient encore l'ancien monolithe). Pour la tester en isolation :

1. Installer pnpm : `npm install -g pnpm`
2. À la racine : `pnpm install` (installe tous les workspaces)
3. `cd apps/web && pnpm dev` (lance le dev server de web sur port 3001)

> ⚠️ **ATTENTION** : l'ancien `src/` à la racine utilise le même Prisma client. Si tu fais `pnpm install` à la racine, il va voir deux `package.json` (le racine + ceux des workspaces) et tu auras des conflits.

**Recommandation** : ne pas activer le monorepo tout de suite. Attendre la Phase 3 (migration de `console`) pour basculer. D'ici là, garde l'ancien `package.json` racine et l'ancien `src/`.

---

## 📊 Métriques de progression

| Phase | Status | Fichiers touchés | Lignes de code |
|-------|--------|------------------|----------------|
| 0 — Setup | ✅ | 9 créés | ~500 |
| 1 — Packages | ✅ | 30+ créés | ~2000 |
| 2 — apps/web | ✅ | 20+ créés | ~1500 |
| 3 — apps/console | 🔜 | ~30 à migrer | ~3000 |
| 4 — apps/api | 🔜 | ~15 à créer | ~1500 |
| 5 — workers | 🔜 | ~10 à créer | ~800 |
| 6 — Docker | 🔜 | 5 à modifier | ~500 |
| 7 — CI/CD | 🔜 | 3 à créer | ~300 |
| 8 — Cleanup + prod | 🔜 | ~50 à migrer + DNS | ~3000 |

**Total estimé** : 4-6 semaines de travail (temps partiel).

---

## 🎯 Décisions architecturales clés

### Pourquoi un seul dossier `src/` temporairement ?
- Aucun risque de casser l'existant
- Tu peux commit/rollback en 1 clic
- Pas de duplication physique de code

### Pourquoi @qoe/* (préfixe) ?
- Évite les collisions avec des packages npm classiques
- Clair dans les imports : `import { Button } from "@qoe/ui/button"`
- Convention monorepo moderne (vercel/turborepo examples)

### Pourquoi des sous-dossiers par feature dans packages/ ?
- `packages/db/src/repositories/articles.ts` = 1 fichier = 1 sujet
- Pas de god-file `db/index.ts` de 5000 lignes
- Tests ciblés par feature

### Pourquoi réutiliser globals.css et le layout depuis src/ ?
- Évite de dupliquer Tailwind config
- 1 seule source de vérité pour le design system
- Migration finale = juste déplacer le fichier

---

**Prochaine étape** : Phase 3 (migrer console + refactor home feed public/auth). Valide quand tu es prêt ! 🚀
